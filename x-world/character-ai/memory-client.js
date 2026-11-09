(function initCharacterMemoryClient(global, factory) {
  const api = factory(global);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.SHEXCharacterMemoryClient = api;
})(typeof window !== 'undefined' ? window : globalThis, function createCharacterMemoryClient(global) {
  'use strict';

  const STORAGE_KEY = 'shex_character_memory_client_jobs_v1';
  const RETRY_DELAYS_MS = Object.freeze([30000, 300000, 1800000]);
  const MAX_ENTRIES = 50;
  let drainPromise = null;
  let retryTimer = null;

  function storage() {
    return global?.localStorage || null;
  }

  function readEntries() {
    try {
      const value = JSON.parse(storage()?.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(value) ? value.filter((entry) => entry && typeof entry === 'object').slice(-MAX_ENTRIES) : [];
    } catch (_) {
      return [];
    }
  }

  function writeEntries(entries) {
    try {
      storage()?.setItem(STORAGE_KEY, JSON.stringify((Array.isArray(entries) ? entries : []).slice(-MAX_ENTRIES)));
      return true;
    } catch (_) {
      return false;
    }
  }

  function entryKey(userId, dreamId) {
    return `${String(userId || '').trim()}::${String(dreamId || '').trim()}`;
  }

  function enqueue(options = {}) {
    const userId = String(options.userId || options.user?.userId || '').trim();
    const dreamId = String(options.dreamId || '').trim();
    if (!userId || !dreamId) return false;
    const now = Math.max(0, Number(options.now || Date.now()));
    const key = entryKey(userId, dreamId);
    const entries = readEntries();
    const index = entries.findIndex((entry) => entry.key === key);
    const next = { key, userId, dreamId, attemptCount: 0, nextRetryAt: 0, createdAt: now, updatedAt: now };
    if (index >= 0) entries[index] = { ...entries[index], nextRetryAt: 0, updatedAt: now };
    else entries.push(next);
    return writeEntries(entries);
  }

  function removeEntry(key) {
    writeEntries(readEntries().filter((entry) => entry.key !== key));
  }

  function scheduleRetry(options, delay) {
    if (!delay || retryTimer || typeof global?.setTimeout !== 'function') return;
    retryTimer = global.setTimeout(() => {
      retryTimer = null;
      drain(options).catch(() => null);
    }, delay);
  }

  async function drain(options = {}) {
    if (drainPromise) return drainPromise;
    const app = options.app;
    const user = options.user || {};
    const characterAI = options.characterAI || global?.SHEXCharacterAI;
    if (!app?.callFunction || !user?.userId || !user?.sessionToken || typeof characterAI?.consolidateMemory !== 'function') {
      return { attempted: 0, remaining: readEntries().length };
    }
    const task = (async () => {
      const now = Math.max(0, Number(options.now || Date.now()));
      const entries = readEntries();
      let attempted = 0;
      let soonestDelay = 0;
      for (const entry of entries.filter((item) => item.userId === String(user.userId))) {
        if (Number(entry.nextRetryAt || 0) > now) {
          const delay = Number(entry.nextRetryAt) - now;
          soonestDelay = soonestDelay ? Math.min(soonestDelay, delay) : delay;
          continue;
        }
        attempted += 1;
        try {
          const result = await characterAI.consolidateMemory({ app, user, dreamId: entry.dreamId });
          if (['completed', 'none', 'disabled'].includes(String(result?.status || ''))) {
            removeEntry(entry.key);
            continue;
          }
          throw new Error('memory consolidation busy');
        } catch (_) {
          const attemptCount = Math.max(0, Number(entry.attemptCount || 0)) + 1;
          const delay = RETRY_DELAYS_MS[attemptCount - 1] || 0;
          const latest = readEntries();
          const index = latest.findIndex((item) => item.key === entry.key);
          if (index >= 0) {
            latest[index] = { ...latest[index], attemptCount, nextRetryAt: delay ? now + delay : 0, updatedAt: now };
            writeEntries(latest);
          }
          if (delay) soonestDelay = soonestDelay ? Math.min(soonestDelay, delay) : delay;
        }
      }
      if (soonestDelay) scheduleRetry(options, soonestDelay);
      return { attempted, remaining: readEntries().filter((entry) => entry.userId === String(user.userId)).length };
    })();
    drainPromise = task.finally(() => { drainPromise = null; });
    return drainPromise;
  }

  return Object.freeze({ STORAGE_KEY, RETRY_DELAYS_MS, drain, enqueue, readEntries });
});
