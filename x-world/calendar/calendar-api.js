(() => {
  'use strict';

  let cloudApp = null;

  function loadSdk() {
    if (window.cloudbase) return Promise.resolve();
    const config = window.SHEX_CLOUDBASE_CONFIG || {};
    const src = config.sdkUrl || 'https://static.cloudbase.net/cloudbase-js-sdk/2.9.0/cloudbase.full.js';
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${src}"]`);
      if (existing) {
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', () => reject(new Error('CloudBase SDK 加载失败')), { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error('CloudBase SDK 加载失败'));
      document.head.appendChild(script);
    });
  }

  async function getCloudApp() {
    if (cloudApp) return cloudApp;
    const config = window.SHEX_CLOUDBASE_CONFIG || {};
    if (!config.envId) throw new Error('CloudBase 环境未配置');
    await loadSdk();
    cloudApp = window.cloudbase.init({ env: config.envId, region: config.region || 'ap-shanghai', timeout: 15000 });
    const auth = cloudApp.auth({ persistence: 'local' });
    const state = await auth.getLoginState();
    if (!state && typeof auth.signInAnonymously === 'function') await auth.signInAnonymously();
    else if (!state && typeof auth.anonymousAuthProvider === 'function') await auth.anonymousAuthProvider().signIn();
    return cloudApp;
  }

  function credentials() {
    const current = window.SHEXAuth?.current?.();
    if (!current?.userId || !current?.sessionToken) throw new Error('登录状态已失效，请重新登录');
    return { userId: current.userId, sessionToken: current.sessionToken };
  }

  function cloneCalendar(value) {
    return JSON.parse(JSON.stringify(value && typeof value === 'object' ? value : {}));
  }

  function calendarForCloud(value) {
    const calendar = cloneCalendar(value);
    Object.values(calendar.moods || {}).forEach((rows) => {
      if (!rows || typeof rows !== 'object' || Array.isArray(rows)) return;
      Object.keys(rows).forEach((date) => {
        const row = rows[date];
        if (!row || typeof row !== 'object' || Array.isArray(row)) return;
        delete row.partner;
        if (!row.mine) delete rows[date];
      });
    });
    return calendar;
  }

  function chinaDateKey(timestamp = Date.now()) {
    return new Date(Number(timestamp || Date.now()) + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
  }

  function shouldGenerateDreamPlan(calendar, dreamId, timestamp = Date.now()) {
    const setting = calendar?.dreamPlanSettings?.[dreamId] || {};
    if (setting.enabled !== true) return false;
    const today = chinaDateKey(timestamp);
    if (String(setting.lastGeneratedDate || '') === today) return false;
    const nextEligibleDate = String(setting.nextEligibleDate || '');
    return !nextEligibleDate || nextEligibleDate <= today;
  }

  async function call(action, payload = {}, explicitCredentials = null) {
    const app = await getCloudApp();
    const timeout = action === 'maybeGenerateDreamPlan' ? 65000 : 15000;
    const auth = explicitCredentials || credentials();
    const response = await app.callFunction({ name: 'shexCalendar', data: { action, ...payload, ...auth }, timeout });
    const result = response?.result || response || {};
    if (!result.ok && !result.success) {
      const error = new Error(result.message || '日历同步暂时不可用');
      error.code = result.code || 'CALENDAR_SYNC_FAILED';
      throw error;
    }
    return result;
  }

  function connect(instance, options = {}) {
    if (!instance) return null;
    const initialCredentials = credentials();
    const ownerUserId = String(options.ownerUserId || initialCredentials.userId);
    if (ownerUserId !== String(initialCredentials.userId)) throw new Error('日历连接账号与当前登录账号不一致');
    const localCache = window.SHEXCalendarLocalCache;
    const pendingOps = window.SHEXCalendarPendingOps;
    const storage = options.storage || window.localStorage;
    if (!localCache?.buildEnvelope || !pendingOps?.enqueue || !storage) throw new Error('日历本机安全存储模块尚未加载');
    const compactCacheKey = localCache.cacheKey(ownerUserId);
    const legacyCacheKey = localCache.legacyCacheKey(ownerUserId);
    const pendingQueueKey = pendingOps.queueKey(ownerUserId);
    let saveTimer = 0;
    let retryTimer = 0;
    let latestData = cloneCalendar(instance.data);
    let baseCalendar = null;
    let revision = null;
    let changeSequence = 0;
    let latestQueuedSequence = 0;
    let dirty = false;
    let saveChain = Promise.resolve();
    let disposed = false;
    let authorityState = 'loading';
    let loadGeneration = 0;
    let loadPromise = null;
    let dream = options.dream || {};
    let lastNetworkSaveAttemptAt = 0;
    let operationCounter = 0;
    let pendingQueue = pendingOps.emptyQueue(ownerUserId);
    let pendingQueueHealthy = true;
    let pendingQueueError = '';

    const connectionError = (code, message) => {
      const error = new Error(message);
      error.code = code;
      return error;
    };

    const readStorage = (key) => {
      try { return storage.getItem(key); } catch (_) { return null; }
    };

    const writeExact = (key, serialized, previousSerialized = readStorage(key)) => {
      try {
        storage.setItem(key, serialized);
        if (storage.getItem(key) === serialized) return true;
      } catch (_) {}
      try {
        if (previousSerialized === null) storage.removeItem(key);
        else storage.setItem(key, previousSerialized);
      } catch (_) {}
      return false;
    };

    const loadPendingQueue = () => {
      const serialized = readStorage(pendingQueueKey);
      if (serialized === null) return;
      const parsed = pendingOps.parseQueue(serialized, ownerUserId);
      if (!parsed.ok) {
        pendingQueueHealthy = false;
        pendingQueueError = '本机日历待保存记录无法读取，为避免覆盖数据已暂停编辑';
        return;
      }
      pendingQueue = parsed.queue;
      const normalizedSerialized = JSON.stringify(parsed.queue);
      if (normalizedSerialized !== serialized && !writeExact(pendingQueueKey, normalizedSerialized, serialized)) {
        pendingQueueHealthy = false;
        pendingQueueError = '本机日历待保存记录无法安全更新，为避免丢失已暂停编辑';
      }
    };

    const persistPendingQueue = (nextQueue) => {
      const serialized = JSON.stringify(nextQueue);
      if (readStorage(pendingQueueKey) === serialized) return true;
      return writeExact(pendingQueueKey, serialized);
    };

    const writeCompactCache = (calendar, metadata = {}, { cleanupLegacy = true } = {}) => {
      const built = localCache.buildEnvelope(calendar, {
        ownerUserId,
        sourceRevision: metadata.revision,
        sourceUpdatedAt: metadata.updatedAt
      });
      if (!built.ok) {
        try { storage.removeItem(compactCacheKey); } catch (_) {}
        return { ok: false, reason: built.reason || 'cache_build_failed' };
      }
      const previous = readStorage(compactCacheKey);
      const parsedPrevious = previous === null ? null : localCache.parseEnvelope(previous, { ownerUserId });
      const unchanged = parsedPrevious?.ok
        && Number(parsedPrevious.envelope.sourceRevision || 0) === Number(built.envelope.sourceRevision || 0)
        && Number(parsedPrevious.envelope.sourceUpdatedAt || 0) === Number(built.envelope.sourceUpdatedAt || 0)
        && parsedPrevious.envelope.historyStart === built.envelope.historyStart
        && JSON.stringify(parsedPrevious.envelope.calendar) === JSON.stringify(built.envelope.calendar);
      let verified = false;
      if (unchanged) verified = true;
      else if (writeExact(compactCacheKey, built.serialized, previous)) {
        verified = localCache.verifyReadback(readStorage(compactCacheKey), built.serialized, {
          ownerUserId,
          sourceRevision: built.envelope.sourceRevision
        }).ok;
      }
      if (!verified) return { ok: false, reason: 'cache_write_failed' };
      if (cleanupLegacy) {
        try { storage.removeItem(legacyCacheKey); } catch (_) {}
      }
      return { ok: true, skipped: unchanged, bytes: unchanged ? localCache.serializedBytes(previous) : built.bytes };
    };

    loadPendingQueue();

    const currentOwnedCredentials = () => {
      if (disposed) throw connectionError('CALENDAR_CONNECTION_DISPOSED', '日历连接已经关闭');
      const auth = credentials();
      if (String(auth.userId) !== ownerUserId) throw connectionError('CALENDAR_OWNER_CHANGED', '登录账号已经变化');
      return auth;
    };

    const ensureCurrentOwner = () => {
      if (disposed) throw connectionError('CALENDAR_CONNECTION_DISPOSED', '日历连接已经关闭');
      const current = window.SHEXAuth?.current?.();
      if (!current?.userId || String(current.userId) !== ownerUserId) throw connectionError('CALENDAR_OWNER_CHANGED', '登录账号已经变化');
    };

    const ownedCall = async (action, payload = {}) => {
      const auth = currentOwnedCredentials();
      const result = await call(action, payload, auth);
      ensureCurrentOwner();
      return result;
    };

    const setAuthorityState = (state, message = '') => {
      if (disposed) return;
      authorityState = state;
      instance.setAuthorityState?.(state, { message });
    };

    const isAuthorityReady = () => ['authoritative_ready', 'empty_ready', 'legacy_bootstrap_ready'].includes(authorityState);

    const nextOperationId = () => {
      operationCounter += 1;
      const uuid = window.crypto?.randomUUID?.();
      return uuid ? `calop-${uuid}` : `calop-${ownerUserId}-${Date.now()}-${operationCounter}`;
    };

    const beforeMutation = (operationValue = {}) => {
      if (!isAuthorityReady() || revision === null || disposed) {
        return { ok: false, message: '云端日历尚未确认，暂时不能修改' };
      }
      if (!pendingQueueHealthy) return { ok: false, message: pendingQueueError };
      const createdAt = Date.now();
      const result = pendingOps.enqueue(pendingQueue, {
        ...operationValue,
        operationId: operationValue.operationId || nextOperationId(),
        ownerUserId,
        baseRevision: revision,
        createdAt
      }, { ownerUserId, now: createdAt });
      if (!result.ok) {
        const message = ['operation_limit', 'byte_limit'].includes(result.reason)
          ? '本机还有较多日历修改没有同步，请联网同步成功后再继续编辑'
          : '这次日历修改无法写入本机安全队列，已停止修改';
        return { ok: false, message };
      }
      if (!persistPendingQueue(result.queue)) {
        return { ok: false, message: '本机存储空间不足，这次修改没有执行' };
      }
      pendingQueue = result.queue;
      return { ok: true, operation: result.operation || operationValue };
    };

    instance.onBeforeMutation = beforeMutation;

    const replayPendingCalendar = (calendar) => {
      if (!pendingQueueHealthy) return { ok: false, calendar: cloneCalendar(calendar), appliedCount: 0 };
      const replayed = pendingOps.replay(calendar, pendingQueue, { ownerUserId });
      if (!replayed.ok) {
        pendingQueueHealthy = false;
        pendingQueueError = '本机日历待保存记录无法恢复，为避免覆盖数据已暂停编辑';
        return { ok: false, calendar: cloneCalendar(calendar), appliedCount: 0 };
      }
      return replayed;
    };

    const acknowledgePendingThrough = (throughSequence) => {
      if (!pendingQueueHealthy || !Number.isFinite(Number(throughSequence)) || Number(throughSequence) <= 0) return true;
      const result = pendingOps.acknowledge(pendingQueue, throughSequence, { ownerUserId });
      if (!result.ok || !persistPendingQueue(result.queue)) return false;
      pendingQueue = result.queue;
      return true;
    };

    const acceptCloudCalendar = (result, { replace = true } = {}) => {
      ensureCurrentOwner();
      if (!result?.calendar || typeof result.calendar !== 'object') return result;
      const receivedCalendar = cloneCalendar(result.calendar);
      const cleanCloudCalendar = calendarForCloud(receivedCalendar);
      revision = Math.max(0, Number(result.revision || 0));
      baseCalendar = cloneCalendar(cleanCloudCalendar);
      latestData = cloneCalendar(cleanCloudCalendar);
      if (replace) {
        instance.replaceData(cloneCalendar(cleanCloudCalendar), dream);
        const hydrated = cloneCalendar(instance.data);
        latestData = hydrated;
      }
      if (result.overlapResolved === true) instance.toast('另一台设备也改了同一项，已保留本次保存内容');
      return result;
    };

    const queueSave = () => {
      window.clearTimeout(saveTimer);
      if (!dirty) return saveChain;
      if (!isAuthorityReady() || baseCalendar === null || revision === null) {
        return Promise.reject(connectionError('CALENDAR_AUTHORITY_NOT_READY', '云端日历尚未确认，暂时不能保存'));
      }
      const capturedSequence = changeSequence;
      const capturedCalendar = calendarForCloud(latestData);
      const capturedBase = calendarForCloud(baseCalendar);
      const capturedRevision = revision;
      const capturedPendingThrough = pendingQueue.operations.reduce((max, operation) => Math.max(max, Number(operation.sequence || 0)), 0);
      latestQueuedSequence = Math.max(latestQueuedSequence, capturedSequence);
      dirty = false;
      const task = saveChain.catch(() => {}).then(async () => {
        lastNetworkSaveAttemptAt = Date.now();
        const result = await ownedCall('save', {
          calendar: capturedCalendar,
          baseCalendar: capturedBase,
          expectedRevision: capturedRevision
        });
        const cacheResult = writeCompactCache(result.calendar, result, { cleanupLegacy: true });
        if (!cacheResult.ok) instance.toast?.('云端已保存，但本机日历缓存暂时没有写入');
        if (capturedSequence === changeSequence && !dirty) acceptCloudCalendar(result);
        else {
          // Keep the old base for the next three-way merge. This preserves edits
          // made while the previous network request was in flight.
          if (latestQueuedSequence <= capturedSequence) dirty = true;
        }
        if (!acknowledgePendingThrough(capturedPendingThrough)) {
          instance.toast?.('云端已保存，本机待保存标记将在下次继续核对');
        }
        return result;
      }).catch(error => {
        if (!disposed && error?.code !== 'CALENDAR_OWNER_CHANGED' && error?.code !== 'CALENDAR_CONNECTION_DISPOSED' && latestQueuedSequence <= capturedSequence) dirty = true;
        if (error?.code === 'CALENDAR_VERSION_REQUIRED') instance.toast('日历已在别处更新，本机内容没有覆盖云端');
        console.warn('[SHEX_CALENDAR_SAVE]', error);
        throw error;
      });
      saveChain = task.catch(() => {});
      return task;
    };

    const save = data => {
      if (!isAuthorityReady() || disposed) {
        instance.toast?.('云端日历尚未确认，本次修改没有提交');
        return false;
      }
      latestData = cloneCalendar(data);
      changeSequence += 1;
      dirty = true;
      window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(() => queueSave().catch(() => {}), 450);
      return true;
    };
    instance.onChange = save;

    const applyCalendar = (result, { focusPlan = false } = {}) => {
      if (result?.calendar && typeof result.calendar === 'object') {
        acceptCloudCalendar(result);
        const cacheResult = writeCompactCache(result.calendar, result, { cleanupLegacy: true });
        if (!cacheResult.ok) instance.toast?.('云端日历已更新，但本机缓存暂时没有写入');
      }
      if (focusPlan && result?.plan?.date) {
        const parsed = String(result.plan.date).split('-').map(Number);
        instance.mode = 'plan';
        instance.selectedDate = result.plan.date;
        if (parsed.length === 3 && parsed.every(Number.isFinite)) {
          instance.viewYear = parsed[0];
          instance.viewMonth = parsed[1] - 1;
        }
        instance.render();
      }
      return result;
    };
    const maybeGenerate = async ({ silent = true } = {}) => {
      try {
        if (!isAuthorityReady()) throw connectionError('CALENDAR_AUTHORITY_NOT_READY', '云端日历尚未确认');
        await queueSave();
        const result = await ownedCall('maybeGenerateDreamPlan', { dreamId: dream.id });
        applyCalendar(result, { focusPlan: result.generated === true });
        return result;
      } catch (error) {
        if (!silent || error?.code === 'ENERGY_NOT_ENOUGH') instance.toast(error?.message || 'TA暂时没有写入新的计划');
        throw error;
      }
    };
    const setDreamPlanPermission = async (enabled, dreamId) => {
      if (!isAuthorityReady()) throw connectionError('CALENDAR_AUTHORITY_NOT_READY', '云端日历尚未确认，暂时不能修改');
      await queueSave();
      const result = await ownedCall('setDreamPlanPermission', { dreamId: dreamId || dream.id, enabled });
      applyCalendar(result);
      if (enabled && shouldGenerateDreamPlan(instance.data, dreamId || dream.id)) return await maybeGenerate({ silent: false });
      return result;
    };
    instance.onDreamPlanPermission = setDreamPlanPermission;

    const loadAuthority = () => {
      if (disposed) return Promise.reject(connectionError('CALENDAR_CONNECTION_DISPOSED', '日历连接已经关闭'));
      if (loadPromise) return loadPromise;
      const generation = ++loadGeneration;
      setAuthorityState('loading');
      const task = ownedCall('load').then(async result => {
        if (disposed || generation !== loadGeneration) throw connectionError('CALENDAR_STALE_RESPONSE', '已忽略过期的日历响应');
        if (result.calendar && typeof result.calendar === 'object') {
          acceptCloudCalendar(result, { replace: false });
          const replayed = replayPendingCalendar(baseCalendar);
          instance.replaceData(cloneCalendar(replayed.calendar), dream);
          latestData = cloneCalendar(instance.data);
          dirty = replayed.ok && replayed.appliedCount > 0;
          const cacheResult = writeCompactCache(result.calendar, result, { cleanupLegacy: true });
          if (!cacheResult.ok) instance.toast?.('云端日历已读取，但本机缓存暂时没有更新');
          if (!pendingQueueHealthy) {
            setAuthorityState('load_failed_readonly', pendingQueueError);
            return result;
          }
          setAuthorityState('authoritative_ready');
        } else {
          revision = 0;
          const canBootstrapLegacy = options.legacyCachePresent === true && options.previewSource === 'legacy';
          if (!canBootstrapLegacy) {
            instance.replaceData(cloneCalendar(options.emptyCalendar || {}), dream);
            if (options.previewSource === 'v2') instance.toast?.('云端没有找到完整日历，本机精简缓存不会被上传');
          }
          baseCalendar = calendarForCloud(instance.data);
          const replayed = replayPendingCalendar(baseCalendar);
          instance.replaceData(cloneCalendar(replayed.calendar), dream);
          latestData = cloneCalendar(instance.data);
          dirty = replayed.ok && replayed.appliedCount > 0;
          if (!pendingQueueHealthy) {
            setAuthorityState('load_failed_readonly', pendingQueueError);
            return result;
          }
          setAuthorityState(canBootstrapLegacy ? 'legacy_bootstrap_ready' : 'empty_ready');
          if (!canBootstrapLegacy && options.previewSource !== 'v2' && !dirty) {
            writeCompactCache(instance.data, { revision: 0, updatedAt: null }, { cleanupLegacy: false });
          }
        }
        if (dirty) await queueSave().catch(() => {});
        if (!dirty && shouldGenerateDreamPlan(instance.data, dream.id)) await maybeGenerate({ silent: true }).catch(() => {});
        return result;
      }).catch(error => {
        if (!disposed && generation === loadGeneration && !['CALENDAR_OWNER_CHANGED', 'CALENDAR_CONNECTION_DISPOSED', 'CALENDAR_STALE_RESPONSE'].includes(error?.code)) {
          setAuthorityState('load_failed_readonly', error?.message || '云端日历暂时没有加载成功，请稍后重试');
          console.warn('[SHEX_CALENDAR_LOAD]', error);
        }
        throw error;
      });
      loadPromise = task.finally(() => {
        if (generation === loadGeneration) loadPromise = null;
      });
      return loadPromise;
    };

    const retryLoad = () => loadAuthority();
    instance.onAuthorityRetry = retryLoad;
    loadAuthority().catch(() => {});

    const retryPendingSave = () => {
      if (disposed || !dirty || !isAuthorityReady()) return false;
      const elapsed = Date.now() - lastNetworkSaveAttemptAt;
      const remaining = Math.max(0, 30000 - elapsed);
      if (remaining > 0) {
        if (!retryTimer) {
          retryTimer = window.setTimeout(() => {
            retryTimer = 0;
            retryPendingSave();
          }, remaining);
        }
        return false;
      }
      queueSave().catch(() => {});
      return true;
    };
    const handleOnline = () => retryPendingSave();
    const handleVisibility = () => {
      if (!document.hidden && document.visibilityState !== 'hidden') retryPendingSave();
    };
    const handlePageHide = () => {
      if (!disposed && dirty && isAuthorityReady()) queueSave().catch(() => {});
    };
    window.addEventListener?.('online', handleOnline);
    window.addEventListener?.('pageshow', handleVisibility);
    window.addEventListener?.('pagehide', handlePageHide);
    document.addEventListener?.('visibilitychange', handleVisibility);

    return {
      ownerUserId,
      updateDream(nextDream) {
        ensureCurrentOwner();
        dream = nextDream || {};
        instance.setDream(dream);
        if (isAuthorityReady() && shouldGenerateDreamPlan(instance.data, dream.id)) maybeGenerate({ silent: true }).catch(() => {});
      },
      maybeGenerate,
      retryLoad,
      retryPendingSave,
      getAuthorityState() { return authorityState; },
      getPendingOperationCount() { return pendingQueue.operations.length; },
      isDisposed() { return disposed; },
      dispose() {
        if (disposed) return;
        disposed = true;
        loadGeneration += 1;
        window.clearTimeout(saveTimer);
        window.clearTimeout(retryTimer);
        window.removeEventListener?.('online', handleOnline);
        window.removeEventListener?.('pageshow', handleVisibility);
        window.removeEventListener?.('pagehide', handlePageHide);
        document.removeEventListener?.('visibilitychange', handleVisibility);
        if (instance.onChange === save) instance.onChange = null;
        if (instance.onBeforeMutation === beforeMutation) instance.onBeforeMutation = null;
        if (instance.onDreamPlanPermission === setDreamPlanPermission) instance.onDreamPlanPermission = null;
        if (instance.onAuthorityRetry === retryLoad) instance.onAuthorityRetry = null;
      },
      flush() {
        ensureCurrentOwner();
        window.clearTimeout(saveTimer);
        if (!dirty) return saveChain;
        return queueSave();
      }
    };
  }

  window.SHEXCalendarAPI = { connect, call };
})();
