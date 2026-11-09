(function initCharacterCategoryStore(global, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.SHEXCharacterCategoryStore = api;
})(typeof window !== 'undefined' ? window : globalThis, function createCharacterCategoryStoreModule() {
  'use strict';

  const CATEGORY_STORE_VERSION = 'character-category-store-v1-x98';
  const CATEGORY_CACHE_KEY = 'shex_character_categories_v1';
  const CATEGORY_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
  const FALLBACK_CATEGORIES = Object.freeze([
    ['world', '世界观'], ['multi', '多人'], ['gl', '百合'], ['bg', 'BG'], ['bl', 'BL'],
    ['derivative', '衍生作品'], ['single', '单人'], ['simulator', '模拟器']
  ].map(([categoryId, displayName], sortOrder) => Object.freeze({ categoryId, displayName, status: 'active', sortOrder })));

  function categories(value) {
    const seen = new Set();
    return (Array.isArray(value) ? value : []).map((item, index) => ({
      categoryId: String(item?.categoryId || '').trim(),
      displayName: String(item?.displayName || '').trim(),
      status: String(item?.status || 'active').trim().toLowerCase(),
      sortOrder: Number.isFinite(Number(item?.sortOrder)) ? Number(item.sortOrder) : index
    })).filter(item => item.categoryId && item.displayName && item.status === 'active' && !seen.has(item.categoryId) && seen.add(item.categoryId))
      .sort((left, right) => left.sortOrder - right.sortOrder || left.categoryId.localeCompare(right.categoryId))
      .map(Object.freeze);
  }

  function createCategoryStore(options = {}) {
    const api = options.api;
    const storage = options.storage;
    const now = typeof options.now === 'function' ? options.now : Date.now;
    let state = Object.freeze({ revision: 0, categories: FALLBACK_CATEGORIES, source: 'fallback', cachedAt: 0 });
    let inFlight = null;
    try {
      const cached = JSON.parse(storage?.getItem?.(CATEGORY_CACHE_KEY) || 'null');
      const cachedCategories = categories(cached?.categories);
      if (cachedCategories.length && now() - Number(cached?.cachedAt || 0) < CATEGORY_CACHE_TTL_MS) {
        state = Object.freeze({ revision: Math.max(0, Number(cached.revision || 0)), categories: Object.freeze(cachedCategories), source: 'cache', cachedAt: Number(cached.cachedAt) });
      }
    } catch (_) {
      // Corrupt client cache is disposable; fallback remains immediately usable.
    }

    function current() { return state; }
    function fresh() { return state.source !== 'fallback' && now() - Number(state.cachedAt || 0) < CATEGORY_CACHE_TTL_MS; }
    async function refresh(refreshOptions = {}) {
      if (refreshOptions.force !== true && fresh()) return state;
      if (inFlight && refreshOptions.force !== true) return inFlight;
      const request = (async () => {
        try {
          const result = await api.getCharacterCategories();
          const remoteCategories = categories(result?.categories);
          if (!remoteCategories.length) return state;
          const cachedAt = now();
          state = Object.freeze({
            revision: Math.max(0, Number(result?.revision || 0)),
            categories: Object.freeze(remoteCategories),
            source: 'remote',
            cachedAt
          });
          try { storage?.setItem?.(CATEGORY_CACHE_KEY, JSON.stringify({ revision: state.revision, categories: state.categories, cachedAt })); } catch (_) { /* storage is optional */ }
          return state;
        } catch (_) {
          return state;
        }
      })();
      inFlight = request;
      try { return await request; }
      finally { if (inFlight === request) inFlight = null; }
    }
    return Object.freeze({ current, refresh });
  }

  return Object.freeze({ CATEGORY_STORE_VERSION, CATEGORY_CACHE_KEY, CATEGORY_CACHE_TTL_MS, FALLBACK_CATEGORIES, createCategoryStore });
});
