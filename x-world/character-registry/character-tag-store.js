(function initCharacterTagStore(global, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.SHEXCharacterTagStore = api;
})(typeof window !== 'undefined' ? window : globalThis, function createCharacterTagStoreModule() {
  'use strict';

  const TAG_STORE_VERSION = 'character-tag-store-v1-x98';
  const SEARCH_CACHE_TTL_MS = 60 * 1000;
  const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;

  function cleanQuery(value) { return String(value || '').normalize('NFKC').trim().toLocaleLowerCase('zh-CN'); }
  function cleanTag(value) {
    const tagId = String(value?.tagId || '').trim();
    const displayName = String(value?.displayName || '').trim();
    if (!tagId || !displayName || String(value?.status || 'active') !== 'active') return null;
    return Object.freeze({ tagId, displayName, status: 'active' });
  }
  function cleanResolvedTag(value) {
    const tagId = String(value?.tagId || '').trim();
    const displayName = String(value?.displayName || '').trim();
    const status = String(value?.status || 'active').trim().toLowerCase() || 'active';
    if (!tagId || !displayName) return null;
    return Object.freeze({ tagId, displayName, status });
  }
  function mergeTags(left = [], right = []) {
    const byId = new Map();
    [...left, ...right].forEach(value => { const tag = cleanTag(value); if (tag) byId.set(tag.tagId, tag); });
    return Array.from(byId.values()).sort((a, b) => a.displayName.localeCompare(b.displayName, 'zh-CN') || a.tagId.localeCompare(b.tagId));
  }

  function createTagStore(options = {}) {
    const api = options.api;
    const now = typeof options.now === 'function' ? options.now : Date.now;
    const createRequestId = options.createRequestId;
    const cache = new Map();
    let activeSequence = 0;
    let state = Object.freeze({ query: '', tags: Object.freeze([]), nextCursor: '', hasMore: false, stale: false });

    function current() { return state; }
    function ttl(query) { return query ? SEARCH_CACHE_TTL_MS : DEFAULT_CACHE_TTL_MS; }
    async function list(input = {}) {
      const query = cleanQuery(input.query);
      const cursor = String(input.cursor || '').trim();
      const cached = cache.get(query);
      if (!cursor && input.force !== true && cached && now() - cached.cachedAt < ttl(query)) {
        state = Object.freeze({ ...cached.value, stale: false });
        return state;
      }
      const sequence = ++activeSequence;
      const result = await api.listCharacterTags({ query, cursor, limit: Math.max(1, Math.min(100, Number(input.limit) || 50)) });
      const stale = sequence !== activeSequence;
      const pageTags = (Array.isArray(result?.tags) ? result.tags : []).map(cleanTag).filter(Boolean);
      const baseTags = cursor && cached ? cached.value.tags : [];
      const value = Object.freeze({
        query,
        tags: Object.freeze(mergeTags(baseTags, pageTags)),
        nextCursor: String(result?.nextCursor || ''),
        hasMore: result?.hasMore === true,
        stale
      });
      if (!stale) {
        cache.set(query, { cachedAt: now(), value: Object.freeze({ ...value, stale: false }) });
        state = Object.freeze({ ...value, stale: false });
      }
      return value;
    }

    async function create(displayName) {
      const result = await api.createCharacterTag({
        displayName: String(displayName || '').trim(),
        requestId: createRequestId('character_tag')
      });
      const tag = cleanTag(result?.tag);
      if (!tag) throw new Error('标签创建结果无效，请刷新后重试');
      cache.forEach((entry, query) => {
        if (query && !tag.displayName.toLocaleLowerCase('zh-CN').includes(query)) return;
        entry.value = Object.freeze({ ...entry.value, tags: Object.freeze(mergeTags(entry.value.tags, [tag])) });
        entry.cachedAt = now();
      });
      if (!state.query || tag.displayName.toLocaleLowerCase('zh-CN').includes(state.query)) {
        state = Object.freeze({ ...state, tags: Object.freeze(mergeTags(state.tags, [tag])), stale: false });
        cache.set(state.query, { cachedAt: now(), value: state });
      }
      return Object.freeze({ ...result, tag });
    }

    async function resolve(tagIds = []) {
      const ids = Array.from(new Set((Array.isArray(tagIds) ? tagIds : []).map(value => String(value || '').trim()).filter(Boolean))).slice(0, 10);
      if (!ids.length) return Object.freeze([]);
      const result = await api.resolveCharacterTags({ tagIds: ids });
      const byId = new Map((Array.isArray(result?.tags) ? result.tags : []).map(cleanResolvedTag).filter(Boolean).map(tag => [tag.tagId, tag]));
      return Object.freeze(ids.map(id => byId.get(id)).filter(Boolean));
    }

    function invalidate() { cache.clear(); }
    return Object.freeze({ current, list, create, resolve, invalidate });
  }

  return Object.freeze({ TAG_STORE_VERSION, SEARCH_CACHE_TTL_MS, DEFAULT_CACHE_TTL_MS, cleanQuery, createTagStore });
});
