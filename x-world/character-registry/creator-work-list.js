(function initCreatorWorkList(global, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.SHEXCreatorWorkList = api;
})(typeof window !== 'undefined' ? window : globalThis, function createCreatorWorkListModule() {
  'use strict';

  function characterTitle(draft = {}) {
    return String(draft?.authoringPayload?.characterProfile?.basic?.displayName || '未命名角色');
  }

  function normalizeCharacterWork(draft = {}) {
    return {
      workType: 'character',
      workId: String(draft.draftId || ''),
      draftId: String(draft.draftId || ''),
      title: characterTitle(draft),
      status: String(draft.publicationStatus || 'draft'),
      updatedAt: Math.max(0, Number(draft.updatedAt || draft.publishedAt || 0)),
      raw: draft,
    };
  }

  function normalizeWorldWork(draft = {}) {
    const status = ['published', 'unpublished'].includes(String(draft.status || ''))
      ? String(draft.status)
      : 'draft';
    return {
      workType: 'world',
      workId: String(draft.draftId || ''),
      draftId: String(draft.draftId || ''),
      title: String(draft.title || '未命名世界'),
      status,
      revision: Math.max(0, Number(draft.revision || 0)),
      promoAssetId: String(draft.promoAssetId || draft.coverAssetRef?.fileId || ''),
      updatedAt: Math.max(0, Number(draft.updatedAt || 0)),
      raw: draft,
    };
  }

  function compareWorks(left, right) {
    const time = Number(right?.updatedAt || 0) - Number(left?.updatedAt || 0);
    if (time) return time;
    const type = String(left?.workType || '').localeCompare(String(right?.workType || ''));
    if (type) return type;
    return String(left?.workId || '').localeCompare(String(right?.workId || ''));
  }

  function pageItems(page, type) {
    const source = Array.isArray(page?.items) ? page.items : Array.isArray(page?.drafts) ? page.drafts : [];
    return source.map(type === 'character' ? normalizeCharacterWork : normalizeWorldWork).sort(compareWorks);
  }

  function createDualWorkPager(options = {}) {
    const pageSize = Math.min(50, Math.max(1, Math.floor(Number(options.pageSize) || 20)));
    const sources = {
      character: {
        buffer: pageItems(options.characterPage, 'character'),
        cursor: String(options.characterPage?.nextCursor || ''),
        fetch: options.fetchCharacters,
        failed: false,
      },
      world: {
        buffer: pageItems(options.worldPage, 'world'),
        cursor: String(options.worldPage?.nextCursor || ''),
        fetch: options.fetchWorlds,
        failed: false,
      },
    };
    const delivered = new Set();

    async function refill(type, fetchedThisPage) {
      const source = sources[type];
      if (source.buffer.length || source.failed || !source.cursor || fetchedThisPage.has(type) || typeof source.fetch !== 'function') return;
      fetchedThisPage.add(type);
      const cursor = source.cursor;
      try {
        const page = await source.fetch(cursor);
        source.buffer.push(...pageItems(page, type));
        source.cursor = String(page?.nextCursor || '');
      } catch (_) {
        source.failed = true;
        source.cursor = '';
      }
    }

    async function next() {
      const items = [];
      const fetchedThisPage = new Set();
      while (items.length < pageSize) {
        await Promise.all([refill('character', fetchedThisPage), refill('world', fetchedThisPage)]);
        const left = sources.character.buffer[0];
        const right = sources.world.buffer[0];
        if (!left && !right) break;
        const type = !right || (left && compareWorks(left, right) <= 0) ? 'character' : 'world';
        const item = sources[type].buffer.shift();
        const key = item.workType + ':' + item.workId;
        if (!delivered.has(key)) {
          delivered.add(key);
          items.push(item);
        }
      }
      return {
        items,
        warnings: [
          sources.character.failed ? '单人角色作品暂时未加载' : '',
          sources.world.failed ? '世界作品暂时未加载' : '',
        ].filter(Boolean),
        hasMore: Boolean(
          sources.character.buffer.length || sources.world.buffer.length
          || sources.character.cursor || sources.world.cursor
        ),
      };
    }

    return Object.freeze({ next });
  }

  return Object.freeze({
    characterTitle,
    normalizeCharacterWork,
    normalizeWorldWork,
    compareWorks,
    createDualWorkPager,
  });
});
