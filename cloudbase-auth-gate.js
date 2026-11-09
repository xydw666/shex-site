(function initCloudBaseAuthGate(global, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.SHEXCloudBaseAuthGate = api;
})(typeof window !== 'undefined' ? window : globalThis, function createCloudBaseAuthGateModule() {
  'use strict';

  const VERSION = 'cloudbase-auth-gate-v2';

  function errorText(value, depth = 0, seen = new Set()) {
    if (value === null || value === undefined || depth > 3) return '';
    if (typeof value === 'string' || typeof value === 'number') return String(value);
    if (typeof value !== 'object' || seen.has(value)) return '';
    seen.add(value);
    const fields = ['code', 'errCode', 'message', 'errMsg', 'detail', 'error', 'rawError', 'cause'];
    return fields.map((field) => errorText(value[field], depth + 1, seen)).filter(Boolean).join(' ');
  }

  function isTransportAuthError(value) {
    const text = errorText(value).trim();
    if (!text) return false;
    if (/you\s+can(?:not|'?t)\s+request\s+without\s+auth/i.test(text)) return true;
    if (/request\s+without\s+auth|not\s+authenticated|authentication\s+required/i.test(text)) return true;
    return /(?:^|\s)(?:CLOUDBASE_)?AUTH_(?:MISSING|EXPIRED|INVALID|UNAUTHORIZED|NOT_LOGGED_IN)(?:\s|$)/i.test(text);
  }

  function create(options = {}) {
    if (typeof options.initialize !== 'function') throw new TypeError('CloudBase 鉴权门缺少 initialize');
    const classify = typeof options.isTransportAuthError === 'function'
      ? options.isTransportAuthError
      : isTransportAuthError;
    let ready = null;
    let recovery = null;
    let initializeFlight = null;
    let epoch = 0;
    let attemptSequence = 0;
    let consecutiveFailures = 0;
    let cooldownUntil = 0;
    const failedAttempts = new Set();
    const timeoutMs = Math.max(10, Number(options.timeoutMs || 12000));
    const failureThreshold = Math.max(1, Number(options.failureThreshold || 3));
    const cooldownMs = Math.max(250, Number(options.cooldownMs || 5000));

    function cooldownError() {
      const error = new Error('CloudBase 鉴权暂时不可用，请稍后重试');
      error.code = 'CLOUDBASE_AUTH_COOLDOWN';
      error.retryAt = cooldownUntil;
      return error;
    }

    function assertCircuitAvailable() {
      if (cooldownUntil > Date.now()) throw cooldownError();
      if (cooldownUntil) {
        cooldownUntil = 0;
        consecutiveFailures = 0;
      }
    }

    function noteInitializeFailure(attempt) {
      if (failedAttempts.has(attempt)) return;
      failedAttempts.add(attempt);
      consecutiveFailures += 1;
      if (consecutiveFailures >= failureThreshold) cooldownUntil = Date.now() + cooldownMs;
    }

    function noteInitializeSuccess() {
      consecutiveFailures = 0;
      cooldownUntil = 0;
      failedAttempts.clear();
    }

    function waitWithTimeout(source, recovering, attempt) {
      let timer = 0;
      return Promise.race([
        source,
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            const error = new Error(recovering ? 'CloudBase 重新鉴权超时' : 'CloudBase 鉴权准备超时');
            error.code = recovering ? 'CLOUDBASE_REAUTH_FAILED' : 'CLOUDBASE_AUTH_NOT_READY';
            error.step = 'cloudbase_auth_timeout';
            noteInitializeFailure(attempt);
            reject(error);
          }, timeoutMs);
        })
      ]).finally(() => clearTimeout(timer));
    }

    function beginInitialize(recovering) {
      const attempt = ++attemptSequence;
      const source = Promise.resolve()
        .then(() => options.initialize({ recovering, attempt, epoch }))
        .then((client) => {
          if (!client) {
            const error = new Error('CloudBase 初始化未返回客户端');
            error.code = 'CLOUDBASE_AUTH_NOT_READY';
            throw error;
          }
          if (initializeFlight?.attempt !== attempt) {
            const error = new Error('CloudBase 鉴权结果已被更新的连接取代');
            error.code = 'CLOUDBASE_AUTH_SUPERSEDED';
            throw error;
          }
          epoch += 1;
          const record = Object.freeze({ client, epoch });
          initializeFlight = null;
          ready = Promise.resolve(record);
          noteInitializeSuccess();
          return record;
        })
        .catch((error) => {
          if (initializeFlight?.attempt === attempt) {
            initializeFlight = null;
            noteInitializeFailure(attempt);
          }
          throw error;
        });
      initializeFlight = { attempt, recovering, source };
      return initializeFlight;
    }

    function startRecord(recovering = false) {
      if (ready) return ready;
      assertCircuitAvailable();
      // A timeout cannot cancel the CloudBase SDK operation. Reuse that still-running
      // source instead of starting a second anonymous login in the same page.
      const flight = initializeFlight || beginInitialize(recovering);
      let pending = null;
      pending = waitWithTimeout(flight.source, recovering || flight.recovering, flight.attempt).catch((error) => {
        if (ready === pending) ready = null;
        throw error;
      });
      ready = pending;
      return pending;
    }

    function getClient() {
      return Promise.resolve().then(() => startRecord(false)).then((record) => record.client);
    }

    function getRecord() {
      return Promise.resolve().then(() => startRecord(false));
    }

    function recoverRecord(expectedEpoch = epoch) {
      if (expectedEpoch !== epoch) return getRecord();
      if (recovery) return recovery;
      ready = null;
      let pending = null;
      pending = startRecord(true).catch((error) => {
        if (error?.code === 'CLOUDBASE_REAUTH_FAILED' || error?.code === 'CLOUDBASE_AUTH_COOLDOWN') throw error;
        const wrapped = new Error('CloudBase 重新鉴权失败');
        wrapped.code = 'CLOUDBASE_REAUTH_FAILED';
        wrapped.cause = error;
        wrapped.rawError = error;
        throw wrapped;
      }).finally(() => {
        if (recovery === pending) recovery = null;
      });
      recovery = pending;
      return pending;
    }

    function recover() {
      return Promise.resolve().then(() => recoverRecord(epoch)).then((record) => record.client);
    }

    async function run(operation, runOptions = {}) {
      if (typeof operation !== 'function') throw new TypeError('CloudBase 鉴权门缺少 operation');
      const retryAuthOnce = runOptions.retryAuthOnce === true;
      const first = await getRecord();
      try {
        return await operation(first.client);
      } catch (error) {
        if (!retryAuthOnce || !classify(error)) throw error;
        const next = first.epoch === epoch ? await recoverRecord(first.epoch) : await getRecord();
        try {
          return await operation(next.client);
        } catch (retryError) {
          if (!classify(retryError)) throw retryError;
          const wrapped = new Error('CloudBase 重新鉴权后仍未登录');
          wrapped.code = 'CLOUDBASE_REAUTH_FAILED';
          wrapped.cause = retryError;
          wrapped.rawError = retryError;
          throw wrapped;
        }
      }
    }

    function replaceClient(client) {
      attemptSequence += 1;
      initializeFlight = null;
      recovery = null;
      epoch += 1;
      noteInitializeSuccess();
      ready = Promise.resolve(Object.freeze({ client, epoch }));
      return client;
    }

    function clear() {
      attemptSequence += 1;
      ready = null;
      recovery = null;
      initializeFlight = null;
      epoch += 1;
      noteInitializeSuccess();
    }

    return Object.freeze({ getClient, run, recover, replaceClient, clear, isTransportAuthError: classify });
  }

  return Object.freeze({ VERSION, create, isTransportAuthError });
});
