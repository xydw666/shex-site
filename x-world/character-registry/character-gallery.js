(function initCharacterGallery(global, factory) {
  const api = factory(global);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.SHEXCharacterGallery = api;
})(typeof window !== 'undefined' ? window : globalThis, function createCharacterGalleryModule(global) {
  'use strict';

  const GALLERY_VERSION = 'character-gallery-v33-x103-public-search-entry';
  function readGallerySearchRoute(hash) {
    const prefix = '#x-character-gallery?keyword=';
    if (typeof hash !== 'string' || !hash.startsWith(prefix)) return null;
    try { return { keyword: decodeURIComponent(hash.slice(prefix.length)).trim().slice(0, 120) }; }
    catch (_) { return null; }
  }
  const GALLERY_TAXONOMY = global?.SHEXCharacterGalleryTaxonomy
    || (typeof require === 'function' ? require('./character-gallery-taxonomy.js') : null);
  if (!GALLERY_TAXONOMY) throw new Error('character gallery taxonomy is required');
  const CATEGORY_STORE_MODULE = global?.SHEXCharacterCategoryStore
    || (typeof require === 'function' ? require('./character-category-store.js') : null);
  const TAG_STORE_MODULE = global?.SHEXCharacterTagStore
    || (typeof require === 'function' ? require('./character-tag-store.js') : null);
  const WORLD_RUN_VIEW = global?.SHEXWorldRunView
    || (typeof require === 'function' ? require('../world-run/world-run-view.js') : null);
  const INITIAL_VISIBLE_CHARACTERS = 10;
  const MIXED_FEED_PAGE_SIZE = 20;
  const MIXED_WORLD_PAGE_SIZE = 10;
  const GALLERY_CARD_ACTION = 'direct_chat';
  const REPORT_ENTRY_VISIBLE = true;
  const GALLERY_SORTS = Object.freeze([
    { id: 'all', label: '全部' },
    { id: 'latest', label: '最新' },
    { id: 'hot', label: '最热' }
  ]);
  const HIDDEN_CATEGORY_IDS = new Set(['bg', 'bl']);
  const isVisibleCategoryId = value => !HIDDEN_CATEGORY_IDS.has(String(value || '').trim().toLowerCase());
  const GALLERY_TYPE_FILTERS = GALLERY_TAXONOMY.TYPE_FILTERS.filter(item => isVisibleCategoryId(item?.id));
  const GALLERY_TAG_FILTERS = GALLERY_TAXONOMY.TAG_FILTERS;
  const escapeHtml = (value) => String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const initialOf = (value) => Array.from(String(value || '角').trim())[0] || '角';

  function formatUsageCount(value) {
    const count = Math.max(0, Math.floor(Number(value) || 0));
    if (count >= 100_000_000) return `${(count / 100_000_000).toFixed(1).replace(/\.0$/, '')}亿次使用`;
    if (count >= 10_000) return `${(count / 10_000).toFixed(1).replace(/\.0$/, '')}万次使用`;
    return `${count.toLocaleString('zh-CN')}次使用`;
  }

  function usageCountMarkup(value, className) {
    const count = Math.max(0, Math.floor(Number(value) || 0));
    if (count < 50) return '';
    return `<small class="${escapeHtml(className)}">${escapeHtml(formatUsageCount(count))}</small>`;
  }

  function createHomeFeedState() {
    return {
      works: [], characters: [], worlds: [], nextCursor: '', worldNextCursor: '',
      hasMore: true, worldHasMore: true, loading: false, randomStart: newRandomStart(), batchIndex: 0,
    };
  }

  function newRandomStart() {
    try {
      const values = new Uint32Array(2);
      global?.crypto?.getRandomValues?.(values);
      if (values.some(value => value !== 0)) return Array.from(values).map(value => value.toString(16).padStart(8, '0')).join('');
    } catch (_) {}
    return String(Date.now().toString(16) + Math.floor(Math.random() * 0xffffffff).toString(16)).padStart(16, '0').slice(-16);
  }

  function seededWorkScore(seed, stableKey) {
    const input = `${String(seed || '')}\u0000${String(stableKey || '')}`;
    let hash = 0x811c9dc5;
    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
  }

  function normalizeGalleryWork(kind, item) {
    const normalizedKind = kind === 'simulator' ? 'simulator' : 'character';
    const stableId = normalizedKind === 'simulator'
      ? String(item?.worldTemplateId || '').trim()
      : String(item?.characterId || '').trim();
    if (!stableId) return null;
    return { kind: normalizedKind, stableId, stableKey: `${normalizedKind}:${stableId}`, item };
  }

  function mergeSeededWorkBatch(existing = [], characters = [], worlds = [], seed = '', options = {}) {
    const output = Array.isArray(existing) ? Array.from(existing) : [];
    const known = new Set(output.map(work => String(work?.stableKey || '')));
    const unique = (kind, items) => {
      const batchKeys = new Set();
      return (Array.isArray(items) ? items : []).map(item => normalizeGalleryWork(kind, item)).filter((work) => {
        if (!work || known.has(work.stableKey) || batchKeys.has(work.stableKey)) return false;
        batchKeys.add(work.stableKey);
        return true;
      });
    };
    const bySeed = (left, right) => seededWorkScore(seed, left.stableKey) - seededWorkScore(seed, right.stableKey)
      || left.stableKey.localeCompare(right.stableKey);
    const characterWorks = unique('character', characters);
    const worldWorks = unique('simulator', worlds);
    if (options.shuffleWithinSources === true) {
      characterWorks.sort(bySeed);
      worldWorks.sort(bySeed);
    }
    let characterIndex = 0;
    let worldIndex = 0;
    while (characterIndex < characterWorks.length || worldIndex < worldWorks.length) {
      for (let count = 0; count < 2 && worldIndex < worldWorks.length; count += 1) output.push(worldWorks[worldIndex++]);
      for (let count = 0; count < 4 && characterIndex < characterWorks.length; count += 1) output.push(characterWorks[characterIndex++]);
    }
    return output;
  }

  function visibleWorkSlice(works = [], limit = 0) {
    const source = Array.isArray(works) ? works : [];
    const shown = source.slice(0, Math.max(0, Math.floor(Number(limit) || 0)));
    if (shown.length >= source.length || shown[shown.length - 1]?.kind !== 'character') return shown;
    let trailingCharacters = 0;
    for (let index = shown.length - 1; index >= 0 && shown[index]?.kind === 'character'; index -= 1) trailingCharacters += 1;
    if (trailingCharacters % 2 === 1 && source[shown.length]?.kind === 'character') shown.push(source[shown.length]);
    return shown;
  }

  function retryableWorldMessageRequest(pending, input, createIds) {
    const next = {
      worldTemplateId: String(input?.worldTemplateId || '').trim(),
      runId: String(input?.runId || '').trim(),
      messageText: String(input?.messageText || '').trim()
    };
    const reusable = pending && pending.worldTemplateId === next.worldTemplateId
      && pending.runId === next.runId && pending.messageText === next.messageText
      && pending.messageId && pending.requestId;
    return { ...next, ...(reusable ? { messageId: pending.messageId, requestId: pending.requestId } : createIds()) };
  }

  async function settleGallerySources(characterRequest, worldRequest) {
    const [character, world] = await Promise.allSettled([characterRequest, worldRequest]);
    return {
      characterResult: character.status === 'fulfilled' ? character.value : null,
      characterError: character.status === 'rejected' ? character.reason : null,
      worldResult: world.status === 'fulfilled' ? world.value : null,
      worldError: world.status === 'rejected' ? world.reason : null
    };
  }

  function imageSource(value) {
    const source = String(value || '').trim();
    return /^(?:https?:|data:|blob:|cloud:\/\/)/i.test(source) ? source : '';
  }

  function coverMarkup(item = {}, className = 'shex-gallery-card-cover') {
    const displayName = String(item.displayName || '角色').trim() || '角色';
    const source = imageSource(item.avatarAssetId || item.publicAvatarAssetId);
    if (!source) return `<div class="${className} shex-gallery-cover-fallback" aria-hidden="true"><span>${escapeHtml(initialOf(displayName))}</span></div>`;
    const cloudSource = /^cloud:\/\//i.test(source);
    return `<div class="${className}"><img class="shex-gallery-cover-image${cloudSource ? ' x-cloud-image-loading' : ''}"${cloudSource ? '' : ` src="${escapeHtml(source)}"`} data-gallery-cover-source="${escapeHtml(source)}" alt="${escapeHtml(displayName)}的公开头像"></div>`;
  }

  function creatorSummaryOf(item = {}) {
    const summary = item.creatorSummary && typeof item.creatorSummary === 'object' ? item.creatorSummary : {};
    return {
      creatorId: String(summary.creatorId || item.creatorId || '').trim(),
      displayName: String(summary.displayName || item.creatorDisplayName || '匿名创作者').trim() || '匿名创作者',
      creatorCode: String(summary.creatorCode || '').trim(),
      avatarAssetId: String(summary.avatarAssetId || '').trim()
    };
  }

  function creatorAvatarMarkup(creator = {}) {
    const displayName = String(creator.displayName || '创作者').trim() || '创作者';
    const source = imageSource(creator.avatarAssetId);
    if (!source) return `<div class="shex-public-creator-avatar shex-gallery-cover-fallback" aria-hidden="true"><span>${escapeHtml(initialOf(displayName))}</span></div>`;
    const cloudSource = /^cloud:\/\//i.test(source);
    return `<div class="shex-public-creator-avatar"><img class="shex-gallery-cover-image${cloudSource ? ' x-cloud-image-loading' : ''}"${cloudSource ? '' : ` src="${escapeHtml(source)}"`} data-gallery-cover-source="${escapeHtml(source)}" alt="${escapeHtml(displayName)}的创作者头像"></div>`;
  }

  function cardMarkup(item = {}) {
    const tags = (Array.isArray(item.galleryTags) && item.galleryTags.length ? item.galleryTags : item.identityTags || []).slice(0, 2);
    const creator = creatorSummaryOf(item);
    return `<article class="shex-gallery-card">
      <button class="shex-gallery-card-main" type="button" data-character-id="${escapeHtml(item.characterId)}" aria-label="与${escapeHtml(item.displayName || '角色')}开始聊天">
        ${coverMarkup(item)}
        <span class="shex-gallery-card-shade" aria-hidden="true"></span>
        ${usageCountMarkup(item.usageCount, 'shex-gallery-card-usage-badge')}
        <div class="shex-gallery-card-copy">
          <h3>${escapeHtml(item.displayName || '未命名角色')}</h3>
          ${tags.length ? `<div class="shex-gallery-tags">${tags.map(tag => `<span>${escapeHtml(tag)}</span>`).join('')}</div>` : ''}
          <p>${escapeHtml(item.publicSummary || '等待你走进TA的故事。')}</p>
        </div>
      </button>
      ${creator.creatorId ? `<button class="shex-gallery-card-author" type="button" data-open-creator-id="${escapeHtml(creator.creatorId)}">BY ${escapeHtml(creator.displayName)}</button>` : `<span class="shex-gallery-card-author">BY ${escapeHtml(creator.displayName)}</span>`}
    </article>`;
  }

  // 世界卡主区域必须是独立入口；作者按钮保持 sibling，避免嵌套按钮和误触。
  function worldCardMarkup(item = {}) {
    const creator = creatorSummaryOf(item);
    const title = String(item.title || '未命名世界');
    const source = imageSource(item.promoAssetId || item.promoUrl);
    const cloudSource = /^cloud:\/\//i.test(source);
    const cover = source
      ? '<div class="shex-gallery-world-cover"><img class="shex-gallery-cover-image' + (cloudSource ? ' x-cloud-image-loading' : '') + '"' + (cloudSource ? '' : ' src="' + escapeHtml(source) + '"') + ' data-gallery-cover-source="' + escapeHtml(source) + '" alt="' + escapeHtml(title) + '宣传主题图"></div>'
      : '<div class="shex-gallery-world-cover shex-gallery-cover-fallback" aria-hidden="true"><span>界</span></div>';
    const author = creator.creatorId
      ? '<button class="shex-gallery-card-author" type="button" data-open-creator-id="' + escapeHtml(creator.creatorId) + '">BY ' + escapeHtml(creator.displayName) + '</button>'
      : '<span class="shex-gallery-card-author">BY ' + escapeHtml(creator.displayName) + '</span>';
    return '<article class="shex-gallery-card shex-gallery-world-card" data-world-template-id="' + escapeHtml(item.worldTemplateId) + '">' +
      '<button class="shex-gallery-card-main shex-gallery-world-card-main" type="button" data-open-world-template-id="' + escapeHtml(item.worldTemplateId) + '" aria-label="进入' + escapeHtml(title) + '">' +
      cover + '<span class="shex-gallery-card-shade" aria-hidden="true"></span>' +
      usageCountMarkup(item.usageCount, 'shex-gallery-card-usage-badge') +
      '<div class="shex-gallery-card-copy"><small class="shex-gallery-world-kind">世界 / 模拟器</small><h3>' + escapeHtml(title) + '</h3><p>' + escapeHtml(item.publicSummary || '走进这个世界，开启属于你的剧情。') + '</p></div></button>' +
      author + '</article>';
  }

  // 首页预览专用、纯展示：只去掉运行时结构标记 <scene> / </scene>，不改数据、不改正文 / 括号动作 / 台词 / 换行。
  // 原始 opening、创作者编辑、WorldRun 真正开场、Director / AI 输入都不经过这里。
  // 同类正式标记还有 <action> / <dialogue>（见 script.js 片段解析），本轮未纳入。
  function formatOpeningPreviewForHome(value) {
    return String(value ?? '').replace(/<\s*\/?\s*scene\s*>/gi, '');
  }

  function feedCardMarkup(item = {}, index = 0, options = {}) {
    const tags = (Array.isArray(item.galleryTags) && item.galleryTags.length ? item.galleryTags : item.identityTags || []).slice(0, 3);
    const creator = creatorSummaryOf(item);
    const claimed = options.claimed === true;
    return `<article class="shex-gallery-feed-card" data-feed-character-id="${escapeHtml(item.characterId)}" data-feed-index="${index}">
      ${coverMarkup(item, 'shex-gallery-feed-cover')}
      <span class="shex-gallery-feed-shade" aria-hidden="true"></span>
      <div class="shex-gallery-feed-copy">
        ${creator.creatorId ? `<button class="shex-gallery-feed-author" type="button" data-open-creator-id="${escapeHtml(creator.creatorId)}">BY ${escapeHtml(creator.displayName)}</button>` : `<small class="shex-gallery-feed-author">BY ${escapeHtml(creator.displayName)}</small>`}
        <h2>${escapeHtml(item.displayName || '未命名角色')}</h2>
        ${tags.length ? `<div class="shex-gallery-feed-tags">${tags.map(tag => `<span>${escapeHtml(tag)}</span>`).join('')}</div>` : ''}
        ${usageCountMarkup(item.usageCount, 'shex-gallery-feed-usage')}
        <div class="shex-gallery-feed-message" aria-label="角色开场消息">
          <span>${escapeHtml(formatOpeningPreviewForHome(item.openingPreview || item.publicSummary || '等待你走进TA的故事。'))}</span>
        </div>
        ${item.openingPreview && item.publicSummary ? `<p>${escapeHtml(item.publicSummary)}</p>` : ''}
        <button class="shex-gallery-feed-chat" type="button" data-feed-start-chat="${escapeHtml(item.characterId)}">${claimed ? '继续聊天' : '开始聊天'}</button>
      </div>
    </article>`;
  }

  function worldFeedCardMarkup(item = {}, index = 0) {
    const creator = creatorSummaryOf(item);
    const title = String(item.title || '未命名世界').trim() || '未命名世界';
    const source = imageSource(item.promoAssetId || item.promoUrl);
    const cloudSource = /^cloud:\/\//i.test(source);
    const cover = source
      ? `<div class="shex-gallery-feed-cover"><img class="shex-gallery-cover-image${cloudSource ? ' x-cloud-image-loading' : ''}"${cloudSource ? '' : ` src="${escapeHtml(source)}"`} data-gallery-cover-source="${escapeHtml(source)}" alt="${escapeHtml(title)}宣传主题图"></div>`
      : '<div class="shex-gallery-feed-cover shex-gallery-cover-fallback" aria-hidden="true"><span>界</span></div>';
    return `<article class="shex-gallery-feed-card shex-gallery-world-feed-card" data-feed-world-template-id="${escapeHtml(item.worldTemplateId)}" data-feed-index="${index}">
      ${cover}
      <span class="shex-gallery-feed-shade" aria-hidden="true"></span>
      <div class="shex-gallery-feed-copy">
        ${creator.creatorId ? `<button class="shex-gallery-feed-author" type="button" data-open-creator-id="${escapeHtml(creator.creatorId)}">BY ${escapeHtml(creator.displayName)}</button>` : `<small class="shex-gallery-feed-author">BY ${escapeHtml(creator.displayName)}</small>`}
        <small class="shex-gallery-world-kind">世界 / 模拟器</small>
        <h2>${escapeHtml(title)}</h2>
        ${usageCountMarkup(item.usageCount, 'shex-gallery-feed-usage')}
        <div class="shex-gallery-feed-message"><span>${escapeHtml(formatOpeningPreviewForHome(item.publicSummary || '走进这个世界，开启属于你的剧情。'))}</span></div>
        <button class="shex-gallery-feed-chat" type="button" data-open-world-template-id="${escapeHtml(item.worldTemplateId)}">进入世界</button>
      </div>
    </article>`;
  }

  function feedWorkMarkup(work = {}, index = 0, options = {}) {
    return work?.kind === 'simulator'
      ? worldFeedCardMarkup(work.item || {}, index)
      : feedCardMarkup(work.item || {}, index, options);
  }

  // 服务端按 listingProjection 里存的展示名（taxonomy 的 label）筛选，
  // 而界面选中的是 filter.id，这里做 id → label 的转换。
  function filterLabels(selectedIds = [], definitions = []) {
    const wanted = new Set((Array.isArray(selectedIds) ? selectedIds : []).map(String));
    return definitions.filter(item => wanted.has(String(item.id))).map(item => item.label);
  }

  function categoryFilterDefinitions(categories = []) {
    return (Array.isArray(categories) ? categories : []).filter(item => String(item?.status || 'active') === 'active')
      .map(item => ({ id: String(item.categoryId || ''), label: String(item.displayName || '') }))
      .filter(item => item.id && item.label && isVisibleCategoryId(item.id));
  }

  function tagFilterDefinitions(tags = []) {
    return (Array.isArray(tags) ? tags : []).filter(item => String(item?.status || 'active') === 'active')
      .map(item => ({ id: String(item.tagId || ''), label: String(item.displayName || '') }))
      .filter(item => item.id && item.label);
  }

  function mergeFilterDefinitions(left = [], right = []) {
    const byId = new Map();
    [...left, ...right].forEach(item => {
      const id = String(item?.id || '');
      const label = String(item?.label || '');
      if (id && label) byId.set(id, { id, label });
    });
    return Array.from(byId.values());
  }

  function filterTagDefinitionsByQuery(filters = [], query = '') {
    const normalizedQuery = String(query || '').normalize('NFKC').trim().toLocaleLowerCase('zh-CN');
    if (!normalizedQuery) return Array.from(filters || []);
    return (Array.isArray(filters) ? filters : []).filter(item => String(item?.label || '')
      .normalize('NFKC').toLocaleLowerCase('zh-CN').includes(normalizedQuery));
  }

  function tagSearchMarkup(value = '') {
    return `<label class="shex-gallery-tag-search"><svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"></circle><path d="m16 16 4 4"></path></svg><input type="search" data-gallery-tag-search maxlength="40" value="${escapeHtml(value)}" placeholder="搜索标签" autocomplete="off"></label>`;
  }

  async function loadAllTagFilterDefinitions(tagStore, options = {}) {
    if (!tagStore?.list) return [];
    const seenCursors = new Set();
    let cursor = '';
    let firstPage = true;
    let filters = [];
    while (true) {
      const result = await tagStore.list({
        query: '', cursor, limit: 100,
        force: firstPage && options.force === true
      });
      filters = mergeFilterDefinitions(filters, tagFilterDefinitions(result?.tags || []));
      const nextCursor = String(result?.nextCursor || '').trim();
      if (result?.hasMore !== true || !nextCursor || seenCursors.has(nextCursor)) break;
      seenCursors.add(nextCursor);
      cursor = nextCursor;
      firstPage = false;
    }
    return filters;
  }

  function buildFilterPayload(selectedTypes = [], selectedTags = [], categoryFilters = [], tagFilters = []) {
    const categoryId = String((Array.isArray(selectedTypes) ? selectedTypes : [])[0] || '');
    const tagIds = Array.from(new Set((Array.isArray(selectedTags) ? selectedTags : []).map(String))).slice(0, 10);
    return {
      categoryId,
      tagIds,
      contentTypes: filterLabels(categoryId ? [categoryId] : [], categoryFilters),
      galleryTags: filterLabels(tagIds, tagFilters)
    };
  }

  function filterMarkup(filters = GALLERY_TAG_FILTERS, selected = [], group = 'tag', limit = 10) {
    const atLimit = group !== 'sort' && selected.length >= limit;
    return filters.map(filter => {
      const active = selected.includes(filter.id);
      return `<button type="button" data-gallery-choice="${escapeHtml(filter.id)}" data-gallery-choice-group="${escapeHtml(group)}" aria-pressed="${active ? 'true' : 'false'}" class="${active ? 'is-active' : ''}"${atLimit && !active ? ' disabled' : ''}>${escapeHtml(filter.label)}</button>`;
    }).join('');
  }

  function tagChipsMarkup(filters = [], selected = [], group = 'tag', limit = 10) {
    if (!filters.length) return '';
    const atLimit = selected.length >= limit;
    return filters.map(filter => {
      const active = selected.includes(filter.id);
      return `<button type="button" data-gallery-choice="${escapeHtml(filter.id)}" data-gallery-choice-group="${escapeHtml(group)}" aria-pressed="${active ? 'true' : 'false'}" class="shex-gallery-tag-chip${active ? ' is-active' : ''}"${atLimit && !active ? ' disabled' : ''}>${escapeHtml(filter.label)}</button>`;
    }).join('');
  }

  function primaryMenuMarkup(state = {}) {
    const sortLabel = GALLERY_SORTS.find(item => item.id === state.selectedSort)?.label || '全部';
    const items = [
      { id: 'sort', label: sortLabel, count: 0 },
      { id: 'type', label: '大类', count: state.selectedTypes?.length || 0 },
      { id: 'tag', label: '标签', count: state.selectedTags?.length || 0 },
      { id: 'search', label: '搜索', count: 0 }
    ];
    return items.map(item => `<button type="button" data-gallery-menu="${item.id}" aria-expanded="${state.openMenu === item.id ? 'true' : 'false'}" class="${state.openMenu === item.id ? 'is-open' : !state.openMenu && (state.selectedTags?.length ? item.id === 'tag' : state.selectedTypes?.length ? item.id === 'type' : item.id === 'sort') ? 'is-active' : ''}"><span>${item.label}</span>${item.count ? `<b>${item.count}</b>` : ''}</button>`).join('');
  }

  function valueAt(source, fieldPath) {
    return String(fieldPath || '').split('.').reduce((current, key) => current?.[key], source);
  }

  function displayValue(value) {
    if (Array.isArray(value)) return value.map(item => {
      if (item && typeof item === 'object') return [item.scene, item.content || item.text].filter(Boolean).join('｜');
      return String(item || '');
    }).filter(Boolean).join('、');
    if (typeof value === 'boolean') return value ? '是' : '否';
    return String(value ?? '').trim();
  }

  function detailMarkup(item = {}, labels = {}, options = {}) {
    const paths = Array.isArray(item.includedPaths) ? item.includedPaths : [];
    const fields = paths.map(fieldPath => {
      const rawValue = valueAt(item.publicPayload, fieldPath);
      if (fieldPath === 'templateMetadata.backgroundAssetId') {
        const source = imageSource(rawValue);
        if (!source) return '';
        const cloudSource = /^cloud:\/\//i.test(source);
        return `<div class="shex-gallery-detail-field shex-gallery-detail-background"><dt>${escapeHtml(labels[fieldPath] || '公开背景')}</dt><dd><img class="${cloudSource ? 'x-cloud-image-loading' : ''}"${cloudSource ? '' : ` src="${escapeHtml(source)}"`} data-gallery-cover-source="${escapeHtml(source)}" alt="${escapeHtml(item.displayName || '角色')}的公开背景"></dd></div>`;
      }
      const value = displayValue(rawValue);
      if (!value) return '';
      return `<div class="shex-gallery-detail-field"><dt>${escapeHtml(labels[fieldPath] || fieldPath)}</dt><dd>${escapeHtml(value)}</dd></div>`;
    }).join('');
    const claimed = options.claimed === true;
    const claiming = options.claiming === true;
    const creator = creatorSummaryOf(item);
    return `<section class="shex-gallery-detail" data-gallery-detail>
      <header class="shex-gallery-detail-nav"><button type="button" data-gallery-list-back aria-label="返回故事广场">‹</button><span>角色资料</span><strong>HE.X</strong></header>
      <div class="shex-gallery-detail-hero">${coverMarkup(item, 'shex-gallery-detail-cover')}<span class="shex-gallery-detail-shade" aria-hidden="true"></span><div class="shex-gallery-detail-copy">
        <small>${escapeHtml(item.worldType || '公开角色')}</small><h2>${escapeHtml(item.displayName || '未命名角色')}</h2>
        ${creator.creatorId ? `<button class="shex-gallery-detail-creator" type="button" data-open-creator-id="${escapeHtml(creator.creatorId)}">BY ${escapeHtml(creator.displayName)}</button>` : ''}
        <p>${escapeHtml(item.publicSummary || '创作者暂未填写公开简介。')}</p></div></div>
      <div class="shex-gallery-version"><span>公开版本 ${Number(item.templateVersion || 1)}</span><span>发布时间 ${item.versionCreatedAt ? new Date(item.versionCreatedAt).toLocaleString('zh-CN') : '未记录'}</span></div>
      <div class="shex-gallery-alert" data-gallery-detail-alert${options.error ? '' : ' hidden'}>${escapeHtml(options.error || '')}</div>
      <div class="shex-gallery-claim"><button type="button" data-gallery-claim ${claimed || claiming ? 'disabled' : ''}>${claimed ? '已加入我的梦角' : claiming ? '正在加入…' : '加入我的梦角'}</button><p>领取后生成你的私人副本；聊天、关系和记忆不会回流到公开角色。</p></div>
      ${REPORT_ENTRY_VISIBLE ? `<div class="shex-gallery-report"><button type="button" data-gallery-report-toggle>${options.reportDone ? '已提交举报' : '举报这个角色'}</button>
        <form data-gallery-report-form${options.reportOpen && !options.reportDone ? '' : ' hidden'}>
          <label>原因<select name="category"><option value="unsafe">不安全或违规内容</option><option value="copyright">侵权或抄袭</option><option value="impersonation">冒充他人</option><option value="harassment">骚扰或仇恨</option><option value="other">其他问题</option></select></label>
          <label>补充说明<textarea name="note" maxlength="500" placeholder="请简要说明问题，最多500字"></textarea></label>
          <button type="submit" ${options.reportSubmitting ? 'disabled' : ''}>${options.reportSubmitting ? '正在提交…' : '提交举报'}</button>
        </form>
      </div>` : ''}
      <dl class="shex-gallery-detail-fields">${fields || '<div class="shex-gallery-empty">这个公开版本暂时没有可展示的角色字段。</div>'}</dl>
    </section>`;
  }

  function publicCreatorPageMarkup(input = {}) {
    const creator = creatorSummaryOf({ creatorId: input.creator?.creatorId, creatorSummary: input.creator || {} });
    const characters = Array.isArray(input.characters) ? input.characters : [];
    const worlds = Array.isArray(input.worlds) ? input.worlds : [];
    const works = Array.isArray(input.works) ? input.works : mergeSeededWorkBatch([], characters, worlds);
    const emptyMessage = input.loading ? '正在读取公开作品…' : input.error ? '公开作品暂时无法完整加载' : input.hasMore ? '本批暂无作品，可继续查看更多' : '暂无公开作品';
    return `<section class="shex-public-creator-page" data-public-creator-page>
      <section class="shex-public-creator-profile" aria-labelledby="shex-public-creator-name">
        <div class="shex-public-creator-hero">
          <header class="shex-gallery-detail-nav shex-public-creator-nav"><button type="button" data-creator-page-back aria-label="返回广场">‹</button><span>创作者主页</span><strong>SHE.X</strong></header>
          <div class="shex-public-creator-cover" aria-hidden="true"></div>
        </div>
        <div class="shex-public-creator-summary">
          ${creatorAvatarMarkup(creator)}
          <div class="shex-public-creator-identity"><small class="shex-public-creator-code">${creator.creatorCode ? `创作者号 ${escapeHtml(creator.creatorCode)}` : '创作者'}</small><h2 id="shex-public-creator-name">${escapeHtml(creator.displayName)}</h2></div>
        </div>
      </section>
      <div class="shex-public-creator-works-heading"><span>TA 发布的作品</span></div>
      <section class="shex-gallery-grid shex-public-creator-works">${works.length ? works.map(work => work.kind === 'simulator' ? worldCardMarkup(work.item) : `<div data-creator-page-character-id="${escapeHtml(work.item.characterId)}">${cardMarkup(work.item)}</div>`).join('') : `<div class="shex-gallery-empty">${escapeHtml(emptyMessage)}</div>`}</section>
      <button class="shex-gallery-more" type="button" data-creator-page-more${input.hasMore ? '' : ' hidden'}${input.loading ? ' disabled' : ''}>${input.loading ? '正在读取…' : '查看更多作品'}</button>
      <div class="shex-gallery-alert" data-creator-page-alert${input.error ? '' : ' hidden'}>${escapeHtml(input.error || '')}</div>
    </section>`;
  }

  function discoveryVisible(section, hasGalleryAccess) {
    return section === 'plaza' && typeof hasGalleryAccess === 'function' && hasGalleryAccess() === true;
  }

  function createGallery(options = {}) {
    const root = options.root;
    const api = options.api;
    const worldApi = options.worldApi;
    const worldRunApi = options.worldRunApi;
    const hasGalleryAccess = typeof options.hasGalleryAccess === 'function' ? options.hasGalleryAccess : () => false;
    const onClaim = typeof options.onClaim === 'function' ? options.onClaim : null;
    const isClaimed = typeof options.isClaimed === 'function' ? options.isClaimed : () => false;
    const labels = options.labels && typeof options.labels === 'object' ? options.labels : {};
    const onOpenCreator = typeof options.onOpenCreator === 'function' ? options.onOpenCreator : null;
    const onCreatorSectionShown = typeof options.onCreatorSectionShown === 'function' ? options.onCreatorSectionShown : null;
    const onStartChat = typeof options.onStartChat === 'function' ? options.onStartChat : null;
    const onEnterWorldRun = typeof options.onEnterWorldRun === 'function' ? options.onEnterWorldRun : null;
    const notify = typeof options.notify === 'function' ? options.notify : () => {};
    if (!root || !api?.listPublishedCharacters || !api?.getPublishedCharacter) throw new Error('character gallery dependencies are required');
    const categoryStore = options.categoryStore || CATEGORY_STORE_MODULE?.createCategoryStore?.({ api, storage: global?.localStorage });
    const tagStore = options.tagStore || TAG_STORE_MODULE?.createTagStore?.({ api, createRequestId: () => 'gallery-read-only' });
    const initialCategoryFilters = categoryFilterDefinitions(categoryStore?.current?.().categories || []) || [];
    const initialTagFilters = tagFilterDefinitions(tagStore?.current?.().tags || []);
    const state = { works: [], workBatchIndex: 0, characters: [], nextCursor: '', hasMore: false, worlds: [], worldNextCursor: '', worldHasMore: false, loading: false, detail: null, detailLoading: false, claimLoading: false, reportOpen: false, reportSubmitting: false, reportDone: false, error: '', selectedSort: 'all', randomStart: newRandomStart(), selectedTypes: [], selectedTags: [], categoryFilters: initialCategoryFilters.length ? initialCategoryFilters : GALLERY_TYPE_FILTERS, tagFilters: initialTagFilters, knownTagFilters: initialTagFilters, searchMode: false, searchSubmitted: false, keyword: '', searchDraft: '', tagQuery: '', tagLoading: false, openMenu: '', visibleLimit: INITIAL_VISIBLE_CHARACTERS, activeSection: 'home', creatorMountNode: null, startingCharacterId: '', justPublishedCharacterId: '', publicCreatorPage: null };
    state.worldDetail = null;
    state.worldRun = null;
    state.worldRunLoading = false;
    state.worldRunSending = false;
    state.worldPendingMessage = null;
    let listRequestSequence = 0;
    let publicCreatorRequestSequence = 0;
    let worldRunRequestSequence = 0;
    let worldReplyRequestSequence = 0;
    let tagListPromise = null;
    let tagCompositionActive = false;
    let filtersDirty = false;
    // 首页独立查询状态：永远是未筛选作品流，不读取广场的大类/标签/排序，也不共用广场分页。
    state.home = createHomeFeedState();
    let homeRequestSequence = 0;

    let publicMediaBatchPromise = null;
    function publicMediaScope() {
      return { environmentId: String(global?.SHEX_CLOUDBASE_CONFIG?.envId || 'default'), ownerId: 'public-character-gallery' };
    }
    function applyCoverUrl(image, url) {
      if (!image?.isConnected || !url) return;
      image.onload = () => image.classList.remove('x-cloud-image-loading', 'x-cloud-image-error');
      image.onerror = () => image.classList.add('x-cloud-image-error');
      image.src = url;
    }
    async function resolveCoverImages(scope = root) {
      const images = Array.from(scope?.querySelectorAll?.('[data-gallery-cover-source]') || []);
      const missing = new Map();
      await Promise.all(images.map(async image => {
        const source = String(image.dataset.galleryCoverSource || '').trim();
        if (!source) return;
        if (!/^cloud:\/\//i.test(source)) { if (!image.getAttribute('src')) image.src = source; return; }
        const cached = await global?.SHEXMediaCache?.get?.(source, publicMediaScope()).catch(() => '');
        if (cached) { applyCoverUrl(image, cached); return; }
        const targets = missing.get(source) || [];
        targets.push(image);
        missing.set(source, targets);
      }));
      const fileIds = Array.from(missing.keys());
      if (!fileIds.length) return;
      if (!publicMediaBatchPromise) {
        publicMediaBatchPromise = api.resolvePublicCharacterMedia(fileIds.slice(0, 40)).finally(() => { publicMediaBatchPromise = null; });
      }
      try {
        const result = await publicMediaBatchPromise;
        await Promise.all((result.media || []).map(async item => {
          const fileId = String(item.fileId || '');
          const networkUrl = String(item.tempUrl || '');
          const displayUrl = await global?.SHEXMediaCache?.cacheFromUrl?.(fileId, networkUrl, publicMediaScope()).catch(() => networkUrl) || networkUrl;
          (missing.get(fileId) || []).forEach(image => applyCoverUrl(image, displayUrl));
        }));
      } catch (_) {
        missing.forEach(targets => targets.forEach(image => image.classList.add('x-cloud-image-error')));
      }
    }

    function sectionNavMarkup() {
      return [
        { id: 'home', label: '首页' },
        { id: 'plaza', label: '广场' },
        { id: 'creator', label: '创作者' }
      ].map(item => `<button type="button" data-gallery-section="${item.id}" class="${state.activeSection === item.id ? 'is-active' : ''}" aria-current="${state.activeSection === item.id ? 'page' : 'false'}">${item.label}</button>`).join('');
    }

    function shell() {
      root.innerHTML = `<main class="shex-character-gallery${state.activeSection === 'home' ? ' is-home-active' : ''}">
        <section class="shex-gallery-top-panel">
          <header class="shex-gallery-brandbar"><button type="button" data-gallery-back aria-label="返回X世界">‹</button><div class="shex-gallery-compact-brand"><strong>SHE.X</strong><small>一人一界，一念一章</small></div></header>
          <nav class="shex-gallery-discoverybar" data-gallery-discovery aria-label="广场筛选"${discoveryVisible(state.activeSection, hasGalleryAccess) ? '' : ' hidden'}>
            <div class="shex-gallery-primary-menus" data-gallery-primary-menus>${primaryMenuMarkup(state)}</div>
            <form class="shex-gallery-searchbar" data-gallery-search-form hidden role="search">
              <button type="button" data-gallery-search-back aria-label="退出搜索，返回广场筛选">←</button>
              <input type="search" data-gallery-keyword maxlength="120" aria-label="搜索角色、创作者或关键词" placeholder="搜索角色、创作者或关键词" autocomplete="off" enterkeyhint="search">
              <button type="submit">搜索</button>
            </form>
            <section class="shex-gallery-popup" data-gallery-popup hidden></section>
          </nav>
        </section>
        <nav class="shex-gallery-section-nav" data-gallery-section-nav aria-label="角色空间导航">${sectionNavMarkup()}</nav>
        <section class="shex-gallery-section" data-gallery-view="home"><div class="shex-gallery-feed-alert" data-gallery-feed-alert hidden></div><div class="shex-gallery-feed" data-gallery-feed aria-live="polite"></div></section>
        <section class="shex-gallery-section" data-gallery-view="plaza" hidden>
          <div class="shex-gallery-alert" data-gallery-alert hidden></div>
          <section class="shex-gallery-grid" data-gallery-grid aria-live="polite"></section>
          <button class="shex-gallery-more" type="button" data-gallery-more hidden>查看更多角色</button>
        </section>
        <section class="shex-gallery-section shex-gallery-creator-section" data-gallery-view="creator" hidden><div data-gallery-creator-mount aria-live="polite"></div></section>
      </main>`;
      state.creatorMountNode = null;
      root.querySelector('[data-gallery-back]')?.addEventListener('click', () => global?.dispatchEvent?.(new CustomEvent('shex:character-gallery-back')));
      root.querySelector('[data-gallery-more]')?.addEventListener('click', () => void showMore());
      root.querySelector('[data-gallery-section-nav]')?.addEventListener('click', (event) => {
        const button = event.target.closest?.('[data-gallery-section]');
        if (button) showSection(button.dataset.gallerySection);
      });
      root.querySelector('[data-gallery-primary-menus]')?.addEventListener('click', (event) => {
        const button = event.target.closest?.('[data-gallery-menu]');
        if (!button) return;
        if (button.dataset.galleryMenu === 'search') {
          state.searchMode = true; state.searchSubmitted = false; state.keyword = ''; state.searchDraft = '';
          state.openMenu = ''; renderPrimaryMenus(); renderPopup();
          const input = root.querySelector('[data-gallery-keyword]');
          if (input) { input.value = ''; input.focus(); }
          return;
        }
        state.openMenu = state.openMenu === button.dataset.galleryMenu ? '' : String(button.dataset.galleryMenu || '');
        renderPrimaryMenus(); renderPopup();
        if (state.openMenu === 'tag') void loadTagFilters();
      });
      root.querySelector('[data-gallery-keyword]')?.addEventListener('input', event => {
        state.searchDraft = String(event.target.value || '').slice(0, 120);
      });
      root.querySelector('[data-gallery-search-form]')?.addEventListener('submit', event => {
        event.preventDefault();
        state.keyword = String(root.querySelector('[data-gallery-keyword]')?.value || '').trim().slice(0, 120);
        state.searchDraft = state.keyword; state.searchSubmitted = true;
        void reloadWithFilters();
      });
      root.querySelector('[data-gallery-search-back]')?.addEventListener('click', () => {
        const reload = state.searchSubmitted || filtersDirty;
        state.searchMode = false; state.searchSubmitted = false; state.keyword = ''; state.searchDraft = '';
        filtersDirty = false; state.openMenu = '';
        renderPrimaryMenus(); renderPopup();
        if (reload) void reloadWithFilters();
      });
      root.querySelector('[data-gallery-popup]')?.addEventListener('compositionstart', (event) => {
        if (event.target?.matches?.('[data-gallery-tag-search]')) tagCompositionActive = true;
      });
      root.querySelector('[data-gallery-popup]')?.addEventListener('compositionend', (event) => {
        if (!event.target?.matches?.('[data-gallery-tag-search]')) return;
        tagCompositionActive = false;
        state.tagQuery = String(event.target.value || '').slice(0, 40);
        renderTagResults();
      });
      root.querySelector('[data-gallery-popup]')?.addEventListener('input', (event) => {
        if (!event.target?.matches?.('[data-gallery-tag-search]')) return;
        state.tagQuery = String(event.target.value || '').slice(0, 40);
        if (tagCompositionActive || event.isComposing === true) return;
        renderTagResults();
      });
      root.querySelector('[data-gallery-popup]')?.addEventListener('click', (event) => {
        const choiceButton = event.target.closest?.('[data-gallery-choice]');
        const clearButton = event.target.closest?.('[data-gallery-clear]');
        const doneButton = event.target.closest?.('[data-gallery-popup-done]');
        if (!choiceButton && !clearButton && !doneButton) return;
        state.visibleLimit = INITIAL_VISIBLE_CHARACTERS;
        if (choiceButton) {
          filtersDirty = toggleChoice(choiceButton.dataset.galleryChoiceGroup, choiceButton.dataset.galleryChoice) || filtersDirty;
          renderPrimaryMenus();
          if (choiceButton.dataset.galleryChoiceGroup === 'tag') renderTagResults();
          else renderPopup();
          return;
        }
        if (clearButton) {
          filtersDirty = clearCurrentMenu() || filtersDirty;
          renderPrimaryMenus(); renderPopup();
          return;
        }
        state.openMenu = '';
        renderPrimaryMenus(); renderPopup();
        if (!filtersDirty) { render(); return; }
        filtersDirty = false;
        // 只在用户确认最终条件时回到第一页，避免每点一个筛选项就重复请求。
        void reloadWithFilters();
      });
      root.querySelector('[data-gallery-grid]')?.addEventListener('click', (event) => {
        const creatorButton = event.target.closest?.('[data-open-creator-id]');
        if (creatorButton) { event.preventDefault(); event.stopPropagation(); void openPublicCreatorPage(creatorButton.dataset.openCreatorId); return; }
        const worldButton = event.target.closest?.('[data-open-world-template-id]');
        if (worldButton) { event.preventDefault(); event.stopPropagation(); void enterWorldFromCard(worldButton.dataset.openWorldTemplateId); return; }
        const card = event.target.closest?.('[data-character-id]');
        if (card) void startChat(card.dataset.characterId, card);
      });
      root.querySelector('[data-gallery-feed]')?.addEventListener('click', (event) => {
        const creatorButton = event.target.closest?.('[data-open-creator-id]');
        const chatButton = event.target.closest?.('[data-feed-start-chat]');
        const button = event.target.closest?.('[data-feed-open-character]');
        if (creatorButton) { event.preventDefault(); event.stopPropagation(); void openPublicCreatorPage(creatorButton.dataset.openCreatorId); return; }
        // 首页与广场世界卡共用同一条 canonical 进入链，不复制第二套 WorldRun 创建代码。
        const worldButton = event.target.closest?.('[data-open-world-template-id]');
        if (worldButton) {
          event.preventDefault();
          event.stopPropagation();
          void enterWorldFromCard(worldButton.dataset.openWorldTemplateId);
          return;
        }
        if (chatButton) {
          event.preventDefault();
          event.stopPropagation();
          void startChat(chatButton.dataset.feedStartChat, chatButton);
          return;
        }
        const homeMore = event.target.closest?.('[data-gallery-home-more]');
        if (homeMore) { event.preventDefault(); event.stopPropagation(); void fetchHomePage(); return; }
        if (button?.dataset.feedOpenCharacter) void startChat(button.dataset.feedOpenCharacter, button);
      });
      renderPrimaryMenus();
      applySection();
      void loadTagFilters();
    }

    function applySection() {
      const gallery = root.querySelector('.shex-character-gallery');
      gallery?.classList.toggle('is-home-active', state.activeSection === 'home');
      gallery?.classList.toggle('is-creator-active', state.activeSection === 'creator');
      root.querySelectorAll?.('[data-gallery-view]').forEach(node => { node.hidden = node.dataset.galleryView !== state.activeSection; });
      const discovery = root.querySelector('[data-gallery-discovery]');
      if (discovery) discovery.hidden = !discoveryVisible(state.activeSection, hasGalleryAccess);
      const nav = root.querySelector('[data-gallery-section-nav]');
      if (nav) nav.innerHTML = sectionNavMarkup();
      if (state.activeSection === 'creator') {
        const mount = root.querySelector('[data-gallery-creator-mount]');
        if (mount && onOpenCreator && state.creatorMountNode !== mount) {
          state.creatorMountNode = mount;
          onOpenCreator(mount);
        }
        if (mount) onCreatorSectionShown?.(mount);
      }
    }

    function showSection(sectionId = 'home', optionsValue = {}) {
      const next = ['home', 'plaza', 'creator'].includes(sectionId) ? sectionId : 'home';
      state.activeSection = next;
      state.openMenu = '';
      applySection();
      renderPopup();
      if (next === 'home') {
        root.querySelector('[data-gallery-feed]')?.scrollTo?.({ top: 0, behavior: 'smooth' });
        // 用户主动点“首页”时重新拉取首页作品流，制造刷新感。
        if (optionsValue.refreshHome !== false) void refreshHomeFeed();
      }
    }

    function renderPrimaryMenus() {
      const container = root.querySelector('[data-gallery-primary-menus]');
      if (container) { container.innerHTML = primaryMenuMarkup(state); container.hidden = state.searchMode; }
      const form = root.querySelector('[data-gallery-search-form]');
      if (form) form.hidden = !state.searchMode;
      const input = root.querySelector('[data-gallery-keyword]');
      if (input) input.value = state.searchDraft;
    }

    function renderPopup() {
      const popup = root.querySelector('[data-gallery-popup]');
      if (!popup) return;
      popup.hidden = !state.openMenu;
      if (!state.openMenu) { popup.innerHTML = ''; return; }
      let settings;
      if (state.openMenu === 'sort') {
        settings = { title: '排列方式', note: '单选', body: filterMarkup(GALLERY_SORTS, [state.selectedSort], 'sort', 1) };
      } else if (state.openMenu === 'type') {
        settings = { title: '内容大类', note: `单选 · 已选${state.selectedTypes.length}个`, body: filterMarkup(state.categoryFilters, state.selectedTypes, 'type', 1) };
      } else {
        settings = { title: '细分标签', note: `最多选择10个 · 已选${state.selectedTags.length}个`, body: '' };
      }
      const tagMenu = state.openMenu === 'tag';
      const search = tagMenu ? tagSearchMarkup(state.tagQuery) : '';
      popup.innerHTML = `<header><strong>${settings.title}</strong><small>${settings.note}</small></header>${search}<div class="shex-gallery-popup-options${tagMenu ? ' is-tag-results' : ''}"${tagMenu ? ' data-gallery-tag-results' : ''}>${settings.body}</div><footer><button type="button" data-gallery-clear>清除所选</button><button type="button" class="primary" data-gallery-popup-done>完成</button></footer>`;
      if (tagMenu) renderTagResults();
    }

    function renderTagResults() {
      const container = root.querySelector('[data-gallery-tag-results]');
      if (!container) return;
      const filtered = filterTagDefinitionsByQuery(state.tagFilters, state.tagQuery);
      const body = tagChipsMarkup(filtered, state.selectedTags, 'tag', 10);
      container.innerHTML = body || `<p class="shex-gallery-popup-empty">${state.tagLoading ? '正在读取标签…' : state.tagQuery.trim() ? '没有找到相关标签' : '暂无可用标签'}</p>`;
    }

    async function refreshCategoryFilters() {
      if (!categoryStore?.refresh) return;
      const result = await categoryStore.refresh();
      const next = categoryFilterDefinitions(result?.categories || []);
      if (next.length) state.categoryFilters = next;
      renderPrimaryMenus(); renderPopup();
    }

    async function loadTagFilters(loadOptions = {}) {
      if (!tagStore?.list) return;
      if (tagListPromise && loadOptions.force !== true) return tagListPromise;
      state.tagLoading = true;
      renderTagResults();
      const request = loadAllTagFilterDefinitions(tagStore, { force: loadOptions.force === true });
      tagListPromise = request;
      try {
        const next = await request;
        if (tagListPromise !== request) return;
        state.tagFilters = next;
        state.knownTagFilters = mergeFilterDefinitions(state.knownTagFilters, state.tagFilters);
      } catch (error) {
        if (tagListPromise === request) state.error = error?.message || '公共标签读取失败，请稍后重试';
      } finally {
        if (tagListPromise === request) {
          tagListPromise = null;
          state.tagLoading = false;
          renderTagResults();
        }
      }
    }

    function toggleChoice(group, choiceId) {
      if (group === 'sort') {
        const nextSort = GALLERY_SORTS.some(item => item.id === choiceId) ? choiceId : 'all';
        const changed = state.selectedSort !== nextSort;
        state.selectedSort = nextSort;
        return changed;
      }
      const key = group === 'type' ? 'selectedTypes' : 'selectedTags';
      const limit = group === 'type' ? 1 : 10;
      const selected = Array.from(state[key]);
      const before = selected.join('\u0000');
      const existingIndex = selected.indexOf(choiceId);
      if (existingIndex >= 0) selected.splice(existingIndex, 1);
      else if (selected.length < limit) selected.push(choiceId);
      state[key] = selected;
      return before !== selected.join('\u0000');
    }

    function clearCurrentMenu() {
      if (state.openMenu === 'sort') {
        const changed = state.selectedSort !== 'all'; state.selectedSort = 'all'; return changed;
      }
      if (state.openMenu === 'type') {
        const changed = state.selectedTypes.length > 0; state.selectedTypes = []; return changed;
      }
      if (state.openMenu === 'tag') {
        const changed = state.selectedTags.length > 0; state.selectedTags = []; return changed;
      }
      return false;
    }

    // 服务端已经在完整公开目录上筛选并按 publishedAt desc + characterId asc 排好序，
    // 这里直接用返回顺序。绝不能再在本地按已加载的一页做过滤或排序 ——
    // 那正是 x98 之前"点标签只在最新 20 条里找"的错误结果来源。
    function visibleCharacters() {
      return state.characters;
    }

    function currentFilterPayload() {
      if (state.searchMode && state.searchSubmitted) return buildFilterPayload([], [], state.categoryFilters, state.knownTagFilters);
      return buildFilterPayload(state.selectedTypes, state.selectedTags, state.categoryFilters, state.knownTagFilters);
    }

    async function reloadWithFilters() {
      state.works = [];
      state.workBatchIndex = 0;
      state.randomStart = newRandomStart();
      state.characters = [];
      state.nextCursor = '';
      state.hasMore = true;
      state.worlds = [];
      state.worldNextCursor = '';
      state.worldHasMore = true;
      state.visibleLimit = INITIAL_VISIBLE_CHARACTERS;
      state.error = '';
      render();
      await fetchNextPage({ supersede: true });
    }

    async function openDetail(characterId) {
      if (state.detailLoading) return;
      state.detailLoading = true; state.error = '';
      try {
        const result = await api.getPublishedCharacter(characterId);
        state.detail = result.character || null;
        if (!state.detail) throw new Error('角色公开详情为空');
        state.reportOpen = false; state.reportSubmitting = false; state.reportDone = false;
        renderDetail();
      } catch (error) {
        state.error = error?.message || '角色公开详情读取失败，请稍后重试';
        render();
      } finally { state.detailLoading = false; }
    }

    function worldDetailMarkup(input = {}) {
      if (typeof WORLD_RUN_VIEW?.worldDetailMarkup === 'function') return WORLD_RUN_VIEW.worldDetailMarkup(input);
      return '<section class="shex-world-run-detail" data-world-run-detail><p>世界详情暂时不可用</p></section>';
    }

    function worldRunMarkup(input = {}) {
      if (typeof WORLD_RUN_VIEW?.worldRunMarkup === 'function') return WORLD_RUN_VIEW.worldRunMarkup(input);
      return '<section class="shex-world-run-runtime" data-world-run-runtime><p>世界体验暂时不可用</p></section>';
    }

    function renderWorldDetail() {
      if (!state.worldDetail) return;
      const item = state.worldDetail;
      root.innerHTML = worldDetailMarkup({
        ...item,
        loading: state.worldRunLoading,
        error: state.error
      });
      root.querySelector('[data-world-run-back]')?.addEventListener('click', () => {
        worldRunRequestSequence += 1;
        state.worldDetail = null;
        state.worldRun = null;
        state.worldRunLoading = false;
        state.error = '';
        shell();
        render();
      });
      root.querySelector('[data-world-run-start]')?.addEventListener('click', () => void startWorldRun());
      resolveCoverImages(root);
    }

    function renderWorldRun() {
      if (!state.worldRun) return;
      root.innerHTML = worldRunMarkup({ ...state.worldRun, sending: state.worldRunSending, error: state.error,
        inputValue: state.worldPendingMessage?.messageText || '' });
      root.querySelectorAll('[data-world-run-exit]').forEach(button => {
        button.addEventListener('click', () => {
          worldReplyRequestSequence += 1;
          state.worldRun = null;
          state.worldRunLoading = false;
          state.worldRunSending = false;
          state.worldPendingMessage = null;
          state.error = '';
          renderWorldDetail();
        });
      });
      root.querySelector('[data-world-run-form]')?.addEventListener('submit', event => void sendWorldMessage(event));
      resolveCoverImages(root);
    }

    function createWorldMessageIds() {
      const token = global?.crypto?.randomUUID?.().replace(/-/g, '') || `${Date.now()}_${Math.random().toString(36).slice(2)}`;
      return { messageId: `world_message_${token}`, requestId: `world_request_${token}` };
    }

    async function sendWorldMessage(event) {
      event?.preventDefault?.();
      if (!state.worldRun || state.worldRunSending || typeof worldRunApi?.generateReply !== 'function') return;
      const inputNode = root.querySelector('[data-world-run-message-input]');
      const messageText = String(inputNode?.value || '').trim();
      if (!messageText) return;
      const run = state.worldRun.run || {};
      const runId = String(run.runId || state.worldRun.runId || '').trim();
      const worldTemplateId = String(run.worldTemplateId || state.worldDetail?.worldTemplateId || '').trim();
      if (!runId || !worldTemplateId) { state.error = '世界存档状态无效，请退出后重新进入'; renderWorldRun(); return; }
      const pendingRequest = retryableWorldMessageRequest(state.worldPendingMessage,
        { worldTemplateId, runId, messageText }, createWorldMessageIds);
      const ids = { messageId: pendingRequest.messageId, requestId: pendingRequest.requestId };
      state.worldPendingMessage = pendingRequest;
      const requestSequence = ++worldReplyRequestSequence;
      state.worldRunSending = true;
      state.error = '';
      renderWorldRun();
      try {
        const result = await worldRunApi.generateReply({ worldTemplateId, runId, ...ids, messageText });
        if (requestSequence !== worldReplyRequestSequence || !state.worldRun) return;
        const priorMessages = Array.isArray(state.worldRun.messages) ? state.worldRun.messages : [];
        const replyText = String(result?.reply?.text || '').trim();
        state.worldRun = {
          ...state.worldRun,
          run: { ...run, ...(result.simulatorRun || {}) },
          messages: [...priorMessages,
            { messageId: ids.messageId, role: 'user', text: messageText },
            ...(replyText ? [{ messageId: String(result?.reply?.messageId || `${ids.messageId}_assistant`), role: 'assistant', text: replyText }] : [])].slice(-50)
        };
        state.worldRunSending = false;
        state.worldPendingMessage = null;
        renderWorldRun();
        root.querySelector('[data-world-run-messages]')?.scrollTo?.({ top: 999999, behavior: 'smooth' });
      } catch (error) {
        if (requestSequence !== worldReplyRequestSequence || !state.worldRun) return;
        state.worldRunSending = false;
        state.error = error?.message || '世界回复生成失败，请稍后重试';
        renderWorldRun();
      }
    }

    async function openWorldDetail(worldTemplateId, optionsValue = {}) {
      const cleanId = String(worldTemplateId || '').trim();
      if (!cleanId) return;
      const item = (state.publicCreatorPage?.worlds || []).concat(state.worlds, state.home?.worlds || [])
        .find(candidate => String(candidate?.worldTemplateId || '') === cleanId);
      state.detail = null;
      state.publicCreatorPage = null;
      state.worldDetail = item || { worldTemplateId: cleanId, title: '未命名世界' };
      state.worldRun = null;
      state.worldRunLoading = false;
      state.worldPendingMessage = null;
      state.error = '';
      if (optionsValue.render !== false) renderWorldDetail();
    }

    async function enterWorldFromCard(worldTemplateId) {
      await openWorldDetail(worldTemplateId, { render:false });
      return startWorldRun({ renderDetail:false });
    }

    function renderWorldEntryFailure(showDetail) {
      if (showDetail) { renderWorldDetail(); return; }
      state.worldDetail = null;
      shell();
      render();
    }

    async function startWorldRun(optionsValue = {}) {
      const item = state.worldDetail;
      const worldTemplateId = String(item?.worldTemplateId || '').trim();
      if (!worldTemplateId || state.worldRunLoading) return;
      const showDetail = optionsValue.renderDetail !== false;
      if (typeof worldRunApi?.enterWorld !== 'function') {
        state.error = '世界体验服务暂未接入';
        renderWorldEntryFailure(showDetail);
        return;
      }
      const requestSequence = ++worldRunRequestSequence;
      state.worldRunLoading = true;
      state.error = '';
      if (showDetail) renderWorldDetail();
      try {
        const result = await worldRunApi.enterWorld({ worldTemplateId });
        if (requestSequence !== worldRunRequestSequence || !state.worldDetail || String(state.worldDetail.worldTemplateId || '') !== worldTemplateId) return;
        state.worldRunLoading = false;
        state.worldPendingMessage = null;
        state.worldRunSending = false;
        state.error = '';
        if (!onEnterWorldRun) throw new Error('X传讯世界入口暂未接通');
        console.warn('[WORLD_RUN_LOAD_TRACE]', {
          stage:'gallery_item_before_world_entry',
          at:Date.now(),
          runId:String(result?.runId || result?.run?.runId || ''),
          worldTemplateId,
          worldVersionId:String(result?.worldVersionId || result?.run?.worldVersionId || result?.run?.pinnedTemplateVersion || ''),
          world:result?.world && typeof result.world === 'object' ? {
            title:String(result.world.title || ''),
            hasBackground:Boolean(result.world.backgroundUrl || result.world.backgroundAssetId),
            hasPromo:Boolean(result.world.promoUrl || result.world.promoAssetId)
          } : null,
          xWorldItem:result?.xWorldItem || null,
          galleryItem:item ? {
            worldTemplateId:String(item.worldTemplateId || ''),
            title:String(item.title || ''),
            hasBackground:Boolean(item.backgroundUrl || item.backgroundAssetId),
            hasPromo:Boolean(item.promoUrl || item.promoAssetId)
          } : null,
          title:String(result?.world?.title || item?.title || ''),
          loadedFlag:Boolean(result?.world && (result?.runId || result?.run?.runId)),
          source:'character_gallery'
        });
        await onEnterWorldRun({
          ...result,
          galleryItem:item || null,
          worldTemplateId:String(result?.worldTemplateId || result?.run?.worldTemplateId || worldTemplateId),
          worldVersionId:String(result?.worldVersionId || result?.run?.worldVersionId || result?.run?.pinnedTemplateVersion || ''),
          world:{ ...(item || {}), ...(result?.world || {}) }
        });
      } catch (error) {
        if (requestSequence !== worldRunRequestSequence) return;
        state.worldRunLoading = false;
        state.error = error?.message || '暂时无法进入世界，请稍后重试';
        renderWorldEntryFailure(showDetail);
      }
    }

    function renderDetail() {
      if (!state.detail) return;
      root.innerHTML = detailMarkup(state.detail, labels, {
        claimed: isClaimed(state.detail.characterId),
        claiming: state.claimLoading,
        reportOpen: state.reportOpen,
        reportSubmitting: state.reportSubmitting,
        reportDone: state.reportDone,
        error: state.error
      });
      root.querySelector('[data-gallery-list-back]')?.addEventListener('click', () => { state.detail = null; state.error = ''; shell(); render(); });
      root.querySelector('[data-gallery-claim]')?.addEventListener('click', () => void claimCurrent());
      root.querySelector('[data-gallery-report-toggle]')?.addEventListener('click', () => {
        if (state.reportDone) return;
        state.reportOpen = !state.reportOpen;
        renderDetail();
      });
      root.querySelector('[data-gallery-report-form]')?.addEventListener('submit', (event) => void submitReport(event));
      root.querySelector('[data-open-creator-id]')?.addEventListener('click', (event) => void openPublicCreatorPage(event.currentTarget.dataset.openCreatorId));
      resolveCoverImages(root);
    }

    async function openPublicCreatorPage(creatorId, pageOptions = {}) {
      const cleanCreatorId = String(creatorId || '').trim();
      if (!cleanCreatorId || !api.getPublicCreatorPage) return;
      const previous = state.publicCreatorPage;
      const append = pageOptions.append === true && previous?.creatorId === cleanCreatorId;
      if (append && previous.loading) return;
      const worldEnabled = typeof worldApi?.listPublishedWorlds === 'function';
      const requestSequence = ++publicCreatorRequestSequence;
      const page = {
        creatorId: cleanCreatorId,
        creator: append ? previous.creator : null,
        characters: append ? previous.characters.slice() : [],
        worlds: append ? previous.worlds.slice() : [],
        works: append ? previous.works.slice() : [],
        nextCursor: append ? previous.nextCursor : '',
        worldNextCursor: append ? previous.worldNextCursor : '',
        characterHasMore: append ? previous.characterHasMore : true,
        worldHasMore: worldEnabled && (append ? previous.worldHasMore : true),
        hasMore: true, loading: true, error: '',
        returnToDetail: append ? previous.returnToDetail : Boolean(state.detail)
      };
      state.publicCreatorPage = page;
      renderPublicCreatorPage();
      try {
        const settled = await settleGallerySources(
          page.characterHasMore ? api.getPublicCreatorPage({ creatorId: cleanCreatorId, limit: 20, cursor: page.nextCursor }) : Promise.resolve(null),
          page.worldHasMore ? worldApi.listPublishedWorlds({ creatorId: cleanCreatorId, sort: 'latest', limit: 20, cursor: page.worldNextCursor }) : Promise.resolve(null)
        );
        if (requestSequence !== publicCreatorRequestSequence || state.publicCreatorPage !== page) return;
        const result = settled.characterResult;
        const worldResult = settled.worldResult;
        const incoming = (Array.isArray(result?.characters) ? result.characters : []).filter(item => String(item?.creatorId || item?.creatorSummary?.creatorId || '') === cleanCreatorId);
        const incomingWorlds = (Array.isArray(worldResult?.items) ? worldResult.items : []).filter(item => String(item?.creatorId || item?.creatorSummary?.creatorId || '') === cleanCreatorId);
        const appendUnique = (target, items, idKey) => {
          const known = new Set(target.map(item => String(item[idKey] || '')));
          items.forEach(item => { const id = String(item?.[idKey] || ''); if (id && !known.has(id)) { known.add(id); target.push(item); } });
        };
        if (result) {
          appendUnique(page.characters, incoming, 'characterId');
          page.creator = result.creator || page.creator;
          page.nextCursor = String(result.nextCursor || '');
          page.characterHasMore = result.hasMore === true && Boolean(page.nextCursor);
        }
        if (worldResult) {
          appendUnique(page.worlds, incomingWorlds, 'worldTemplateId');
          page.creator = page.creator || incomingWorlds[0]?.creatorSummary || null;
          page.worldNextCursor = String(worldResult.nextCursor || '');
          page.worldHasMore = Boolean(page.worldNextCursor);
        }
        page.works = mergeSeededWorkBatch(page.works, incoming, incomingWorlds);
        page.hasMore = page.characterHasMore || page.worldHasMore;
        if (settled.characterError || settled.worldError) page.error = '部分公开作品暂时未加载，请点击查看更多重试';
      } catch (error) {
        if (requestSequence !== publicCreatorRequestSequence || state.publicCreatorPage !== page) return;
        page.error = error?.message || '创作者主页读取失败，请稍后重试';
      } finally {
        if (requestSequence === publicCreatorRequestSequence && state.publicCreatorPage === page) {
          page.loading = false;
          renderPublicCreatorPage();
        }
      }
    }

    function renderPublicCreatorPage() {
      if (!state.publicCreatorPage) return;
      const page = state.publicCreatorPage;
      root.innerHTML = publicCreatorPageMarkup(page);
      root.querySelector('[data-creator-page-back]')?.addEventListener('click', () => {
        const returnToDetail = page.returnToDetail && state.detail;
        publicCreatorRequestSequence += 1;
        worldRunRequestSequence += 1;
        state.worldDetail = null;
        state.worldRunLoading = false;
        state.publicCreatorPage = null;
        if (returnToDetail) renderDetail();
        else { shell(); render(); }
      });
      root.querySelector('[data-creator-page-more]')?.addEventListener('click', () => {
        if (!page.loading && page.hasMore) void openPublicCreatorPage(page.creatorId, { append: true });
      });
      root.querySelector('[data-public-creator-page]')?.addEventListener('click', (event) => {
        const creatorButton = event.target.closest?.('[data-open-creator-id]');
        if (creatorButton) { event.preventDefault(); event.stopPropagation(); return; }
        const worldButton = event.target.closest?.('[data-open-world-template-id]');
        if (worldButton) { event.preventDefault(); event.stopPropagation(); void enterWorldFromCard(worldButton.dataset.openWorldTemplateId); return; }
        const card = event.target.closest?.('[data-character-id]');
        if (card) void startChat(card.dataset.characterId, card);
      });
      resolveCoverImages(root);
    }

    async function submitReport(event) {
      event?.preventDefault?.();
      if (!state.detail || state.reportSubmitting || !api.submitCharacterReport) return;
      const data = new FormData(event.currentTarget);
      state.reportSubmitting = true; state.error = ''; renderDetail();
      try {
        await api.submitCharacterReport({
          characterId: state.detail.characterId,
          versionId: state.detail.versionId,
          category: data.get('category'),
          note: data.get('note')
        });
        state.reportDone = true;
        state.reportOpen = false;
      } catch (error) {
        state.error = error?.message || '举报暂时没有提交成功，请稍后重试';
      } finally {
        state.reportSubmitting = false;
        renderDetail();
      }
    }

    async function claimCurrent() {
      if (!state.detail || state.claimLoading || isClaimed(state.detail.characterId)) return;
      if (!onClaim) { state.error = '领取功能尚未接入'; renderDetail(); return; }
      state.claimLoading = true; state.error = ''; renderDetail();
      try {
        await onClaim(state.detail);
      } catch (error) {
        state.error = error?.message || '角色暂时没有加入成功，请稍后重试';
      } finally {
        state.claimLoading = false; renderDetail();
      }
    }

    async function startChat(characterId, button) {
      if (!characterId || !onStartChat || button?.disabled || state.startingCharacterId) return;
      const item = (state.publicCreatorPage?.characters || []).concat(state.characters, state.home?.characters || [])
        .find(candidate => String(candidate?.characterId || '') === String(characterId)) || { characterId };
      const isButton = String(button?.tagName || '').toLowerCase() === 'button';
      const isFeedChatButton = Boolean(button?.dataset?.feedStartChat);
      const previousLabel = isFeedChatButton ? button.textContent || '' : '';
      state.startingCharacterId = String(characterId);
      if (isButton) {
        button.disabled = true;
        button.setAttribute('aria-busy', 'true');
        button.classList?.add('is-opening-chat');
        if (isFeedChatButton) button.textContent = isClaimed(characterId) ? '正在打开…' : '正在加入…';
      }
      state.error = '';
      try {
        await onStartChat(item);
      } catch (error) {
        state.error = error?.message || '暂时无法打开聊天，请稍后重试';
        if (isButton) {
          button.disabled = false;
          button.removeAttribute('aria-busy');
          button.classList?.remove('is-opening-chat');
          if (isFeedChatButton) button.textContent = previousLabel;
        }
      } finally {
        state.startingCharacterId = '';
      }
    }

    function render() {
      const grid = root.querySelector('[data-gallery-grid]');
      const feed = root.querySelector('[data-gallery-feed]');
      const feedAlert = root.querySelector('[data-gallery-feed-alert]');
      const alert = root.querySelector('[data-gallery-alert]');
      const more = root.querySelector('[data-gallery-more]');
      if (!grid || !feed || !alert || !more) return;
      const visible = state.works;
      const shown = visibleWorkSlice(visible, state.visibleLimit);
      alert.hidden = !state.error; alert.textContent = state.error;
      if (feedAlert) { feedAlert.hidden = !state.error; feedAlert.textContent = state.error; }
      grid.innerHTML = shown.length ? shown.map(work => work.kind === 'simulator' ? worldCardMarkup(work.item) : cardMarkup(work.item)).join('')
        : `<div class="shex-gallery-empty">${state.loading ? '正在读取已发布作品…' : state.searchMode && state.searchSubmitted ? (state.hasMore || state.worldHasMore ? '本批暂无相关作品，可继续查看更多' : '没有找到相关作品') : state.characters.length ? '这一类故事还没有作品，先看看其他分类吧。' : '目前还没有正式发布的作品。'}</div>`;
      more.hidden = !(visible.length > shown.length || state.hasMore || state.worldHasMore); more.disabled = state.loading;
      more.textContent = state.loading ? '正在读取…' : '查看更多作品';
      const home = state.home;
      const homeItems = home.works;
      const homeMore = homeItems.length && (home.hasMore || home.worldHasMore)
        ? `<button class="shex-gallery-more shex-gallery-home-more" type="button" data-gallery-home-more${home.loading ? ' disabled' : ''}>${home.loading ? '正在读取…' : '查看更多作品'}</button>`
        : '';
      feed.innerHTML = homeItems.length ? homeItems.map((work, index) => feedWorkMarkup(work, index, { claimed: work.kind === 'character' && isClaimed(work.stableId) })).join('') + homeMore
        : `<div class="shex-gallery-empty">${home.loading ? '正在准备作品首页…' : '目前还没有可以展示的作品。'}</div>`;
      resolveCoverImages(grid);
      resolveCoverImages(feed);
    }

    async function fetchHomePage(optionsValue = {}) {
      const home = state.home;
      const reset = optionsValue.reset === true;
      if (!reset && (home.loading || (!home.hasMore && !home.worldHasMore))) return;
      const requestSequence = ++homeRequestSequence;
      const cursor = reset ? '' : home.nextCursor;
      const worldCursor = reset ? '' : home.worldNextCursor;
      home.loading = true; render();
      try {
        // 不带任何广场筛选。sort=all + 新 randomStart 复用现有随机浏览参数（c2 下由服务端生效）；
        // 当前 legacy 模式会忽略它，所以前端再对本批次洗牌，保证每次进入首页有变化。
        const settled = await settleGallerySources(
          reset || home.hasMore
            ? api.listPublishedCharacters({ limit: MIXED_FEED_PAGE_SIZE, cursor, sort: 'all', randomStart: home.randomStart })
            : Promise.resolve({ characters: [], nextCursor: '', hasMore: false }),
          typeof worldApi?.listPublishedWorlds === 'function' && (reset || home.worldHasMore)
            ? worldApi.listPublishedWorlds({ limit: reset || home.hasMore ? MIXED_WORLD_PAGE_SIZE : MIXED_FEED_PAGE_SIZE, cursor: worldCursor, sort: 'all', randomStart: home.randomStart })
            : Promise.resolve({ items: [], nextCursor: '', hasMore: false })
        );
        if (requestSequence !== homeRequestSequence) return;
        const result = settled.characterResult;
        const worldResult = settled.worldResult;
        const incomingCharacters = Array.isArray(result?.characters) ? result.characters : [];
        const incomingWorlds = Array.isArray(worldResult?.items) ? worldResult.items : [];
        if (reset) {
          home.works = [];
          home.characters = [];
          home.worlds = [];
          home.batchIndex = 0;
        }
        const knownCharacters = new Set(home.characters.map(item => String(item?.characterId || '')));
        incomingCharacters.forEach(item => { if (item?.characterId && !knownCharacters.has(String(item.characterId))) { knownCharacters.add(String(item.characterId)); home.characters.push(item); } });
        const knownWorlds = new Set(home.worlds.map(item => String(item?.worldTemplateId || '')));
        incomingWorlds.forEach(item => { if (item?.worldTemplateId && !knownWorlds.has(String(item.worldTemplateId))) { knownWorlds.add(String(item.worldTemplateId)); home.worlds.push(item); } });
        home.works = mergeSeededWorkBatch(home.works, incomingCharacters, incomingWorlds, `${home.randomStart}:${home.batchIndex}`, { shuffleWithinSources: true });
        home.batchIndex += 1;
        if (result) {
          home.nextCursor = String(result.nextCursor || '');
          home.hasMore = result.hasMore === true && Boolean(home.nextCursor);
          if (/^[a-f0-9]{16}$/i.test(String(result.randomStart || ''))) home.randomStart = String(result.randomStart).toLowerCase();
        }
        if (worldResult) {
          home.worldNextCursor = String(worldResult.nextCursor || '');
          home.worldHasMore = worldResult.hasMore === true ? Boolean(home.worldNextCursor) : Boolean(home.worldNextCursor);
        }
        if (settled.characterError && settled.worldError) {
          state.error = '作品首页读取失败，请稍后重试';
        } else {
          state.error = '';
          if (settled.characterError) notify('单人角色作品暂时未加载');
          else if (settled.worldError) notify('世界作品暂时未加载');
        }
      } catch (error) {
        if (requestSequence !== homeRequestSequence) return;
        state.error = error?.message || '作品首页读取失败，请稍后重试';
      } finally {
        if (requestSequence === homeRequestSequence) {
          home.loading = false;
          render();
        }
      }
    }

    function refreshHomeFeed() {
      state.home.randomStart = newRandomStart();
      state.home.nextCursor = '';
      state.home.worldNextCursor = '';
      state.home.hasMore = true;
      state.home.worldHasMore = true;
      state.home.batchIndex = 0;
      return fetchHomePage({ reset: true });
    }

    async function fetchNextPage(optionsValue = {}) {
      const supersede = optionsValue.supersede === true;
      if ((!supersede && state.loading) || (!state.hasMore && !state.worldHasMore && state.works.length)) return;
      const requestSequence = ++listRequestSequence;
      const cursor = state.nextCursor;
      const filters = currentFilterPayload();
      state.loading = true; state.error = ''; render();
      try {
        const worldEnabled = typeof worldApi?.listPublishedWorlds === 'function';
        const settled = await settleGallerySources(
          supersede || state.hasMore ? api.listPublishedCharacters({
            limit: MIXED_FEED_PAGE_SIZE,
            cursor,
            sort: state.selectedSort,
            randomStart: state.selectedSort === 'all' ? state.randomStart : '',
            ...(state.searchMode && state.searchSubmitted ? { keyword: state.keyword } : {}),
            ...filters
          }) : Promise.resolve({ characters: [], nextCursor: '', hasMore: false }),
          worldEnabled && (supersede || state.worldHasMore) ? worldApi.listPublishedWorlds({
            limit: supersede || state.hasMore ? MIXED_WORLD_PAGE_SIZE : MIXED_FEED_PAGE_SIZE,
            cursor: state.worldNextCursor,
            sort: state.selectedSort,
            randomStart: state.selectedSort === 'all' ? state.randomStart : '',
            categoryId: filters.categoryId,
            tagIds: filters.tagIds,
            ...(state.searchMode && state.searchSubmitted ? { keyword: state.keyword } : {})
          }) : Promise.resolve({ items: [], nextCursor: '', hasMore: false })
        );
        if (requestSequence !== listRequestSequence) return;
        const result = settled.characterResult;
        const worldResult = settled.worldResult;
        const incoming = Array.isArray(result?.characters) ? result.characters : [];
        const incomingWorlds = Array.isArray(worldResult?.items) ? worldResult.items : [];
        if (result) {
          const known = new Set(state.characters.map(item => String(item.characterId)));
          incoming.forEach((item) => { if (item?.characterId && !known.has(String(item.characterId))) state.characters.push(item); });
          state.nextCursor = String(result.nextCursor || '');
          state.hasMore = result.hasMore === true && Boolean(state.nextCursor);
          if (state.selectedSort === 'all' && /^[a-f0-9]{16}$/i.test(String(result.randomStart || ''))) state.randomStart = String(result.randomStart).toLowerCase();
        }
        if (worldResult) {
          const knownWorlds = new Set(state.worlds.map(item => String(item.worldTemplateId)));
          incomingWorlds.forEach(item => { if (item?.worldTemplateId && !knownWorlds.has(String(item.worldTemplateId))) state.worlds.push(item); });
          state.worldNextCursor = String(worldResult.nextCursor || '');
          state.worldHasMore = worldEnabled && Boolean(state.worldNextCursor);
        }
        state.works = mergeSeededWorkBatch(
          state.works,
          incoming,
          incomingWorlds,
          `${state.randomStart}:${state.workBatchIndex}`,
          { shuffleWithinSources: state.selectedSort === 'all' }
        );
        state.workBatchIndex += 1;
        if (settled.characterError && settled.worldError) {
          state.error = '作品暂时无法加载，请稍后重试';
        } else if (settled.characterError) {
          notify('单人角色作品暂时未加载');
        } else if (settled.worldError) {
          notify('世界作品暂时未加载');
        }
      } catch (error) {
        if (requestSequence !== listRequestSequence) return;
        state.error = error?.message || '广场读取失败，请稍后重试';
      } finally {
        if (requestSequence === listRequestSequence) {
          state.loading = false;
          render();
        }
      }
    }

    async function showPublishedCharacter(input = {}) {
      const characterId = String(input.characterId || '').trim();
      state.activeSection = 'plaza';
      state.searchMode = false; state.searchSubmitted = false; state.keyword = ''; state.searchDraft = '';
      state.selectedTypes = [];
      state.selectedTags = [];
      filtersDirty = false;
      state.openMenu = '';
      state.visibleLimit = INITIAL_VISIBLE_CHARACTERS;
      state.justPublishedCharacterId = characterId;
      state.works = [];
      state.workBatchIndex = 0;
      state.characters = [];
      state.nextCursor = '';
      state.hasMore = true;
      state.worlds = [];
      state.worldNextCursor = '';
      state.worldHasMore = true;
      state.error = '';
      applySection();
      renderPrimaryMenus();
      renderPopup();
      render();
      await fetchNextPage({ supersede: true });
      if (characterId) {
        try {
          const result = await api.getPublishedCharacter(characterId);
          const published = result?.character;
          if (published?.characterId) {
            state.error = '';
            state.characters = [published].concat(state.characters.filter(item => String(item?.characterId || '') !== characterId));
            state.works = [normalizeGalleryWork('character', published)].concat(state.works.filter(work => work?.stableKey !== `character:${characterId}`));
            render();
          }
        } catch (_) {
          // 首屏列表已经完成刷新；单个角色的补充直取失败时不制造第二条报错。
        }
      }
      const target = Array.from(root.querySelectorAll?.('[data-character-id]') || [])
        .find(node => String(node.dataset.characterId || '') === characterId);
      target?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    }

    async function showMore() {
      if (state.loading) return;
      const before = state.works.length;
      if (before > state.visibleLimit) {
        state.visibleLimit += INITIAL_VISIBLE_CHARACTERS;
        render();
        return;
      }
      if (state.hasMore || state.worldHasMore) {
        await fetchNextPage();
        state.visibleLimit += INITIAL_VISIBLE_CHARACTERS;
        render();
      }
    }

    async function open(request = {}) {
      publicCreatorRequestSequence += 1;
      worldRunRequestSequence += 1;
      state.worldDetail = null;
      state.worldRun = null;
      state.worldRunLoading = false;
      state.worldRunSending = false;
      state.worldPendingMessage = null;
      state.works = []; state.workBatchIndex = 0; state.characters = []; state.nextCursor = ''; state.hasMore = true; state.worlds = []; state.worldNextCursor = ''; state.worldHasMore = true; state.error = ''; state.selectedSort = 'all'; state.randomStart = newRandomStart(); state.selectedTypes = []; state.selectedTags = []; state.tagQuery = ''; state.searchMode = false; state.searchSubmitted = false; state.keyword = ''; state.searchDraft = ''; state.openMenu = ''; state.visibleLimit = INITIAL_VISIBLE_CHARACTERS; state.activeSection = options.initialSection === 'creator' ? 'creator' : options.initialSection === 'plaza' ? 'plaza' : 'home'; state.creatorMountNode = null; state.justPublishedCharacterId = ''; state.publicCreatorPage = null;
      filtersDirty = false;
      state.home = createHomeFeedState();
      if (typeof request.keyword === 'string') {
        state.activeSection = 'plaza'; state.searchMode = true; state.searchSubmitted = true;
        state.keyword = request.keyword.trim().slice(0, 120); state.searchDraft = state.keyword;
      }
      shell(); render(); void refreshCategoryFilters();
      if (!state.searchMode) void fetchHomePage({ reset: true });
      await fetchNextPage({ supersede: true });
    }
    return Object.freeze({ open, state, showSection, showPublishedCharacter });
  }

  return Object.freeze({ readGallerySearchRoute, GALLERY_VERSION, GALLERY_CARD_ACTION, REPORT_ENTRY_VISIBLE, GALLERY_TYPE_FILTERS, GALLERY_TAG_FILTERS, GALLERY_SORTS, INITIAL_VISIBLE_CHARACTERS, MIXED_FEED_PAGE_SIZE, MIXED_WORLD_PAGE_SIZE, escapeHtml, initialOf, formatUsageCount, usageCountMarkup, newRandomStart, seededWorkScore, mergeSeededWorkBatch, visibleWorkSlice, retryableWorldMessageRequest, settleGallerySources, imageSource, coverMarkup, creatorSummaryOf, creatorAvatarMarkup, cardMarkup, worldCardMarkup, feedCardMarkup, worldFeedCardMarkup, feedWorkMarkup, formatOpeningPreviewForHome, worldDetailMarkup: WORLD_RUN_VIEW?.worldDetailMarkup, worldRunMarkup: WORLD_RUN_VIEW?.worldRunMarkup, filterLabels, categoryFilterDefinitions, tagFilterDefinitions, mergeFilterDefinitions, filterTagDefinitionsByQuery, tagSearchMarkup, loadAllTagFilterDefinitions, buildFilterPayload, filterMarkup, primaryMenuMarkup, discoveryVisible, valueAt, displayValue, detailMarkup, publicCreatorPageMarkup, createGallery });
});
