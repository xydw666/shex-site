(function initCreatorWorkbench(global, factory) {
  const api = factory(global);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.SHEXCreatorWorkbench = api;
})(typeof window !== 'undefined' ? window : globalThis, function createCreatorWorkbenchModule(global) {
  'use strict';

  const WORKBENCH_VERSION = 'creator-workbench-v32-x101-world-media-continuation';
  const PROFILE_OPTIONS = global?.SHEXCharacterProfileOptions
    || (typeof require === 'function' ? require('../character-profile/character-profile-options.js') : null);
  const CHARACTER_CARD_IMPORT = global?.SHEXCharacterCardImport
    || (typeof require === 'function' ? require('../character-import/character-card-import.js') : null);
  const GALLERY_TAXONOMY = global?.SHEXCharacterGalleryTaxonomy
    || (typeof require === 'function' ? require('./character-gallery-taxonomy.js') : null);
  const CATEGORY_STORE_MODULE = global?.SHEXCharacterCategoryStore
    || (typeof require === 'function' ? require('./character-category-store.js') : null);
  const TAG_STORE_MODULE = global?.SHEXCharacterTagStore
    || (typeof require === 'function' ? require('./character-tag-store.js') : null);
  const WORK_LIST_MODULE = global?.SHEXCreatorWorkList
    || (typeof require === 'function' ? require('./creator-work-list.js') : null);
  if (!PROFILE_OPTIONS) throw new Error('character profile options are required');
  if (!CHARACTER_CARD_IMPORT) throw new Error('character card import core is required');
  if (!GALLERY_TAXONOMY) throw new Error('character gallery taxonomy is required');
  if (!WORK_LIST_MODULE) throw new Error('creator work list module is required');
  const CREATOR_HIDDEN_PATHS = new Set([
    'characterProfile.basic.mbti',
    'characterProfile.basic.zodiac',
    'characterProfile.speech.languages',
    'characterProfile.speech.needsTranslation',
    'characterProfile.opening.freeform'
  ]);
  const LEGACY_TAXONOMY_PATHS = new Set([
    'templateMetadata.contentTypes',
    'templateMetadata.galleryTags'
  ]);
  const REQUIRED_PATHS = new Set([
    'characterProfile.basic.displayName',
    'templateMetadata.avatarAssetId',
    'templateMetadata.publicSummary',
    'templateMetadata.openingText'
  ]);
  const FIELD_LABELS = Object.freeze({
    'characterProfile.basic.displayName': '角色名称', 'characterProfile.basic.gender': '性别',
    'characterProfile.basic.selfReference': '自称', 'characterProfile.basic.age': '年龄',
    'characterProfile.basic.mbti': 'MBTI', 'characterProfile.basic.zodiac': '星座',
    'characterProfile.world.worldType': '所处世界', 'characterProfile.world.customWorld': '自定义世界',
    'characterProfile.identity.tags': '身份／职业标签', 'characterProfile.identity.customIdentity': '身份与职业补充',
    'characterProfile.appearance.summary': '外貌与细节', 'characterProfile.appearance.details': '随身细节与习惯动作',
    'characterProfile.background.summary': '背景与身份', 'characterProfile.personality.tags': '性格标签',
    'characterProfile.personality.core': '核心性格', 'characterProfile.dailyLife.tags': '日常生活标签',
    'characterProfile.dailyLife.goalsAndRoutine': '日常生活与长期目标', 'characterProfile.speech.amount': '话量',
    'characterProfile.speech.tones': '语气标签', 'characterProfile.speech.habits': '表达习惯',
    'characterProfile.speech.languages': '语言', 'characterProfile.speech.needsTranslation': '是否附翻译',
    'characterProfile.speech.freeform': '说话方式', 'characterProfile.preferences.tags': '喜好标签',
    'characterProfile.preferences.freeform': '喜好与小习惯', 'characterProfile.principles.freeform': 'TA的原则与不能接受的事',
    'characterProfile.exampleDialogues': '示例对话', 'characterProfile.other.freeform': '其他补充',
    'templateMetadata.openingText': '开场白', 'templateMetadata.publicSummary': '公开简介',
    'templateMetadata.categoryId': '广场大类', 'templateMetadata.tagIds': '广场标签',
    'templateMetadata.contentTypes': '历史广场类型', 'templateMetadata.galleryTags': '历史广场标签',
    'templateMetadata.creatorDisplayName': '公开作者名／笔名',
    'templateMetadata.avatarAssetId': '公开头像', 'templateMetadata.backgroundAssetId': '公开背景',
    'templateMetadata.voiceBinding': 'Fish 公开音色',
    'templateMetadata.creatorNotes': '创作者说明',
    'templateDefaults.relationship.identity': '初始关系身份', 'templateDefaults.relationship.dynamics': '初始相处模式',
    'templateDefaults.relationship.developmentMode': '关系发展方式', 'templateDefaults.relationship.speed': '关系发展速度',
    'templateDefaults.relationship.freeform': '初始关系补充', 'templateDefaults.specialTreatment.tags': '只对用户的不同',
    'templateDefaults.specialTreatment.freeform': '专属相处补充'
  });
  const LONG_TEXT = new Set([
    'characterProfile.appearance.summary', 'characterProfile.appearance.details', 'characterProfile.background.summary',
    'characterProfile.personality.core', 'characterProfile.dailyLife.goalsAndRoutine', 'characterProfile.speech.freeform',
    'characterProfile.preferences.freeform', 'characterProfile.principles.freeform', 'characterProfile.exampleDialogues',
    'characterProfile.other.freeform', 'templateMetadata.openingText', 'templateMetadata.publicSummary',
    'templateMetadata.creatorNotes', 'templateDefaults.relationship.freeform', 'templateDefaults.specialTreatment.freeform'
  ]);
  const EDITOR_STEPS = Object.freeze([
    Object.freeze({ id: 'basic', title: '基础资料', note: '先选照片，再填写名字、年龄和基本身份。' }),
    Object.freeze({ id: 'persona', title: '角色设定', note: '填写外貌、背景、性格与日常生活。' }),
    Object.freeze({ id: 'voice', title: '表达与喜好', note: '选择说话标签，再补充喜好、原则和示例对话。' }),
    Object.freeze({ id: 'relationship', title: '关系与开场', note: '设置初始关系，以及用户第一次见到角色时的开场白。' }),
    Object.freeze({ id: 'showcase', title: '作品展示', note: '补充公开简介、作者名和其他展示资料。' }),
    Object.freeze({ id: 'publish', title: '发布检查', note: '核对4项必填内容，保存后预览公开版本。' })
  ]);
  const BASIC_FIELD_ORDER = Object.freeze([
    'templateMetadata.avatarAssetId',
    'templateMetadata.backgroundAssetId',
    'characterProfile.basic.displayName',
    'characterProfile.basic.age',
    'characterProfile.basic.gender',
    'characterProfile.basic.selfReference',
    'templateMetadata.voiceBinding'
  ]);

  function escapeHtml(value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function valueAt(source, path) { return path.split('.').reduce((value, key) => value?.[key], source); }
  function setAt(target, path, value) {
    const keys = path.split('.'); let cursor = target;
    keys.forEach((key, index) => { if (index === keys.length - 1) cursor[key] = value; else cursor = cursor[key] ||= {}; });
  }
  function isPrivateOriginalDream(dream = {}) {
    return String(dream.origin || dream.sourceOrigin || 'private_original') !== 'template_derived'
      && !dream.characterId && !dream.sourceTemplateVersion;
  }
  function availablePrivateDreams(dreams = []) { return dreams.filter(isPrivateOriginalDream); }
  function draftName(draft = {}) {
    return String(valueAt(draft.authoringPayload, 'characterProfile.basic.displayName') || '未命名角色');
  }
  function draftAvatar(draft = {}) {
    return String(valueAt(draft.authoringPayload, 'templateMetadata.avatarAssetId') || '').trim();
  }
  function editorStepFor(path = '') {
    if (path === 'templateMetadata.avatarAssetId') return 0;
    if (path === 'templateMetadata.backgroundAssetId') return 0;
    if (path === 'templateMetadata.voiceBinding') return 0;
    if (/^characterProfile\.(basic|world|identity)\./.test(path)) return 0;
    if (/^characterProfile\.(appearance|background|personality|dailyLife)\./.test(path)) return 1;
    if (/^characterProfile\.(speech|preferences|principles)\./.test(path)
      || path === 'characterProfile.exampleDialogues') return 2;
    if (path.startsWith('templateDefaults.') || path === 'templateMetadata.openingText') return 3;
    if (path.startsWith('templateMetadata.') || path === 'characterProfile.other.freeform') return 4;
    return 1;
  }
  function orderedDefinitions(definitions = []) {
    const order = new Map(BASIC_FIELD_ORDER.map((path, index) => [path, index]));
    return Array.from(definitions).sort((left, right) => {
      const stepDelta = editorStepFor(left.path) - editorStepFor(right.path);
      if (stepDelta) return stepDelta;
      const leftOrder = order.has(left.path) ? order.get(left.path) : 1000;
      const rightOrder = order.has(right.path) ? order.get(right.path) : 1000;
      return leftOrder - rightOrder;
    });
  }
  function isFilled(value) {
    if (Array.isArray(value)) return value.length > 0;
    return value !== undefined && value !== null && String(value).trim().length > 0;
  }
  function requiredCompletion(payload = {}) {
    const items = Array.from(REQUIRED_PATHS).map(path => ({
      path,
      label: FIELD_LABELS[path] || path,
      complete: isFilled(valueAt(payload, path)),
      step: editorStepFor(path)
    }));
    return { complete: items.filter(item => item.complete).length, total: items.length, items };
  }
  function dialogueText(value) {
    return Array.isArray(value) ? value.map(item => `${item?.scene ? `${item.scene}｜` : ''}${item?.content || item?.text || ''}`).join('\n') : '';
  }
  function parseDialogueText(value) {
    return String(value || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => {
      const [scene, ...rest] = line.split('｜');
      return rest.length ? { scene, content: rest.join('｜') } : { scene: '', content: scene };
    });
  }
  const CHOICE_FIELDS = Object.freeze({
    'characterProfile.world.worldType': Object.freeze({ values: PROFILE_OPTIONS.WORLD_TYPES, maxItems: 1, single: true }),
    'characterProfile.identity.tags': Object.freeze({ values: PROFILE_OPTIONS.IDENTITY_TAGS, maxItems: 8 }),
    'characterProfile.personality.tags': Object.freeze({ groups: PROFILE_OPTIONS.PERSONALITY_GROUPS, maxItems: 8 }),
    'characterProfile.dailyLife.tags': Object.freeze({ values: PROFILE_OPTIONS.DAILY_LIFE_TAGS, maxItems: 12 }),
    'characterProfile.speech.amount': Object.freeze({ values: PROFILE_OPTIONS.SPEECH_AMOUNTS, maxItems: 1, single: true }),
    'characterProfile.speech.tones': Object.freeze({ values: PROFILE_OPTIONS.SPEECH_TONES, maxItems: 3 }),
    'characterProfile.speech.habits': Object.freeze({ values: PROFILE_OPTIONS.SPEECH_HABITS, maxItems: 12 }),
    'characterProfile.speech.languages': Object.freeze({ values: PROFILE_OPTIONS.LANGUAGE_TAGS, maxItems: 8 }),
    'characterProfile.preferences.tags': Object.freeze({ values: PROFILE_OPTIONS.PREFERENCE_TAGS, maxItems: 12 }),
    'templateDefaults.relationship.identity': Object.freeze({ values: PROFILE_OPTIONS.RELATIONSHIP_IDENTITIES, maxItems: 1, single: true }),
    'templateDefaults.relationship.dynamics': Object.freeze({ values: PROFILE_OPTIONS.RELATIONSHIP_DYNAMICS, maxItems: 3 }),
    'templateDefaults.relationship.developmentMode': Object.freeze({ values: PROFILE_OPTIONS.RELATIONSHIP_DEVELOPMENT, maxItems: 1, single: true }),
    'templateDefaults.relationship.speed': Object.freeze({ values: PROFILE_OPTIONS.RELATIONSHIP_SPEEDS, maxItems: 1, single: true })
  });
  const MODE_GROUPS = Object.freeze([
    Object.freeze({ id: 'world', title: '所处世界', tags: ['characterProfile.world.worldType'], custom: ['characterProfile.world.customWorld'] }),
    Object.freeze({ id: 'identity', title: '身份／职业', tags: ['characterProfile.identity.tags'], custom: ['characterProfile.identity.customIdentity'] }),
    Object.freeze({ id: 'personality', title: '性格设定', tags: ['characterProfile.personality.tags'], custom: ['characterProfile.personality.core'] }),
    Object.freeze({ id: 'dailyLife', title: '日常生活与个人目标', tags: ['characterProfile.dailyLife.tags'], custom: ['characterProfile.dailyLife.goalsAndRoutine'] }),
    Object.freeze({ id: 'speech', title: '说话方式', tags: ['characterProfile.speech.amount', 'characterProfile.speech.tones', 'characterProfile.speech.habits', 'characterProfile.speech.languages', 'characterProfile.speech.needsTranslation'], custom: ['characterProfile.speech.freeform'] }),
    Object.freeze({ id: 'preferences', title: '喜好与小习惯', tags: ['characterProfile.preferences.tags'], custom: ['characterProfile.preferences.freeform'] })
  ]);
  const MODE_GROUP_BY_PATH = new Map(MODE_GROUPS.flatMap(group => [...group.tags, ...group.custom].map(path => [path, group])));

  function clonePayload(value = {}) {
    return JSON.parse(JSON.stringify(value && typeof value === 'object' ? value : {}));
  }
  function payloadFromForm(form, definitions, basePayload = {}) {
    const payload = clonePayload(basePayload);
    definitions.forEach(definition => {
      const control = form.querySelector(`[data-draft-path="${definition.path}"]`);
      if (!control) return;
      let value = control.value;
      if (definition.valueType === 'boolean') value = value === '' ? undefined : value === 'true';
      else if (definition.valueType === 'string_array') value = value.split(/[，,\n]/).map(item => item.trim()).filter(Boolean);
      else if (definition.valueType === 'dialogue_array') value = parseDialogueText(value);
      else if (definition.valueType === 'voice_binding') {
        try { value = value ? JSON.parse(value) : undefined; } catch (_) { value = undefined; }
      }
      if (value !== undefined && (typeof value !== 'string' || value.trim())) setAt(payload, definition.path, value);
    });
    // 当前阶段不提供语言选择；字段继续随草稿保存，方便未来直接重新开放。
    setAt(payload, 'characterProfile.speech.languages', ['普通话']);
    setAt(payload, 'characterProfile.speech.needsTranslation', false);
    return payload;
  }
  function choiceValues(config = {}) {
    return config.groups?.flatMap(group => group.values) || config.values || [];
  }
  function normalizedSelected(value, single = false) {
    if (single) return value === undefined || value === null || value === '' ? [] : [String(value)];
    return Array.isArray(value) ? value.map(String) : [];
  }
  function choiceFieldMarkup(definition, payload) {
    const path = definition.path;
    const config = CHOICE_FIELDS[path];
    const label = FIELD_LABELS[path] || path.split('.').at(-1);
    const selected = normalizedSelected(valueAt(payload, path), config.single);
    const known = new Set(choiceValues(config));
    const historical = selected.filter(value => !known.has(value));
    const hiddenValue = config.single ? (selected[0] || '') : selected.join('，');
    const buttons = values => values.map(value => `<button type="button" class="${selected.includes(value) ? 'is-active' : ''}" data-creator-choice="${escapeHtml(path)}" data-choice-value="${escapeHtml(value)}" aria-pressed="${selected.includes(value)}">${escapeHtml(value)}</button>`).join('');
    const groups = config.groups
      ? config.groups.map(group => `<div class="shex-creator-choice-group"><small>${escapeHtml(group.label)}</small><div class="shex-creator-choice-list">${buttons(group.values)}</div></div>`).join('')
      : `<div class="shex-creator-choice-list">${buttons(config.values)}</div>`;
    const history = historical.length ? `<div class="shex-creator-choice-list is-history" aria-label="历史已选标签">${buttons(historical)}</div>` : '';
    return `<section class="shex-creator-choice-field shex-creator-field-wide" data-creator-choice-field="${escapeHtml(path)}" data-choice-max="${Number(config.maxItems || 1)}" data-choice-single="${config.single ? 'true' : 'false'}"><span>${escapeHtml(label)}</span><input type="hidden" data-draft-path="${escapeHtml(path)}" value="${escapeHtml(hiddenValue)}">${groups}${history}</section>`;
  }
  function toggleTagId(selected = [], tagId, maxItems = 10) {
    const id = String(tagId || '').trim();
    const values = Array.from(new Set((Array.isArray(selected) ? selected : []).map(value => String(value || '').trim()).filter(Boolean)));
    if (!id) return values;
    if (values.includes(id)) return values.filter(value => value !== id);
    if (values.length >= Math.max(1, Number(maxItems) || 10)) return values;
    return [...values, id];
  }
  function pairedSelectedTags(payload = {}) {
    const ids = normalizedSelected(valueAt(payload, 'templateMetadata.tagIds'));
    const labels = normalizedSelected(valueAt(payload, 'templateMetadata.galleryTags'));
    return ids.map((tagId, index) => ({ tagId, displayName: labels[index] || tagId, status: 'active' }));
  }
  function categoryFieldMarkup(definition, payload, categories = []) {
    const path = definition.path;
    const selected = String(valueAt(payload, path) || '').trim();
    const historicalLabel = normalizedSelected(valueAt(payload, 'templateMetadata.contentTypes'))[0] || selected;
    const hiddenCategoryIds = new Set(['bg', 'bl']);
    const isVisibleCategory = value => !hiddenCategoryIds.has(String(value || '').trim().toLowerCase());
    const catalogValues = (Array.isArray(categories) ? categories : []).filter(item => item?.categoryId && item?.displayName && item?.status !== 'removed');
    const values = catalogValues.filter(item => isVisibleCategory(item.categoryId));
    const known = new Set(catalogValues.map(item => String(item.categoryId)));
    const visible = selected && !known.has(selected) && isVisibleCategory(selected)
      ? [...values, { categoryId: selected, displayName: historicalLabel || selected, status: 'active' }]
      : values;
    return `<section class="shex-creator-choice-field shex-creator-field-wide shex-creator-taxonomy-field" data-category-field data-creator-choice-field="${escapeHtml(path)}" data-choice-max="1" data-choice-single="true"><span>${escapeHtml(FIELD_LABELS[path] || '广场大类')}</span><input type="hidden" data-draft-path="${escapeHtml(path)}" value="${escapeHtml(selected)}"><div class="shex-creator-choice-list">${visible.map(item => `<button type="button" class="${selected === String(item.categoryId) ? 'is-active' : ''}" data-creator-choice="${escapeHtml(path)}" data-choice-value="${escapeHtml(item.categoryId)}" aria-pressed="${selected === String(item.categoryId)}">${escapeHtml(item.displayName)}</button>`).join('')}</div><small>单选；大类由平台统一维护。</small></section>`;
  }
  function tagFieldMarkup(definition, payload, tags = [], options = {}) {
    const path = definition.path;
    const selected = normalizedSelected(valueAt(payload, path));
    const byId = new Map();
    [...pairedSelectedTags(payload), ...(Array.isArray(tags) ? tags : []), ...(Array.isArray(options.selectedTags) ? options.selectedTags : [])].forEach(item => {
      const tagId = String(item?.tagId || '').trim();
      const displayName = String(item?.displayName || '').trim();
      const status = String(item?.status || 'active').trim().toLowerCase() || 'active';
      if (tagId && displayName && (status === 'active' || selected.includes(tagId))) byId.set(tagId, { tagId, displayName, status });
    });
    const visible = Array.from(byId.values()).sort((left, right) => left.displayName.localeCompare(right.displayName, 'zh-CN') || left.tagId.localeCompare(right.tagId));
    const createMarkup = options.canCreate === true
      ? `<div class="shex-creator-tag-create"><input type="text" maxlength="8" placeholder="输入2～8个字的新标签" data-tag-create-input><button type="button" data-tag-create>新增标签</button></div>`
      : '';
    return `<section class="shex-creator-choice-field shex-creator-field-wide shex-creator-taxonomy-field" data-tag-field data-creator-choice-field="${escapeHtml(path)}" data-choice-max="10" data-choice-single="false"><span>${escapeHtml(FIELD_LABELS[path] || '广场标签')} <small>${selected.length}/10</small></span><input type="hidden" data-draft-path="${escapeHtml(path)}" value="${escapeHtml(selected.join('，'))}"><div class="shex-creator-tag-tools"><input type="search" value="${escapeHtml(options.query || '')}" placeholder="搜索公共标签" data-tag-search></div><div class="shex-creator-choice-list">${visible.map(item => `<button type="button" class="${selected.includes(item.tagId) ? 'is-active' : ''}" data-creator-choice="${escapeHtml(path)}" data-choice-value="${escapeHtml(item.tagId)}" data-tag-lifecycle-status="${escapeHtml(item.status)}" aria-pressed="${selected.includes(item.tagId)}">${escapeHtml(item.displayName)}${item.status === 'active' ? '' : '<small>　已停用</small>'}</button>`).join('') || '<small>还没有公共标签，可以创建第一个。</small>'}</div>${options.hasMore === true ? '<button type="button" class="shex-creator-tag-more" data-tag-load-more>加载更多标签</button>' : ''}${createMarkup}<small data-tag-status>标签可多选；新增后会进入所有创作者共享的标签库。</small></section>`;
  }

  function canActivateTaxonomyChoice(path, status, wasActive) {
    if (wasActive) return true;
    return path !== 'templateMetadata.tagIds' || String(status || 'active').trim().toLowerCase() === 'active';
  }
  function fieldMarkup(definition, payload, taxonomy = {}) {
    const path = definition.path;
    if (path === 'templateMetadata.categoryId') return categoryFieldMarkup(definition, payload, taxonomy.categories || []);
    if (path === 'templateMetadata.tagIds') return tagFieldMarkup(definition, payload, taxonomy.tags || [], taxonomy);
    if (CHOICE_FIELDS[path]) return choiceFieldMarkup(definition, payload);
    if (path === 'templateMetadata.backgroundAssetId') return backgroundFieldMarkup(definition, payload);
    if (path === 'templateMetadata.voiceBinding') return voiceBindingFieldMarkup(definition, payload);
    const label = FIELD_LABELS[path] || path.split('.').at(-1);
    const required = REQUIRED_PATHS.has(path);
    const labelMarkup = `${escapeHtml(label)}${required ? '<b class="shex-required-mark" aria-label="必填">*</b>' : ''}`;
    let value = valueAt(payload, path);
    if (definition.valueType === 'string_array') value = Array.isArray(value) ? value.join('，') : '';
    if (definition.valueType === 'dialogue_array') value = dialogueText(value);
    const hint = definition.valueType === 'string_array' ? '多个内容用逗号分开' : path === 'characterProfile.exampleDialogues' ? '每行一组，可写“情境｜台词”' : '';
    if (definition.valueType === 'boolean') {
      return `<label class="shex-creator-field"><span>${labelMarkup}</span><select data-draft-path="${escapeHtml(path)}"><option value="">未设置</option><option value="true"${value === true ? ' selected' : ''}>是</option><option value="false"${value === false ? ' selected' : ''}>否</option></select></label>`;
    }
    if (LONG_TEXT.has(path)) {
      return `<label class="shex-creator-field shex-creator-field-wide"><span>${labelMarkup}</span><textarea data-draft-path="${escapeHtml(path)}" maxlength="${Number(definition.maxCharacters || definition.maxTotalCharacters || 2000)}">${escapeHtml(value || '')}</textarea>${hint ? `<small>${escapeHtml(hint)}</small>` : ''}</label>`;
    }
    return `<label class="shex-creator-field"><span>${labelMarkup}</span><input data-draft-path="${escapeHtml(path)}" value="${escapeHtml(value || '')}" maxlength="${Number(definition.maxCharacters || 300)}"${required ? ' aria-required="true"' : ''} />${hint ? `<small>${escapeHtml(hint)}</small>` : ''}</label>`;
  }

  function groupHasValue(group, payload, side) {
    return group[side].some(path => isFilled(valueAt(payload, path)));
  }
  function modeGroupMarkup(group, definitionMap, payload) {
    const tagDefinitions = group.tags.map(path => definitionMap.get(path)).filter(Boolean);
    const customDefinitions = group.custom.map(path => definitionMap.get(path)).filter(Boolean);
    if (!tagDefinitions.length || !customDefinitions.length) {
      return [...tagDefinitions, ...customDefinitions].map(definition => fieldMarkup(definition, payload)).join('');
    }
    const mode = !groupHasValue(group, payload, 'tags') && groupHasValue(group, payload, 'custom') ? 'custom' : 'tags';
    return `<section class="shex-creator-mode-section shex-creator-field-wide" data-creator-mode-section="${escapeHtml(group.id)}">
      <header><strong>${escapeHtml(group.title)}</strong><div role="group" aria-label="${escapeHtml(group.title)}填写方式"><button type="button" class="${mode === 'tags' ? 'is-active' : ''}" data-creator-mode="${escapeHtml(group.id)}" data-mode-value="tags" aria-pressed="${mode === 'tags'}">标签</button><button type="button" class="${mode === 'custom' ? 'is-active' : ''}" data-creator-mode="${escapeHtml(group.id)}" data-mode-value="custom" aria-pressed="${mode === 'custom'}">自定义</button></div></header>
      <div class="shex-creator-mode-panel" data-creator-mode-panel="${escapeHtml(group.id)}" data-mode-value="tags"${mode === 'tags' ? '' : ' hidden'}>${tagDefinitions.map(definition => fieldMarkup(definition, payload)).join('')}</div>
      <div class="shex-creator-mode-panel" data-creator-mode-panel="${escapeHtml(group.id)}" data-mode-value="custom"${mode === 'custom' ? '' : ' hidden'}>${customDefinitions.map(definition => fieldMarkup(definition, payload)).join('')}</div>
    </section>`;
  }
  function stepFieldsMarkup(fields, payload, taxonomy = {}) {
    const definitionMap = new Map(fields.map(definition => [definition.path, definition]));
    const renderedGroups = new Set();
    let publicAppearanceRendered = false;
    return fields.map(definition => {
      if (definition.path === 'templateMetadata.avatarAssetId' || definition.path === 'templateMetadata.backgroundAssetId') {
        if (publicAppearanceRendered) return '';
        publicAppearanceRendered = true;
        return publicAppearanceCardMarkup(
          definitionMap.get('templateMetadata.avatarAssetId'),
          definitionMap.get('templateMetadata.backgroundAssetId'),
          payload
        );
      }
      const group = MODE_GROUP_BY_PATH.get(definition.path);
      if (!group) return fieldMarkup(definition, payload, taxonomy);
      if (renderedGroups.has(group.id)) return '';
      renderedGroups.add(group.id);
      return modeGroupMarkup(group, definitionMap, payload);
    }).join('');
  }

  function avatarFieldMarkup(definition, payload) {
    const path = definition.path;
    const value = String(valueAt(payload, path) || '').trim();
    const cloudSource = /^cloud:\/\//i.test(value);
    const preview = value
      ? `<img${cloudSource ? '' : ` src="${escapeHtml(value)}"`} data-creator-asset="${escapeHtml(value)}" alt="角色公开头像预览">`
      : '<span data-avatar-fallback>选择一张角色照片</span>';
    return `<section class="shex-creator-avatar-field shex-creator-field-wide" data-avatar-field>
      <div class="shex-creator-avatar-heading"><span>公开头像<b class="shex-required-mark" aria-label="必填">*</b></span><small>发布到广场时展示</small></div>
      <div class="shex-creator-avatar-preview" data-avatar-preview>${preview}</div>
      <input type="hidden" data-draft-path="${escapeHtml(path)}" value="${escapeHtml(value)}" aria-required="true">
      <label class="shex-creator-avatar-pick"><input type="file" accept="image/*" data-avatar-file><span>${value ? '更换照片' : '选择照片'}</span></label>
      <small class="shex-creator-avatar-status" data-avatar-status>${value ? '照片已保存；更换后请再次保存草稿。' : '请选择清晰的角色照片，上传完成后再保存草稿。'}</small>
    </section>`;
  }

  function backgroundFieldMarkup(definition, payload) {
    const path = definition.path;
    const value = String(valueAt(payload, path) || '').trim();
    const cloudSource = /^cloud:\/\//i.test(value);
    const preview = value
      ? `<img${cloudSource ? '' : ` src="${escapeHtml(value)}"`} data-creator-asset="${escapeHtml(value)}" alt="角色公开背景预览">`
      : '<span data-background-fallback>可选：为角色设置一张公开背景</span>';
    return `<section class="shex-creator-background-field shex-creator-field-wide" data-background-field>
      <div class="shex-creator-background-heading"><span>公开背景</span><small>领取后显示；用户私人背景优先</small></div>
      <div class="shex-creator-background-preview" data-background-preview>${preview}</div>
      <input type="hidden" data-draft-path="${escapeHtml(path)}" value="${escapeHtml(value)}">
      <label class="shex-creator-background-pick"><input type="file" accept="image/jpeg,image/png,image/webp,image/avif" data-background-file><span>${value ? '更换背景' : '选择背景'}</span></label>
      <button class="shex-creator-background-clear" type="button" data-background-clear${value ? '' : ' hidden'}>移除公开背景</button>
      <small class="shex-creator-background-status" data-background-status>${value ? '背景已保存；更换后请再次保存草稿。' : '可不上传；暂不支持 GIF，图片上传后会自动压缩。'}</small>
    </section>`;
  }

  function publicAppearanceCardMarkup(avatarDefinition, backgroundDefinition, payload) {
    const fields = [
      avatarDefinition ? avatarFieldMarkup(avatarDefinition, payload) : '',
      backgroundDefinition ? backgroundFieldMarkup(backgroundDefinition, payload) : ''
    ].filter(Boolean).join('');
    return `<section class="shex-creator-public-appearance shex-creator-field-wide" data-public-appearance-card>
      <header><div><small>PUBLIC APPEARANCE</small><h3>公开形象</h3></div><p>头像用于角色卡，背景会随公开版本进入领取实例。</p></header>
      <div class="shex-creator-public-appearance-grid">${fields}</div>
    </section>`;
  }

  function voiceBindingFieldMarkup(definition, payload) {
    const path = definition.path;
    const binding = valueAt(payload, path);
    const valid = binding && typeof binding === 'object' && String(binding.referenceId || '').trim();
    const referenceId = valid ? String(binding.referenceId) : '';
    const title = valid ? String(binding.title || 'Fish 公开音色') : '';
    return `<section class="shex-creator-voice-field shex-creator-field-wide" data-template-voice-field>
      <span>Fish 公开音色</span>
      <input type="hidden" data-draft-path="${escapeHtml(path)}" value="${escapeHtml(valid ? JSON.stringify(binding) : '')}">
      <div class="shex-creator-voice-row"><input type="text" maxlength="300" value="${escapeHtml(referenceId)}" placeholder="粘贴 Fish 公开音色链接或音色ID" data-template-voice-reference><button type="button" data-template-voice-validate>${valid ? '重新验证' : '验证音色'}</button><button type="button" data-template-voice-clear${valid ? '' : ' hidden'}>移除</button></div>
      <small data-template-voice-status>${valid ? `已验证：${escapeHtml(title)}。领取后默认仍为文字，用户主动开启语音时才使用。` : '可选；只接受现有 Fish 公开音色，不上传、不克隆，也不会在领取时产生费用。'}</small>
    </section>`;
  }

  function previewFieldMarkup(fieldPath, payload) {
    const value = valueAt(payload, fieldPath);
    if (fieldPath === 'templateMetadata.avatarAssetId') {
      const source = String(value || '').trim();
      if (!source) return '';
      const cloudSource = /^cloud:\/\//i.test(source);
      return `<div class="shex-public-preview-field shex-public-preview-avatar"><dt>${escapeHtml(FIELD_LABELS[fieldPath])}</dt><dd><img${cloudSource ? '' : ` src="${escapeHtml(source)}"`} data-creator-asset="${escapeHtml(source)}" alt="角色公开头像"></dd></div>`;
    }
    if (fieldPath === 'templateMetadata.backgroundAssetId') {
      const source = String(value || '').trim();
      if (!source) return '';
      const cloudSource = /^cloud:\/\//i.test(source);
      return `<div class="shex-public-preview-field shex-public-preview-background"><dt>${escapeHtml(FIELD_LABELS[fieldPath])}</dt><dd><img${cloudSource ? '' : ` src="${escapeHtml(source)}"`} data-creator-asset="${escapeHtml(source)}" alt="角色公开背景"></dd></div>`;
    }
    if (fieldPath === 'templateMetadata.voiceBinding') {
      if (!value || typeof value !== 'object') return '';
      return `<div class="shex-public-preview-field"><dt>${escapeHtml(FIELD_LABELS[fieldPath])}</dt><dd>${escapeHtml(value.title || 'Fish 公开音色')} · 已验证</dd></div>`;
    }
    const display = Array.isArray(value)
      ? value.map(item => item && typeof item === 'object' ? [item.scene, item.content].filter(Boolean).join('｜') : String(item)).join('、')
      : typeof value === 'boolean' ? (value ? '是' : '否') : String(value ?? '');
    return `<div class="shex-public-preview-field"><dt>${escapeHtml(FIELD_LABELS[fieldPath] || fieldPath)}</dt><dd>${escapeHtml(display)}</dd></div>`;
  }

  function sameDraftValue(left, right) {
    if (left === right) return true;
    if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
    if (Array.isArray(left) !== Array.isArray(right)) return false;
    if (Array.isArray(left)) {
      return left.length === right.length && left.every((item, index) => sameDraftValue(item, right[index]));
    }
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    return leftKeys.length === rightKeys.length
      && leftKeys.every(key => Object.prototype.hasOwnProperty.call(right, key) && sameDraftValue(left[key], right[key]));
  }

  function sameDraftPayload(left, right) {
    return sameDraftValue(left || {}, right || {});
  }

  function isPositiveInteger(value) {
    return Number.isInteger(value) && value > 0;
  }

  function normalizedRewardRules(rewardRules) {
    const source = rewardRules && typeof rewardRules === 'object' ? rewardRules : {};
    const effectiveUsageReplyThreshold = Number(source.effectiveUsageReplyThreshold);
    const milestoneInterval = Number(source.milestoneInterval);
    const energyPerMilestone = Number(source.energyPerMilestone);
    if (!isPositiveInteger(effectiveUsageReplyThreshold) || !isPositiveInteger(milestoneInterval) || !isPositiveInteger(energyPerMilestone)) return null;
    return { effectiveUsageReplyThreshold, milestoneInterval, energyPerMilestone };
  }

  function creatorRewardRulesMarkup(rewardRules) {
    const normalized = normalizedRewardRules(rewardRules);
    const body = normalized
      ? `<p>当一名用户使用你发布的角色，并成功完成${escapeHtml(normalized.effectiveUsageReplyThreshold)}次AI回复后，记为1次有效使用。同一用户对同一角色最多计算1次。</p><p>每累计${escapeHtml(normalized.milestoneInterval)}次有效使用，自动获得${escapeHtml(normalized.energyPerMilestone)} X能量。</p><p>达到奖励条件后，无需领取或兑换，X能量会自动发放到你的无限期X能量中。</p><p>奖励到账后，可以在X能量的消费记录 / 能量明细中查看「创作者里程碑奖励」记录。</p><p>有效使用数据按小时统计，因此奖励到账可能存在最多约1小时延迟。</p>`
      : '<p>奖励规则加载中，请稍后再试。</p>';
    return `<h3>创作者奖励规则</h3>${body}`;
  }

  function creatorIdentityCardMarkup(creator = {}, statistics = {}, rewardRules = null, rewardsExpanded = false) {
    const displayName = String(creator.displayName || '创作者').trim() || '创作者';
    const avatar = String(creator.avatarAssetId || '').trim();
    const avatarMarkup = avatar
      ? `<img${/^cloud:\/\//i.test(avatar) ? '' : ` src="${escapeHtml(avatar)}"`} data-creator-asset="${escapeHtml(avatar)}" alt="${escapeHtml(displayName)}的创作者头像">`
      : `<span aria-hidden="true">${escapeHtml(Array.from(displayName)[0] || '创')}</span>`;
    const expanded = rewardsExpanded === true;
    const effectiveUsageCount = Math.max(0, Math.floor(Number(statistics.effectiveUsageCount) || 0));
    const grantedEnergy = Number(statistics.creatorRewardEnergyGranted);
    const grantedEnergyText = statistics.creatorRewardEnergyGranted == null || !Number.isSafeInteger(grantedEnergy) || grantedEnergy < 0
      ? '暂无法获取'
      : `${grantedEnergy.toLocaleString('zh-CN')} X能量`;
    return `<section class="shex-creator-identity-card">
      <form data-creator-profile-form>
        <div class="shex-creator-identity-avatar" data-creator-avatar-preview>${avatarMarkup}</div>
        <div class="shex-creator-identity-main">
          <small>我的创作者身份</small>
          <label><span>昵称</span><input name="displayName" maxlength="40" value="${escapeHtml(displayName)}" required></label>
          <p>创作者号 <strong>${escapeHtml(creator.creatorCode || '')}</strong></p>
        </div>
        <div class="shex-creator-identity-actions">
          <label class="shex-creator-avatar-picker">更换头像<input type="file" accept="image/*" data-creator-avatar-file hidden></label>
          <button type="submit">保存身份</button>
        </div>
      </form>
      <div class="shex-creator-identity-stats">
        <div><span class="shex-creator-stat-label">有效使用次数<button type="button" class="shex-creator-reward-help" data-creator-rewards-toggle aria-label="查看创作者奖励规则" aria-controls="shex-creator-reward-rules" aria-expanded="${expanded ? 'true' : 'false'}">?</button></span><strong>${effectiveUsageCount.toLocaleString('zh-CN')}</strong></div>
        <div><span>累计获取</span><strong>${escapeHtml(grantedEnergyText)}</strong></div>
      </div>
      <div class="shex-creator-reward-rules" id="shex-creator-reward-rules" data-creator-reward-rules${expanded ? '' : ' hidden'}>${creatorRewardRulesMarkup(rewardRules)}</div>
    </section>`;
  }

  async function loadWorkbenchData(api, options = {}) {
    const worldClient = options.worldClient;
    const workList = options.workList || WORK_LIST_MODULE;
    if (typeof api?.getCreatorWorkbenchBootstrap === 'function') {
      const [characterResult, worldResult] = await Promise.allSettled([
        api.getCreatorWorkbenchBootstrap({ limit: 20 }),
        worldClient?.listDrafts
          ? worldClient.listDrafts({ limit: 20, cursor: null })
          : Promise.resolve({ items: [], nextCursor: '' })
      ]);
      const result = characterResult.status === 'fulfilled'
        ? characterResult.value
        : { creator: null, statistics: {}, rewardRules: null, drafts: [], reviews: [], nextCursor: '' };
      const worldPage = worldResult.status === 'fulfilled' ? worldResult.value : { items: [], nextCursor: '' };
      const pager = workList.createDualWorkPager({
        pageSize: 20,
        characterPage: { items: result.drafts || [], nextCursor: result.nextCursor || '' },
        worldPage,
        fetchCharacters: cursor => api.listDrafts({ limit: 20, cursor }),
        fetchWorlds: cursor => worldClient.listDrafts({ limit: 20, cursor })
      });
      const worksPage = await pager.next();
      return {
        creator: result.creator || null,
        statistics: result.statistics || {},
        rewardRules: result.rewardRules || null,
        drafts: Array.isArray(result.drafts) ? result.drafts : [],
        reviews: Array.isArray(result.reviews) ? result.reviews : [],
        works: worksPage.items,
        worksPager: pager,
        worksHasMore: worksPage.hasMore,
        warnings: [
          characterResult.status === 'rejected' ? '单人角色作品暂时未加载' : '',
          worldResult.status === 'rejected' ? '世界作品暂时未加载' : '',
          ...(worksPage.warnings || []),
        ].filter(Boolean)
      };
    }
    const [characterResult, worldResult] = await Promise.allSettled([
      Promise.all([api.listDrafts({ limit: 20 }), api.listPublicationReviews({ limit: 50 })]),
      worldClient?.listDrafts
        ? worldClient.listDrafts({ limit: 20, cursor: null })
        : Promise.resolve({ items: [], nextCursor: '' })
    ]);
    const [draftResult, reviewResult] = characterResult.status === 'fulfilled'
      ? characterResult.value
      : [{ drafts: [], nextCursor: '' }, { reviews: [] }];
    const worldPage = worldResult.status === 'fulfilled' ? worldResult.value : { items: [], nextCursor: '' };
    const pager = workList.createDualWorkPager({
      pageSize: 20,
      characterPage: { items: draftResult.drafts || [], nextCursor: draftResult.nextCursor || '' },
      worldPage,
      fetchCharacters: cursor => api.listDrafts({ limit: 20, cursor }),
      fetchWorlds: cursor => worldClient.listDrafts({ limit: 20, cursor })
    });
    const worksPage = await pager.next();
    return {
      creator: null,
      statistics: {},
      rewardRules: null,
      drafts: draftResult.drafts || [],
      reviews: reviewResult.reviews || [],
      works: worksPage.items,
      worksPager: pager,
      worksHasMore: worksPage.hasMore,
      warnings: [
        characterResult.status === 'rejected' ? '单人角色作品暂时未加载' : '',
        worldResult.status === 'rejected' ? '世界作品暂时未加载' : '',
        ...(worksPage.warnings || []),
      ].filter(Boolean)
    };
  }

  function createPublicMediaUploader(options = {}) {
    const supportedKinds = new Set(['avatar', 'background', 'creatorAvatar', 'worldBackground', 'worldPromo', 'worldRoleAvatar']);
    const mediaKind = supportedKinds.has(options.mediaKind) ? options.mediaKind : 'avatar';
    const isBackground = ['background', 'worldBackground', 'worldPromo'].includes(mediaKind);
    const isCreatorAvatar = mediaKind === 'creatorAvatar';
    const api = options.api;
    const createRequestId = options.createRequestId;
    const storage = options.storage;
    const isWorldMedia = ['worldBackground', 'worldPromo', 'worldRoleAvatar'].includes(mediaKind);
    const logMediaStage = typeof options.logMediaStage === 'function'
      ? options.logMediaStage
      : entry => global?.console?.info?.('[SHEX_WORLD_MEDIA]', entry);
    function emitWorldMediaStage(stage) {
      if (!isWorldMedia) return;
      logMediaStage({ stage: String(stage || ''), mediaKind });
    }

    return async function uploadPublicMedia(file) {
      if (!storage?.uploadFile) throw new Error('照片上传服务暂时不可用');
      if (isBackground && (/^image\/gif$/i.test(String(file?.type || '')) || /\.gif$/i.test(String(file?.name || '')))) {
        throw Object.assign(new Error('公开背景暂不支持 GIF，请上传 JPG、PNG、WebP 或 AVIF 图片。'), {
          code: 'PUBLIC_BACKGROUND_GIF_FORBIDDEN'
        });
      }
      const extension = String(file?.name || '').split('.').pop()?.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || 'jpg';
      const requestPrefix = mediaKind === 'worldBackground' ? 'world_background'
        : mediaKind === 'worldPromo' ? 'world_promo'
          : mediaKind === 'worldRoleAvatar' ? 'world_role_avatar'
          : isBackground ? 'public_background' : isCreatorAvatar ? 'creator_avatar' : 'public_avatar';
      const authorize = mediaKind === 'worldBackground' ? api?.authorizeWorldBackgroundUpload
        : mediaKind === 'worldPromo' ? api?.authorizeWorldPromoUpload
          : mediaKind === 'worldRoleAvatar' ? api?.authorizeWorldRoleAvatarUpload
          : isBackground ? api?.authorizePublicBackgroundUpload
            : isCreatorAvatar ? api?.authorizeCreatorAvatarUpload : api?.authorizePublicAvatarUpload;
      const confirm = api?.confirmPublicMediaUpload;
      if (typeof authorize !== 'function' || typeof confirm !== 'function' || typeof createRequestId !== 'function') {
        throw new Error('照片上传授权暂时不可用');
      }
      const authorization = await authorize.call(api, { requestId: createRequestId(requestPrefix), extension });
      if (authorization.uploadRequired === false && /^cloud:\/\//i.test(String(authorization.fileId || ''))) {
        return { fileID: String(authorization.fileId), verified: true, idempotent: true };
      }
      const directory = mediaKind === 'worldBackground' ? 'world-public-backgrounds'
        : mediaKind === 'worldPromo' ? 'world-public-promos'
          : mediaKind === 'worldRoleAvatar' ? 'world-role-avatars'
          : isBackground ? 'character-public-backgrounds'
            : isCreatorAvatar ? 'creator-public-avatars' : 'character-public-avatars';
      const uploaded = await storage.uploadFile(file, directory, {
        allowLocalFallback: false,
        cloudPath: authorization.cloudPath,
        // 选择文件时已经用本地 object URL 即时预览；这里再换一次临时链接没有业务收益。
        resolveTempUrl: false
      });
      const fileId = String(uploaded?.fileID || uploaded?.fileId || '').trim();
      if (!/^cloud:\/\//i.test(fileId)) throw new Error('照片没有成功上传到云端');
      emitWorldMediaStage('world_media_put_success');
      emitWorldMediaStage('world_media_bind_start');
      const confirmation = await confirm.call(api, { fileId });
      emitWorldMediaStage('world_media_bind_success');
      return {
        ...uploaded,
        fileID: String(confirmation?.fileId || fileId),
        verification: confirmation?.verification || {},
        verified: true
      };
    };
  }

  function hasCurrentTextScreening(review = {}) {
    return String(review?.textScreening?.version || '') === 'character-publication-text-screening-v3-x82-field-boundaries';
  }

  function publicationScreeningErrorMessage(error) {
    const findings = Array.isArray(error?.textScreening?.findings) ? error.textScreening.findings : [];
    if (!findings.length) return error?.message || '内容没有通过自动发布规则';
    return findings.map(item => {
      const paths = Array.isArray(item?.fieldPaths) ? item.fieldPaths.filter(Boolean) : [];
      const fields = paths.map(path => FIELD_LABELS[path] || path).join('、');
      const identity = [item?.category, item?.ruleId].filter(Boolean).join(' / ');
      return `${item?.message || '内容没有通过自动发布规则'}${fields ? ` 涉及字段：${fields}` : ''}${identity ? `（${identity}）` : ''}`;
    }).join('；');
  }

  function publicationReviewPriority(review = {}) {
    if (review.publishedVersionId) return 50;
    if (review.status === 'approved') return 40;
    if (review.status === 'pending' && hasCurrentTextScreening(review)) return 30;
    if (review.status === 'pending') return 20;
    if (review.status === 'rejected') return 10;
    return 0;
  }

  function selectPublicationReview(reviews = [], expected = {}) {
    return reviews
      .filter(item => item?.draftId === expected.draftId
        && Number(item?.draftRevision) === Number(expected.draftRevision)
        && item?.publicPayloadHash === expected.publicPayloadHash)
      .sort((left, right) => publicationReviewPriority(right) - publicationReviewPriority(left)
        || Number(right.updatedAt || 0) - Number(left.updatedAt || 0))[0] || null;
  }

  function publicationGuideDialogMarkup() {
    return `<section class="shex-publication-guide-dialog" data-publication-guide-dialog role="dialog" aria-modal="true" aria-labelledby="shex-publication-guide-title" tabindex="-1" hidden><article><header><div><small>PUBLICATION GUIDE</small><h3 id="shex-publication-guide-title">发布说明</h3></div><button type="button" data-publication-guide-close aria-label="关闭发布说明">×</button></header><ol><li><b>准备角色资料</b><span>角色名称、公开头像、公开简介和开场白是发布必填，其余资料可以按需要补充。</span></li><li><b>保存并预览</b><span>先保存草稿，再检查公开预览；私人资料、聊天记录和用户关系不会被公开。</span></li><li><b>自动规则检查</b><span>规则未命中会自动通过并允许发布；命中时会直接说明需要修改的内容，不进入人工审核队列。</span></li><li><b>发布、更新或下架</b><span>发布后仍可更新和下架。更新不会偷偷覆盖别人已经领取的副本，下架也不会删除已有副本。</span></li></ol><footer><button type="button" class="primary" data-publication-guide-close>知道了</button></footer></article></section>`;
  }

  function creatorActionsMarkup(dreams = [], options = {}) {
    const creatorAllowed = typeof options.hasAccess === 'function' ? options.hasAccess : options.isAdmin;
    const canOpenSimulator = options.simulatorCreatorOfflineEnabled === true
      && typeof creatorAllowed === 'function' && creatorAllowed() === true
      && options.offlineClient && typeof options.offlineClient.inspectWorldImport === 'function'
      && typeof options.offlineClient.confirmWorldImport === 'function'
      && typeof options.onOpenSimulatorCreator === 'function';
    const canOpenVisualSimulator = canOpenSimulator
      && ['createDraft', 'listDrafts', 'getDraft', 'saveDraftBlocks', 'checkPublication', 'publishSimulator']
        .every(method => typeof options.offlineClient[method] === 'function');
    const modeTabs = canOpenSimulator ? `<div class="shex-creator-mode-tabs" data-creator-mode-tabs role="tablist" aria-label="创建类型">
      <button type="button" class="primary" data-creator-mode="single" role="tab" aria-selected="true" aria-controls="creator-mode-single">创建单人角色</button>
      <button type="button" data-creator-mode="world" role="tab" aria-selected="false" aria-controls="creator-mode-world">创建世界</button>
    </div>` : '';
    const singlePanel = `<div class="shex-creator-mode-panel" data-creator-mode-panel="single" id="creator-mode-single" role="tabpanel">
      <button class="primary" type="button" data-create-blank>＋ 创建空白角色</button>
      <button type="button" data-import-character-card>导入已有角色</button>
      <label class="shex-creator-import">
        <select data-import-dream><option value="">选择私人原创梦角</option>${dreams.map(dream => `<option value="${escapeHtml(dream.id)}">${escapeHtml(dream.name || dream.characterProfile?.basic?.displayName || '未命名梦角')}</option>`).join('')}</select>
        <button type="button" data-import-submit>从我的梦角复制</button>
        <small>只复制一份新草稿，不影响、也不会覆盖你原来的梦角。</small>
      </label>
    </div>`;
    const worldPanel = canOpenSimulator ? `<div class="shex-creator-mode-panel" data-creator-mode-panel="world" id="creator-mode-world" role="tabpanel" hidden>
      <div class="shex-creator-world-actions">${canOpenVisualSimulator ? '<button type="button" class="primary" data-create-blank-world>＋ 创建空白世界</button>' : ''}<button type="button" data-open-world-import>导入已有世界</button></div>
    </div>` : '';
    return `<section class="shex-creator-actions">${modeTabs}${singlePanel}${worldPanel}</section>`;
  }

  function worldWorkCardMarkup(work = {}) {
    const status = String(work.status || '').trim();
    const published = status === 'published';
    const unpublished = status === 'unpublished';
    const statusLabel = published ? '已发布' : unpublished ? '已下架' : '草稿';
    const updated = work.updatedAt ? new Date(work.updatedAt).toLocaleString('zh-CN') : '尚未保存';
    const title = String(work.title || '未命名世界');
    const promoAssetId = String(work.promoAssetId || '').trim();
    const promo = promoAssetId
      ? `<span class="shex-creator-draft-avatar"><img${/^cloud:\/\//i.test(promoAssetId) ? '' : ` src="${escapeHtml(promoAssetId)}"`} data-creator-asset="${escapeHtml(promoAssetId)}" alt="${escapeHtml(title)}的宣传主题图"></span>`
      : '<span class="shex-creator-draft-avatar fallback" aria-hidden="true">界</span>';
    const openButton = `<button type="button" data-open-world-work="${escapeHtml(work.draftId)}">继续编辑</button><button type="button" data-open-work-beautify="${escapeHtml(work.draftId)}" data-work-type="world">美化</button>`;
    const statusActions = published
      ? `<button type="button" class="primary" data-open-world-work="${escapeHtml(work.draftId)}">更新</button><button type="button" class="danger" data-unpublish-world-work="${escapeHtml(work.draftId)}" data-world-revision="${Math.max(0, Number(work.revision || 0))}">下架</button>`
      : `${unpublished ? `<button type="button" class="primary" data-open-world-work="${escapeHtml(work.draftId)}">重新发布</button>` : ''}<button type="button" class="danger" data-delete-world-draft="${escapeHtml(work.draftId)}">删除草稿</button>`;
    return `<article class="shex-creator-draft-card is-world" data-world-card="${escapeHtml(work.draftId)}">${promo}<div class="shex-creator-draft-main"><header><strong>${escapeHtml(title)}</strong><span class="shex-creator-work-type">世界</span><span class="shex-creator-status ${published ? 'live' : ''}">${statusLabel}</span></header><p>最后更新：${escapeHtml(updated)}</p><div class="shex-creator-draft-actions">${openButton}${statusActions}</div></div></article>`;
  }

  function importPreviewRow(label, value) {
    const text = Array.isArray(value)
      ? value.map(item => item && typeof item === 'object' ? [item.scene, item.content].filter(Boolean).join('｜') : String(item)).join('\n')
      : String(value || '');
    if (!text.trim()) return '';
    return `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(text)}</dd></div>`;
  }

  function externalImportPreviewMarkup(importDraft = {}, issues = [], avatarUrl = '') {
    const character = importDraft.characterProfile || {};
    const unmappedKeys = Object.keys(importDraft.unmapped || {});
    const report = importDraft.report;
    const warningCount = report ? report.warnings.length + Number(report.suppressedWarningCount || 0) : 0;
    const skippedCount = report ? report.skipped.length + Number(report.suppressedSkippedCount || 0) : 0;
    const reportMarkup = report
      ? `<aside class="shex-creator-import-summary"><strong>已识别 ${report.recognized.length} 个可映射字段 · 已导入 ${report.imported.length} 个字段 · 已跳过 ${skippedCount} 项</strong><p>合法内容已带入预览；未支持的设置不会带入草稿。</p></aside>${warningCount ? `<aside class="shex-creator-import-warning"><strong>导入提醒</strong><ul>${report.warnings.slice(0, 20).map(issue => `<li>${escapeHtml(FIELD_LABELS[issue.path] || issue.path)}：${escapeHtml(issue.message)}</li>`).join('')}</ul>${warningCount > 20 ? `<p>另有 ${warningCount - 20} 项同类提醒。</p>` : ''}</aside>` : ''}`
      : '';
    const issueMarkup = issues.length
      ? `<aside class="shex-creator-import-warning"><strong>有 ${issues.length} 处内容超过 SHE.X 字段上限</strong><p>内容没有被截断；带入表单后需要修改，符合长度后才能保存。</p><ul>${issues.map(issue => `<li>${escapeHtml(FIELD_LABELS[issue.path] || issue.path)}：${Number(issue.actual || 0)} / ${Number(issue.limit || 0)} 字</li>`).join('')}</ul></aside>`
      : '<aside class="shex-creator-import-ready"><strong>格式检查通过</strong><p>确认后会把这些内容带入新的创作者草稿。</p></aside>';
    const avatar = avatarUrl
      ? `<img src="${escapeHtml(avatarUrl)}" alt="导入角色头像候选">`
      : '<span aria-hidden="true">角</span>';
    return `<section class="shex-creator-import-preview">
      <header><div class="shex-creator-import-avatar">${avatar}</div><div><small>CHARACTER CARD</small><h3>角色导入预览</h3><p>${escapeHtml(importDraft.dream?.name || '未命名角色')}</p></div></header>
      ${reportMarkup}
      ${issueMarkup}
      <dl class="shex-creator-import-fields">
        ${report && importDraft.draftPayload ? report.imported.map(path => importPreviewRow(FIELD_LABELS[path] || path, path.split('.').reduce((value, key) => value?.[key], importDraft.draftPayload))).join('') : `${importPreviewRow('角色姓名', importDraft.dream?.name)}
        ${importPreviewRow('背景与身份', character.background?.summary)}
        ${importPreviewRow('核心性格', character.personality?.core)}
        ${importPreviewRow('示例对话', character.exampleDialogues)}
        ${importPreviewRow('关系背景', importDraft.relationshipProfile?.foundation?.freeform)}
        ${importPreviewRow('开场白', importDraft.opening?.primary)}
        ${importPreviewRow('创作者备注', importDraft.creator?.creatorNotes)}`}
      </dl>
      ${report ? '' : `<aside class="shex-creator-import-unmapped"><strong>未映射字段：${unmappedKeys.length} 项</strong><p>${unmappedKeys.length ? `${escapeHtml(unmappedKeys.join('、'))}。` : ''}这些内容不会带入角色资料。</p></aside>`}
      <div class="shex-creator-import-actions">
        <button type="button" data-external-import-cancel>取消</button>
        <button type="button" data-external-import-reselect>重新选择文件</button>
        <input type="file" accept=".json,.png,application/json,image/png" data-external-import-file hidden>
        <button class="primary" type="button" data-external-import-confirm>确认并带入草稿</button>
      </div>
    </section>`;
  }

  async function materializeExternalImport(options = {}) {
    const api = options.api;
    const createRequestId = options.createRequestId;
    const toCreatorPayload = options.toCreatorPayload || CHARACTER_CARD_IMPORT.toCreatorPayload;
    if (!api?.createBlankDraft || typeof createRequestId !== 'function' || typeof toCreatorPayload !== 'function') {
      throw new Error('角色导入草稿服务暂时不可用');
    }
    const requestId = options.requestId || createRequestId('external_character_import');
    const created = await api.createBlankDraft({ requestId });
    const draft = created?.draft;
    if (!draft?.draftId) throw new Error('没有成功创建角色草稿');
    draft.authoringPayload = toCreatorPayload(options.importDraft, draft.authoringPayload || {});
    if (options.importDraft?.avatarCandidate?.available && options.sourceFile && typeof options.uploadPublicAvatar === 'function') {
      try {
        const uploaded = await options.uploadPublicAvatar(options.sourceFile);
        const fileId = String(uploaded?.fileID || uploaded?.fileId || '').trim();
        if (fileId) {
          draft.authoringPayload.templateMetadata = draft.authoringPayload.templateMetadata || {};
          draft.authoringPayload.templateMetadata.avatarAssetId = fileId;
        }
      } catch (error) {
        draft.externalImportAvatarError = error?.message || '头像候选上传失败';
      }
    }
    return draft;
  }

  async function materializeReimport(options = {}) {
    const current = options.currentDraft;
    if (!current?.draftId || !options.api?.saveDraft) throw new Error('当前角色草稿尚未载入');
    const payload = options.toCreatorPayload(options.importDraft, {});
    payload.templateMetadata = payload.templateMetadata || {};
    for (const key of ['avatarAssetId', 'backgroundAssetId', 'voiceBinding']) {
      delete payload.templateMetadata[key];
      const previous = options.protectedPayload?.templateMetadata || current.authoringPayload?.templateMetadata || {};
      if (Object.hasOwn(previous, key)) payload.templateMetadata[key] = structuredClone(previous[key]);
    }
    const issues = options.validateCreatorPayload(payload, options.definitions);
    if (issues.length) throw new Error('新版角色有内容超限，请按导入预览中的字段提示修改文件后重试。原草稿没有被覆盖。');
    let outcomeUnknown = false;
    const definitiveErrors = ['DRAFT_REVISION_CONFLICT', 'DRAFT_NOT_FOUND', 'DRAFT_REVISION_REQUIRED', 'DRAFT_ACCESS_DENIED'];
    try {
      const request = { draftId: current.draftId, baseRevision: current.draftRevision, draftPayload: payload };
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const result = await options.api.saveDraft(request);
          if (!result?.draft || result.draft.draftId !== current.draftId || !Number.isSafeInteger(result.draft.draftRevision)
            || result.draft.draftRevision < current.draftRevision || !result.draft.authoringPayload || typeof result.draft.authoringPayload !== 'object') throw new Error('保存回执暂时无法确认');
          return result.draft;
        } catch (error) {
          const definitive = definitiveErrors.includes(error?.code);
          if (!definitive) outcomeUnknown = true;
          if (attempt === 1 || definitive) throw error;
        }
      }
    } catch (error) {
      // saveDraft already treats the same canonical content as noChange before
      // checking the old revision. A retry cannot overwrite a later edit.
      if (typeof options.api.getDraft === 'function') {
        try {
          const authoritative = (await options.api.getDraft(current.draftId))?.draft;
          if (authoritative?.draftId === current.draftId && authoritative.draftRevision >= current.draftRevision
            && sameDraftPayload(authoritative.authoringPayload, payload)) return authoritative;
        } catch (_) {}
      }
      if (!outcomeUnknown && definitiveErrors.includes(error?.code)) throw error;
      throw Object.assign(new Error('保存结果暂时无法确认，请点击“重试确认结果”继续核对；请勿重新选择文件或重复新建作品。'), { code: 'CHARACTER_REIMPORT_RESULT_PENDING' });
    }
  }

  function createWorkbench(options = {}) {
    const root = options.root;
    const api = options.api;
    const isAdmin = options.isAdmin;
    const hasAccess = typeof options.hasAccess === 'function' ? options.hasAccess : isAdmin;
    const listDreams = options.listDreams || (() => []);
    const createRequestId = options.createRequestId || global.SHEXCharacterRegistryAPI?.createRequestId;
    const notify = typeof options.notify === 'function' ? options.notify : () => {};
    const shortFailure = (error, fallback) => /不支持.*操作|UNKNOWN_ACTION/i.test(String(error?.message || error?.code || '')) ? '暂不支持此操作' : (error?.message || fallback);
    const characterCardImport = options.characterCardImport || CHARACTER_CARD_IMPORT;
    const showExperimentalTrial = options.showExperimentalTrial === true || isAdmin();
    if (!root || !api || typeof isAdmin !== 'function' || typeof createRequestId !== 'function') throw new Error('creator workbench dependencies are required');
    const definitions = orderedDefinitions((options.definitions || []).filter(item => item.publishable === true
      && !CREATOR_HIDDEN_PATHS.has(item.path) && !LEGACY_TAXONOMY_PATHS.has(item.path)));
    const categoryStore = options.categoryStore || CATEGORY_STORE_MODULE?.createCategoryStore?.({ api, storage: global?.localStorage });
    const tagStore = options.tagStore || TAG_STORE_MODULE?.createTagStore?.({ api, createRequestId });
    if (!categoryStore || !tagStore) throw new Error('creator taxonomy stores are required');
    const uploadPublicAvatar = options.uploadPublicAvatar || createPublicMediaUploader({
      mediaKind: 'avatar', api, createRequestId, storage: global?.SHEXCloudStorage
    });
    const uploadPublicBackground = options.uploadPublicBackground || createPublicMediaUploader({
      mediaKind: 'background', api, createRequestId, storage: global?.SHEXCloudStorage
    });
    const uploadCreatorAvatar = options.uploadCreatorAvatar || createPublicMediaUploader({
      mediaKind: 'creatorAvatar', api, createRequestId, storage: global?.SHEXCloudStorage
    });
    const initialCategories = categoryStore.current?.() || {};
    const initialTags = tagStore.current?.() || {};
    const state = {
      creator: null, creatorStatistics: {}, creatorRewardRules: null, creatorRewardsExpanded: false,
      drafts: [], reviews: [], works: [], worksPager: null, worksHasMore: false, worksLoading: false,
      active: null, preview: null, readiness: null, review: null,
      pendingReviews: [], pendingRequests: new Map(), editorStep: 0, notice: '', error: '', externalImport: null,
      categories: initialCategories.categories || [], tags: initialTags.tags || [], selectedTags: [], tagCursor: initialTags.nextCursor || '',
      tagHasMore: initialTags.hasMore === true, tagQuery: '', taxonomyLoading: false, taxonomyHydrated: false
    };
    let taxonomySearchTimer = null;
    let externalAvatarUrl = '';
    let reimportContext = null;
    let importGeneration = 0;
    let importConfirming = false;
    let loadSequence = 0;
    let readinessSequence = 0;
    let stickyHeadObserver = null;
    const publicationRequestsInFlight = new Set();
    const pendingWorldUnpublishes = new Set();
    function invalidateReadiness() {
      readinessSequence += 1;
      state.readiness = null;
      state.review = null;
      state.preview = null;
    }
    function applySavedDraft(draft) {
      const revisionOf = item => Number(item?.draftRevision || 0);
      state.drafts = state.drafts.map(item => item.draftId === draft.draftId && revisionOf(draft) >= revisionOf(item) ? draft : item);
      const entry = state.drafts.find(item => item.draftId === draft.draftId);
      if (entry === draft) upsertCharacterWork(draft);
    }

    function clearExternalImport() {
      importGeneration += 1;
      if (externalAvatarUrl && global.URL?.revokeObjectURL) global.URL.revokeObjectURL(externalAvatarUrl);
      externalAvatarUrl = '';
      state.externalImport = null;
    }

    function markIndependentPage(active) {
      root.closest?.('.shex-character-gallery')?.classList.toggle('is-character-creator-independent', active === true);
    }
    function syncEditorStickyOffsets() {
      const workbench = root.querySelector?.('.shex-creator-workbench.is-editor-active');
      const head = workbench?.querySelector?.('.shex-creator-head.is-editor');
      if (!workbench || !head) return;
      stickyHeadObserver?.disconnect?.();
      stickyHeadObserver = null;
      const sync = () => {
        if (!head.isConnected) return;
        workbench.style.setProperty('--creator-sticky-head-height', `${Math.ceil(head.getBoundingClientRect().height)}px`);
      };
      sync();
      global.requestAnimationFrame?.(sync);
      if (typeof global.ResizeObserver === 'function') {
        stickyHeadObserver = new global.ResizeObserver(sync);
        stickyHeadObserver.observe(head);
      }
    }
    function renderShell(content, shellOptions = {}) {
      const editing = shellOptions.editor === true;
      markIndependentPage(editing);
      if (!editing) { stickyHeadObserver?.disconnect?.(); stickyHeadObserver = null; }
      const head = editing
        ? `<header class="shex-creator-head is-editor"><button type="button" data-list-back aria-label="返回草稿列表">‹</button><div><h2>${escapeHtml(shellOptions.title || '未命名角色')}</h2><p>${escapeHtml(shellOptions.status || `草稿 · 第${Number(shellOptions.draftRevision || 1)}版`)}</p></div></header>`
        : '<header class="shex-creator-head"><button type="button" data-workbench-back aria-label="返回广场">‹</button><div><small>CREATOR</small><h2>创作者</h2><p>把角色写成可以被遇见的作品。</p></div></header>';
      root.innerHTML = `<div class="shex-creator-workbench${editing ? ' is-editor-active' : ''}">${head}${state.error ? `<p class="shex-creator-alert error">${escapeHtml(state.error)}</p>` : ''}${content}${publicationGuideDialogMarkup()}</div>`;
      const back = root.querySelector('[data-workbench-back]');
      if (back && (importConfirming || state.externalImport?.resultPending)) back.disabled = true;
      back?.addEventListener('click', () => {
        if (importConfirming || state.externalImport?.resultPending) return;
        global.dispatchEvent?.(new CustomEvent('shex:creator-workbench-back'));
      });
      const guideDialog = root.querySelector('[data-publication-guide-dialog]');
      const closeGuide = () => { if (guideDialog) guideDialog.hidden = true; };
      root.querySelectorAll('[data-publication-guide]').forEach(button => button.addEventListener('click', () => {
        if (!guideDialog) return;
        guideDialog.hidden = false;
        guideDialog.focus();
      }));
      guideDialog?.querySelectorAll('[data-publication-guide-close]').forEach(button => button.addEventListener('click', closeGuide));
      guideDialog?.addEventListener('click', event => { if (event.target === guideDialog) closeGuide(); });
      guideDialog?.addEventListener('keydown', event => { if (event.key === 'Escape') closeGuide(); });
      if (editing) syncEditorStickyOffsets();
    }
    function deny() { renderShell('<section class="shex-creator-empty"><h3>暂未开放</h3><p>角色创作工作台目前尚未对当前账号开放。</p></section>'); }
    function publicationForDraft(draft = {}) {
      if (draft.publicationStatus) return {
        status: draft.publicationStatus,
        characterId: draft.publishedCharacterId,
        templateVersion: draft.publishedTemplateVersion
      };
      const review = state.reviews.filter(item => item?.draftId === draft.draftId && item?.publishedVersionId)
        .sort((left, right) => Number(right.publishedAt || right.updatedAt || 0) - Number(left.publishedAt || left.updatedAt || 0))[0];
      return review ? { status: 'published', characterId: review.publishedCharacterId, templateVersion: review.publishedTemplateVersion } : { status: '', characterId: '', templateVersion: 0 };
    }
    function editorPresentation(draft = {}) {
      const publication = publicationForDraft(draft);
      const revision = Math.max(1, Number(draft.draftRevision || 1));
      if (publication.status === 'published') return {
        status: `已发布 · 第${Math.max(1, Number(publication.templateVersion || 1))}版`, publication, action: 'unpublish'
      };
      if (publication.status === 'unpublished') return { status: `已下架 · 草稿第${revision}版`, publication, action: 'delete' };
      return { status: `草稿 · 第${revision}版`, publication, action: 'delete' };
    }
    function avatarMarkup(draft = {}) {
      const source = draftAvatar(draft);
      if (!source) return `<span class="shex-creator-draft-avatar fallback" aria-hidden="true">${escapeHtml(Array.from(draftName(draft))[0] || '角')}</span>`;
      const cloudSource = /^cloud:\/\//i.test(source);
      return `<span class="shex-creator-draft-avatar"><img${cloudSource ? '' : ` src="${escapeHtml(source)}"`} data-creator-asset="${escapeHtml(source)}" alt="${escapeHtml(draftName(draft))}的公开头像"></span>`;
    }
    function resolveAssetImages(scope = root) {
      scope.querySelectorAll?.('[data-creator-asset]').forEach(image => {
        const source = String(image.dataset.creatorAsset || '').trim();
        if (/^cloud:\/\//i.test(source) && global?.SHEXCloudImages?.load) void Promise.resolve(global.SHEXCloudImages.load(image, source));
        else if (source && !image.getAttribute('src')) image.src = source;
      });
    }
    function openWorldEditor(draftId = '') {
      if (!hasAccess() || options.simulatorCreatorOfflineEnabled !== true || !options.offlineClient || typeof options.onOpenSimulatorCreator !== 'function') return;
      const normalizedDraftId = String(draftId || '').trim();
      if (!normalizedDraftId) return;
      options.onOpenSimulatorCreator({ mode: 'editor', draftId: normalizedDraftId });
    }
    function renderList() {
      const cards = state.works.map(work => {
        if (work.workType === 'world') {
          return worldWorkCardMarkup(work);
        }
        const draft = work.raw || {};
        const publication = publicationForDraft(draft);
        const published = publication.status === 'published';
        const unpublished = publication.status === 'unpublished';
        const status = published ? `已发布 · 第${Number(publication.templateVersion || 1)}版`
          : unpublished ? '已下架' : `草稿 · 第${Number(draft.draftRevision || 1)}版`;
        return `<article class="shex-creator-draft-card" data-draft-card="${escapeHtml(draft.draftId)}">${avatarMarkup(draft)}<div class="shex-creator-draft-main"><header><strong>${escapeHtml(draftName(draft))}</strong><span class="shex-creator-work-type">单人角色</span><span class="shex-creator-status ${published ? 'live' : ''}">${status}</span></header><p>${draft.sourceOrigin === 'private_original' ? '由私人原创梦角导入的副本，不会改动原梦角。' : (draft.updatedAt ? `最后保存：${new Date(draft.updatedAt).toLocaleString('zh-CN')}` : '尚未保存')}</p><div class="shex-creator-draft-actions"><button type="button" data-open-draft="${escapeHtml(draft.draftId)}">继续编辑</button><button type="button" data-open-work-beautify="${escapeHtml(draft.draftId)}" data-work-type="character">美化</button>${published ? `<button type="button" class="primary" data-open-draft="${escapeHtml(draft.draftId)}">更新</button><button type="button" class="danger" data-unpublish-draft="${escapeHtml(draft.draftId)}" data-character-id="${escapeHtml(publication.characterId || '')}">下架</button>` : `<button type="button" class="danger" data-delete-draft="${escapeHtml(draft.draftId)}">删除草稿</button>`}</div></div></article>`;
      }).join('');
      const dreams = availablePrivateDreams(listDreams());
      const identity = state.creator ? creatorIdentityCardMarkup(state.creator, state.creatorStatistics, state.creatorRewardRules, state.creatorRewardsExpanded) : '';
      renderShell(`${identity}${creatorActionsMarkup(dreams, { isAdmin, hasAccess, offlineClient: options.offlineClient, simulatorCreatorOfflineEnabled: options.simulatorCreatorOfflineEnabled, onOpenSimulatorCreator: options.onOpenSimulatorCreator })}<section class="shex-creator-list"><div class="shex-creator-section-title"><h3>我的作品</h3><span>${state.works.length}份</span></div>${cards || '<div class="shex-creator-empty"><p>还没有作品，可以先创建单人角色或世界。</p></div>'}${state.worksHasMore ? `<button type="button" class="shex-creator-load-more" data-load-more-works ${state.worksLoading ? 'disabled' : ''}>${state.worksLoading ? '正在加载…' : '加载更多作品'}</button>` : ''}</section><aside class="shex-creator-flow-note"><strong>发布以后仍然可控</strong><p>更新会生成新的不可变版本，已经领取或运行的旧版本不会偷偷改变。</p></aside>`);
      const profileForm = root.querySelector('[data-creator-profile-form]');
      profileForm?.addEventListener('submit', event => void saveCreatorProfile(event));
      root.querySelector('[data-creator-avatar-file]')?.addEventListener('change', event => void selectCreatorAvatar(event.currentTarget));
      root.querySelector('[data-creator-rewards-toggle]')?.addEventListener('click', event => {
        // 原地展开 / 收回：不整页重绘，避免打断正在编辑的创作者资料与滚动位置。
        state.creatorRewardsExpanded = !state.creatorRewardsExpanded;
        event.currentTarget.setAttribute('aria-expanded', state.creatorRewardsExpanded ? 'true' : 'false');
        const rules = root.querySelector('[data-creator-reward-rules]');
        if (rules) rules.hidden = !state.creatorRewardsExpanded;
      });
      root.querySelector('[data-create-blank]')?.addEventListener('click', () => void createBlank());
      root.querySelectorAll('[data-creator-mode]').forEach(button => button.addEventListener('click', () => {
        const mode = button.dataset.creatorMode === 'world' ? 'world' : 'single';
        root.querySelectorAll('[data-creator-mode]').forEach(tab => {
          const selected = tab.dataset.creatorMode === mode;
          tab.setAttribute('aria-selected', String(selected));
          tab.classList.toggle('primary', selected);
        });
        root.querySelectorAll('[data-creator-mode-panel]').forEach(panel => {
          panel.hidden = panel.dataset.creatorModePanel !== mode;
        });
      }));
      root.querySelector('[data-open-world-import]')?.addEventListener('click', () => {
        if (!hasAccess() || options.simulatorCreatorOfflineEnabled !== true || !options.offlineClient || typeof options.onOpenSimulatorCreator !== 'function') return;
        options.onOpenSimulatorCreator({ mode: 'import' });
      });
      root.querySelector('[data-create-blank-world]')?.addEventListener('click', () => {
        if (!hasAccess() || options.simulatorCreatorOfflineEnabled !== true || !options.offlineClient || typeof options.onOpenSimulatorCreator !== 'function') return;
        options.onOpenSimulatorCreator({ mode: 'blank' });
      });
      root.querySelectorAll('[data-open-world-work]').forEach(button => button.addEventListener('click', () => {
        openWorldEditor(String(button.dataset.openWorldWork || ''));
      }));
      root.querySelectorAll('[data-open-work-beautify]').forEach(button => button.addEventListener('click', () => {
        const draftId=String(button.dataset.openWorkBeautify||''),workType=button.dataset.workType==='world'?'world':'character';
        const work=state.works.find((item)=>item.workType===workType&&String(item.draftId)===draftId);
        if(work&&typeof options.onOpenBeautify==='function')options.onOpenBeautify({...work,workType,draftId,title:workType==='world'?work.title:draftName(work.raw||{}),worldDraftClient:workType==='world'?options.offlineClient:null});
      }));
      root.querySelectorAll('[data-delete-world-draft]').forEach(button => button.addEventListener('click', () => void deleteWorldDraft(button.dataset.deleteWorldDraft)));
      root.querySelectorAll('[data-unpublish-world-work]').forEach(button => button.addEventListener('click', () => void unpublishWorldDraft(button.dataset.unpublishWorldWork, Number(button.dataset.worldRevision || 0))));
      root.querySelector('[data-load-more-works]')?.addEventListener('click', () => void loadMoreWorks());
      root.querySelector('[data-import-submit]')?.addEventListener('click', () => void importDream());
      root.querySelector('[data-import-character-card]')?.addEventListener('click', () => openCharacterImportPage());
      root.querySelectorAll('[data-open-draft]').forEach(button => button.addEventListener('click', () => openDraft(button.dataset.openDraft)));
      root.querySelectorAll('[data-delete-draft]').forEach(button => button.addEventListener('click', () => void deleteDraft(button.dataset.deleteDraft)));
      root.querySelectorAll('[data-unpublish-draft]').forEach(button => button.addEventListener('click', () => void unpublishDraft(button.dataset.unpublishDraft, button.dataset.characterId)));
      resolveAssetImages(root);
    }

    async function selectCreatorAvatar(input) {
      const file = (global.SHEXImageCropper?.filesForInput?.(input) || Array.from(input?.files || []))[0];
      if (!file || !state.creator) return;
      if (!/^image\//i.test(String(file.type || ''))) {
        state.error = '请选择照片文件。'; renderList(); return;
      }
      state.error = ''; notify('正在上传头像…');
      try {
        const uploaded = await uploadCreatorAvatar(file);
        const fileId = String(uploaded?.fileID || uploaded?.fileId || '').trim();
        if (!/^cloud:\/\//i.test(fileId)) throw new Error('头像没有成功上传到云端');
        state.creator = { ...state.creator, avatarAssetId: fileId };
        notify('头像已上传，请保存');
      } catch (error) {
        notify(shortFailure(error, '头像上传失败，请稍后重试'));
      } finally {
        if (input) input.value = '';
        renderList();
      }
    }

    async function saveCreatorProfile(event) {
      event?.preventDefault?.();
      if (!state.creator || typeof api.updateCreatorProfile !== 'function') return;
      const form = event.currentTarget;
      const displayName = String(form?.elements?.displayName?.value || '').trim();
      state.error = ''; renderList();
      try {
        const result = await api.updateCreatorProfile({
          baseRevision: state.creator.profileRevision,
          displayName,
          avatarAssetId: state.creator.avatarAssetId || ''
        });
        state.creator = result.creator || state.creator;
        notify(result.noChange ? '内容没有变化' : '已保存');
      } catch (error) {
        notify(shortFailure(error, '保存失败，请稍后重试'));
      }
      renderList();
    }

    // 与“导入已有世界”同一套页面结构和样式：上方单人导入合同，下方选择角色卡文件，检查后进入原有导入预览。
    function beginCharacterReimport(form) {
      if (importConfirming || !state.active?.draftId) return;
      readinessSequence += 1;
      const nodes = Array.from(root.childNodes);
      const protectedPayload = payloadFromForm(form, definitions, state.active.authoringPayload);
      reimportContext = { draft: state.active, protectedPayload, nodes, step: state.editorStep };
      root.replaceChildren();
      openCharacterImportPage();
    }
    function returnFromCharacterImport() {
      if (importConfirming || state.externalImport?.resultPending) return;
      clearExternalImport(); state.characterImportFile = null; state.error = '';
      const previous = reimportContext; reimportContext = null;
      if (!previous) return renderList();
      state.active = previous.draft; state.editorStep = previous.step;
      root.replaceChildren(...previous.nodes); markIndependentPage(true); syncEditorStickyOffsets();
    }
    function openCharacterImportPage() {
      clearExternalImport();
      state.error = '';
      state.characterImportFile = null;
      renderCharacterImportPage();
    }
    function characterImportFileSize(value) {
      const size = Math.max(0, Number(value || 0));
      if (!size) return '';
      if (size < 1024) return `${size} B`;
      if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
      return `${(size / (1024 * 1024)).toFixed(1)} MB`;
    }
    function renderCharacterImportPage() {
      const file = state.characterImportFile || null;
      const sourceHint = file
        ? `${characterImportFileSize(file.size)} · ${/\.png$/i.test(String(file.name || '')) ? 'PNG 角色卡' : 'JSON 角色卡'}`
        : '支持角色卡 JSON（最大 2MB）或带角色卡信息的 PNG（最大 16MB）';
      markIndependentPage(true);
      root.innerHTML = `<section class="shex-world-import-panel shex-character-import-panel" data-character-import-panel aria-labelledby="shex-character-import-title">
        <header class="shex-world-import-head"><button type="button" data-character-import-close aria-label="返回创建单人角色">‹</button><div><h2 id="shex-character-import-title">${reimportContext ? '再次导入角色' : '导入已有角色'}</h2><p>${reimportContext ? '确认后用新文件覆盖当前草稿内容；公开头像、背景和已有美化不会被覆盖。' : '选择角色卡文件，检查后即可导入为草稿。'}</p></div></header>
        <div class="shex-world-import-cards">
          <section class="shex-world-import-contract-card" aria-labelledby="shex-character-import-contract-title"><span class="shex-world-import-card-icon" aria-hidden="true">✦</span><div class="shex-world-import-card-copy"><h3 id="shex-character-import-contract-title">单人导入合同</h3><p>把合同和你的设定一起发给 AI，让它帮你写出可导入的单人角色卡文件。</p></div><div class="shex-world-import-contract-actions"><a class="shex-world-import-download" data-character-import-download href="./x-world/character-import/SHEX-character-import-contract.md" download="SHE.X单人导入合同.md">下载合同</a><button type="button" class="shex-world-import-copy" data-character-import-copy-contract>复制合同</button></div></section>
          <section class="shex-world-import-source" data-state="${file ? 'selected' : 'empty'}" aria-labelledby="shex-character-import-file-title"><div class="shex-world-import-file-control"><input id="shex-character-import-file-input" class="shex-world-import-native-file" type="file" accept=".json,.png,application/json,image/png" data-character-import-file></div><span class="shex-world-import-card-icon is-file" aria-hidden="true">⌁</span><div class="shex-world-import-card-copy"><h3 id="shex-character-import-file-title">选择角色文件</h3><p data-character-import-file-name>${file ? `${escapeHtml(file.name || '')} · ` : ''}${escapeHtml(sourceHint)}</p></div><div class="shex-world-import-file-actions"><button type="button" class="shex-world-import-choose" data-character-import-choose>${file ? '更换文件' : '选择文件'}</button>${file ? '<button type="button" class="shex-world-import-inspect" data-character-import-inspect>检查文件</button>' : ''}</div></section>
        </div>
        <p class="shex-world-import-status" data-character-import-status data-state="${state.error ? 'blocking' : 'idle'}" role="status" aria-live="polite">${escapeHtml(state.error || '')}</p>
      </section>`;
      root.querySelector('[data-character-import-close]')?.addEventListener('click', () => {
        returnFromCharacterImport();
      });
      const input = root.querySelector('[data-character-import-file]');
      root.querySelector('[data-character-import-choose]')?.addEventListener('click', () => input?.click());
      input?.addEventListener('change', event => {
        const selected = event.currentTarget.files?.[0];
        if (!selected) return;
        state.characterImportFile = selected;
        state.error = '';
        notify('文件已选择');
        renderCharacterImportPage();
      });
      root.querySelector('[data-character-import-inspect]')?.addEventListener('click', () => {
        const selected = state.characterImportFile;
        state.characterImportFile = null;
        if (selected) void parseExternalImport(selected);
      });
      root.querySelector('[data-character-import-copy-contract]')?.addEventListener('click', event => void copyCharacterImportContract(event.currentTarget));
    }
    async function copyCharacterImportContract(button) {
      const url = root.querySelector('[data-character-import-download]')?.href;
      if (!button || !url || typeof global.fetch !== 'function') return;
      button.disabled = true;
      button.textContent = '复制中…';
      try {
        const response = await global.fetch(url);
        if (!response.ok) throw new Error('合同读取失败');
        const content = await response.text();
        let copied = false;
        try {
          if (content.trim() && global.navigator?.clipboard?.writeText) { await global.navigator.clipboard.writeText(content); copied = true; }
        } catch (_) {}
        if (!copied && content.trim() && global.document?.body) {
          const textarea = global.document.createElement('textarea');
          textarea.value = content;
          textarea.setAttribute('readonly', '');
          textarea.style.position = 'fixed';
          textarea.style.left = '-9999px';
          global.document.body.appendChild(textarea);
          try { textarea.select(); copied = Boolean(global.document.execCommand?.('copy')); } catch (_) { copied = false; } finally { textarea.remove(); }
        }
        if (!copied) throw new Error('合同复制失败');
        notify('合同全文已复制，可以直接粘贴给 AI');
        button.textContent = '已复制';
        global.setTimeout?.(() => { if (button.isConnected) button.textContent = '复制合同'; }, 1800);
      } catch (_) {
        button.textContent = '复制合同';
        notify('复制失败，请下载合同后发送给 AI');
      } finally {
        button.disabled = false;
      }
    }

    async function parseExternalImport(file) {
      if (!file) return;
      clearExternalImport();
      const generation = importGeneration;
      state.error = '';
      renderShell('<div class="shex-creator-loading">正在安全解析角色卡…</div>');
      try {
        const parsed = await characterCardImport.parseCharacterCardFile(file);
        if (generation !== importGeneration) return;
        const importDraft = characterCardImport.toImportDraft(parsed);
        const payload = characterCardImport.toCreatorPayload(importDraft, {});
        const issues = characterCardImport.validateCreatorPayload(payload, definitions);
        if (!reimportContext && importDraft.avatarCandidate?.available && global.URL?.createObjectURL) externalAvatarUrl = global.URL.createObjectURL(file);
        state.externalImport = {
          importDraft,
          issues,
          sourceFile: file,
          requestId: createRequestId('external_character_import')
        };
        renderExternalImport();
      } catch (error) {
        if (generation !== importGeneration) return;
        clearExternalImport();
        state.error = error?.message || '角色卡解析失败';
        renderCharacterImportPage();
      }
    }

    function renderExternalImport() {
      const pending = state.externalImport;
      if (!pending) return renderList();
      let previewMarkup = externalImportPreviewMarkup(pending.importDraft, pending.issues, externalAvatarUrl);
      if (reimportContext) {
        previewMarkup = previewMarkup.replace('确认后会把这些内容带入新的创作者草稿。', '确认后覆盖当前草稿内容。当前公开头像、背景、已设置的公开图片及已有美化不会被覆盖。')
          .replace('确认并带入草稿', '确认覆盖当前草稿');
        previewMarkup = '<p class="shex-creator-import-warning">新文件会替换当前草稿的角色设定；旧发布版本保持不变。公开图片和已有美化保留。</p>' + previewMarkup;
      }
      renderShell(previewMarkup);
      if (reimportContext && pending.issues.length) root.querySelector('[data-external-import-confirm]').disabled = true;
      if (pending.resultPending) {
        const confirm = root.querySelector('[data-external-import-confirm]');
        if (confirm) confirm.textContent = '重试确认结果';
        for (const selector of ['[data-external-import-cancel]', '[data-external-import-reselect]', '[data-external-import-file]']) {
          const button = root.querySelector(selector); if (button) button.disabled = true;
        }
      }
      root.querySelector('[data-external-import-cancel]')?.addEventListener('click', () => {
        returnFromCharacterImport();
      });
      const replacement = root.querySelector('[data-external-import-file]');
      root.querySelector('[data-external-import-reselect]')?.addEventListener('click', () => replacement?.click());
      replacement?.addEventListener('change', event => void parseExternalImport(event.currentTarget.files?.[0]));
      root.querySelector('[data-external-import-confirm]')?.addEventListener('click', () => void confirmExternalImport());
    }

    async function confirmExternalImport() {
      const pending = state.externalImport;
      if (!pending || importConfirming) return;
      if (reimportContext && pending.issues.length) return;
      const context = reimportContext;
      const generation = importGeneration;
      importConfirming = true;
      renderShell('<div class="shex-creator-loading">正在保存导入的角色资料…</div>');
      try {
        const draft = context ? await materializeReimport({ api, currentDraft: context.draft, protectedPayload: context.protectedPayload, importDraft: pending.importDraft, definitions, toCreatorPayload: characterCardImport.toCreatorPayload, validateCreatorPayload: characterCardImport.validateCreatorPayload }) : await materializeExternalImport({
          api,
          createRequestId,
          requestId: pending.requestId,
          importDraft: pending.importDraft,
          sourceFile: pending.sourceFile,
          uploadPublicAvatar,
          toCreatorPayload: characterCardImport.toCreatorPayload
        });
        if (generation !== importGeneration) return;
        state.active = draft;
        reimportContext = null;
        upsertCharacterWork(draft);
        state.editorStep = 0;
        state.drafts = [draft, ...state.drafts.filter(item => item.draftId !== draft.draftId)];
        const issueCount = pending.issues.length;
        const avatarError = draft.externalImportAvatarError;
        clearExternalImport();
        notify(context ? '新版内容已覆盖当前草稿，公开图片和已有美化已保留。' : avatarError
          ? `角色资料已带入草稿；${avatarError}，请在基础资料中重新选择照片。`
          : issueCount
            ? `角色资料已带入草稿；有 ${issueCount} 处内容超限，请修改后再保存。`
            : '角色资料已带入草稿，请继续检查和修改后保存。');
        state.error = '';
        renderEditor();
      } catch (error) {
        if (generation !== importGeneration) return;
        if (context) pending.resultPending = pending.resultPending || error?.code === 'CHARACTER_REIMPORT_RESULT_PENDING';
        state.error = pending.resultPending ? '保存结果暂时无法确认，请点击“重试确认结果”继续核对；如果草稿已在别处更新，请重新打开作品查看当前内容。' : error?.message || '保存结果暂时无法确认，请使用同一次导入重试确认。';
        renderExternalImport();
      } finally { importConfirming = false; }
    }
    function requiredChecklistMarkup(payload = {}) {
      const completion = requiredCompletion(payload);
      return `<section class="shex-creator-required-check" data-required-check>
        <header><div><small>发布前检查</small><strong>必填项已完成 <b data-required-count>${completion.complete}/${completion.total}</b></strong></div><span>其余内容均为选填</span><button type="button" data-publication-guide>查看发布说明</button></header>
        <ul>${completion.items.map(item => `<li class="${item.complete ? 'is-complete' : ''}" data-required-item="${escapeHtml(item.path)}"><button type="button" data-required-jump="${escapeHtml(item.path)}"><i aria-hidden="true">${item.complete ? '✓' : '!'}</i><span>${escapeHtml(item.label)}</span><small>${item.complete ? '已完成' : `前往「${escapeHtml(EDITOR_STEPS[item.step]?.title || '对应页面')}」填写`}</small></button></li>`).join('')}</ul>
      </section>`;
    }

    function updateEditorStep(form, focusPath = '') {
      const step = Math.max(0, Math.min(EDITOR_STEPS.length - 1, Number(state.editorStep || 0)));
      state.editorStep = step;
      form.querySelectorAll('[data-editor-step]').forEach(panel => { panel.hidden = Number(panel.dataset.editorStep) !== step; });
      form.querySelectorAll('[data-editor-step-nav]').forEach(button => {
        const active = Number(button.dataset.editorStepNav) === step;
        button.classList.toggle('active', active);
        if (active) button.setAttribute('aria-current', 'step'); else button.removeAttribute('aria-current');
      });
      const payload = payloadFromForm(form, definitions, state.active?.authoringPayload);
      const completion = requiredCompletion(payload);
      form.querySelectorAll('[data-required-count]').forEach(node => { node.textContent = `${completion.complete}/${completion.total}`; });
      completion.items.forEach(item => {
        const row = form.querySelector(`[data-required-item="${item.path}"]`);
        if (!row) return;
        row.classList.toggle('is-complete', item.complete);
        const icon = row.querySelector('i');
        const status = row.querySelector('small');
        if (icon) icon.textContent = item.complete ? '✓' : '!';
        if (status) status.textContent = item.complete ? '已完成' : `前往「${EDITOR_STEPS[item.step]?.title || '对应页面'}」填写`;
      });
      if (focusPath) {
        const control = form.querySelector(`[data-draft-path="${focusPath}"]`);
        const focusTarget = control?.type === 'hidden'
          ? (form.querySelector(`[data-creator-choice="${focusPath}"]`)
            || (focusPath === 'templateMetadata.avatarAssetId' ? form.querySelector('[data-avatar-file]') : null)
            || (focusPath === 'templateMetadata.backgroundAssetId' ? form.querySelector('[data-background-file]') : null))
          : control;
        global.setTimeout?.(() => focusTarget?.focus?.(), 0);
      }
    }

    function changeEditorStep(form, nextStep, options = {}) {
      state.editorStep = Math.max(0, Math.min(EDITOR_STEPS.length - 1, Number(nextStep || 0)));
      updateEditorStep(form, options.focusPath || '');
      if (state.editorStep === 4) void hydrateTaxonomy(form);
      if (options.scroll !== false) form.querySelector('[data-creator-progress]')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    }

    function bindCreatorChoices(form) {
      form.querySelectorAll('[data-creator-choice]').forEach(button => {
        if (button.dataset.creatorChoiceBound === 'true') return;
        button.dataset.creatorChoiceBound = 'true';
        button.addEventListener('click', () => {
        const path = String(button.dataset.creatorChoice || '');
        const field = button.closest('[data-creator-choice-field]');
        const control = field?.querySelector(`[data-draft-path="${path}"]`);
        if (!field || !control) return;
        const choices = Array.from(field.querySelectorAll(`[data-creator-choice="${path}"]`));
        const single = field.dataset.choiceSingle === 'true';
        const wasActive = button.classList.contains('is-active');
        if (!canActivateTaxonomyChoice(path, button.dataset.tagLifecycleStatus, wasActive)) {
          const status = field.querySelector(':scope > small[data-tag-status]');
          if (status) status.textContent = '这个标签已停用，不能重新添加。';
          return;
        }
        if (single) choices.forEach(item => item.classList.remove('is-active'));
        if (!wasActive) {
          const activeCount = choices.filter(item => item.classList.contains('is-active')).length;
          if (single || activeCount < Number(field.dataset.choiceMax || 1)) button.classList.add('is-active');
        } else if (!single) button.classList.remove('is-active');
        choices.forEach(item => item.setAttribute('aria-pressed', String(item.classList.contains('is-active'))));
        const selected = choices.filter(item => item.classList.contains('is-active')).map(item => item.dataset.choiceValue || '');
        control.value = single ? (selected[0] || '') : selected.join('，');
        control.dispatchEvent(new Event('input', { bubbles: true }));
        const count = field.querySelector(':scope > span small');
        if (count && path === 'templateMetadata.tagIds') count.textContent = `${selected.length}/10`;
      });
      });
      form.querySelectorAll('[data-creator-mode]').forEach(button => button.addEventListener('click', () => {
        const group = String(button.dataset.creatorMode || '');
        const mode = String(button.dataset.modeValue || 'tags');
        form.querySelectorAll(`[data-creator-mode="${group}"]`).forEach(item => {
          const active = item.dataset.modeValue === mode;
          item.classList.toggle('is-active', active);
          item.setAttribute('aria-pressed', String(active));
        });
        form.querySelectorAll(`[data-creator-mode-panel="${group}"]`).forEach(panel => { panel.hidden = panel.dataset.modeValue !== mode; });
      }));
    }

    function taxonomyMarkupOptions() {
      return {
        categories: state.categories,
        tags: state.tags,
        selectedTags: state.selectedTags,
        query: state.tagQuery,
        hasMore: state.tagHasMore,
        canCreate: hasAccess()
      };
    }

    function preserveFormPayload(form) {
      const payload = payloadFromForm(form, definitions, state.active?.authoringPayload || {});
      if (state.active) state.active = { ...state.active, authoringPayload: payload };
      return payload;
    }

    function refreshTaxonomyFields(form, payload = preserveFormPayload(form)) {
      const options = taxonomyMarkupOptions();
      const categoryDefinition = definitions.find(item => item.path === 'templateMetadata.categoryId');
      const tagDefinition = definitions.find(item => item.path === 'templateMetadata.tagIds');
      const categoryField = form.querySelector('[data-category-field]');
      const tagField = form.querySelector('[data-tag-field]');
      if (categoryField && categoryDefinition) categoryField.outerHTML = categoryFieldMarkup(categoryDefinition, payload, state.categories);
      if (tagField && tagDefinition) tagField.outerHTML = tagFieldMarkup(tagDefinition, payload, state.tags, options);
      bindCreatorChoices(form);
      bindTaxonomyControls(form);
      updateEditorStep(form);
    }

    async function loadTags(form, input = {}) {
      const status = form.querySelector('[data-tag-status]');
      if (status) status.textContent = input.more ? '正在加载更多标签…' : '正在读取公共标签…';
      try {
        const result = await tagStore.list({
          query: state.tagQuery,
          cursor: input.more ? state.tagCursor : '',
          limit: 50,
          force: input.force === true
        });
        if (result?.stale) return;
        state.tags = result?.tags || [];
        state.tagCursor = result?.nextCursor || '';
        state.tagHasMore = result?.hasMore === true;
        refreshTaxonomyFields(form);
      } catch (error) {
        if (status) status.textContent = error?.message || '公共标签读取失败，已有选择仍可保存。';
      }
    }

    function bindTaxonomyControls(form) {
      const search = form.querySelector('[data-tag-search]');
      if (search && search.dataset.tagSearchBound !== 'true') {
        search.dataset.tagSearchBound = 'true';
        search.addEventListener('input', event => {
          state.tagQuery = String(event.currentTarget.value || '');
          if (taxonomySearchTimer) global.clearTimeout?.(taxonomySearchTimer);
          taxonomySearchTimer = global.setTimeout?.(() => void loadTags(form), 300);
        });
      }
      const more = form.querySelector('[data-tag-load-more]');
      if (more && more.dataset.tagMoreBound !== 'true') {
        more.dataset.tagMoreBound = 'true';
        more.addEventListener('click', () => void loadTags(form, { more: true }));
      }
      const create = form.querySelector('[data-tag-create]');
      if (create && create.dataset.tagCreateBound !== 'true') {
        create.dataset.tagCreateBound = 'true';
        create.addEventListener('click', async event => {
          const button = event.currentTarget;
          const input = form.querySelector('[data-tag-create-input]');
          const status = form.querySelector('[data-tag-status]');
          const displayName = String(input?.value || '').trim();
          if (!displayName) { if (status) status.textContent = '请先输入要新增的标签。'; return; }
          button.disabled = true;
          try {
            const result = await tagStore.create(displayName);
            const tag = result.tag;
            const payload = preserveFormPayload(form);
            setAt(payload, 'templateMetadata.tagIds', toggleTagId(valueAt(payload, 'templateMetadata.tagIds'), tag.tagId));
            state.tags = [...state.tags.filter(item => item.tagId !== tag.tagId), tag];
            if (state.active) state.active = { ...state.active, authoringPayload: payload };
            refreshTaxonomyFields(form, payload);
            const nextStatus = form.querySelector('[data-tag-status]');
            if (nextStatus) nextStatus.textContent = result.created === false ? '这个标签已经存在，已为你选中。' : '新标签已加入公共标签库，并已为你选中。';
          } catch (error) {
            if (status) status.textContent = error?.message || '新增标签失败，请稍后重试。';
          } finally {
            button.disabled = false;
          }
        });
      }
    }

    async function hydrateTaxonomy(form) {
      if (state.taxonomyLoading) return;
      state.taxonomyLoading = true;
      try {
        const selectedIds = normalizedSelected(valueAt(state.active?.authoringPayload || {}, 'templateMetadata.tagIds'));
        const [categoryResult, tagResult, selectedTags] = await Promise.all([
          Promise.resolve(categoryStore.refresh()).catch(() => categoryStore.current()),
          state.taxonomyHydrated ? Promise.resolve(tagStore.current()) : Promise.resolve(tagStore.list({ query: state.tagQuery, limit: 50 })).catch(() => tagStore.current()),
          typeof tagStore.resolve === 'function' ? Promise.resolve(tagStore.resolve(selectedIds)).catch(() => []) : Promise.resolve([])
        ]);
        state.categories = categoryResult?.categories || state.categories;
        if (!tagResult?.stale) {
          state.tags = tagResult?.tags || state.tags;
          state.tagCursor = tagResult?.nextCursor || '';
          state.tagHasMore = tagResult?.hasMore === true;
        }
        state.selectedTags = selectedTags || [];
        state.taxonomyHydrated = true;
        refreshTaxonomyFields(form);
      } finally {
        state.taxonomyLoading = false;
      }
    }

    async function handleAvatarSelection(input, form) {
      const file = (window.SHEXImageCropper?.filesForInput?.(input) || Array.from(input?.files || []))[0];
      if (!file) return;
      const status = form.querySelector('[data-avatar-status]');
      const preview = form.querySelector('[data-avatar-preview]');
      const draftId = state.active?.draftId || '';
      if (!draftId) return;
      if (!/^image\//i.test(String(file.type || ''))) {
        if (status) status.textContent = '请选择照片文件。';
        input.value = '';
        return;
      }
      const localUrl = global.URL?.createObjectURL?.(file) || '';
      if (preview && localUrl) preview.innerHTML = `<img src="${escapeHtml(localUrl)}" alt="刚刚选择的角色照片">`;
      if (status) status.textContent = '照片正在上传，请稍候…';
      input.disabled = true;
      try {
        const asset = await uploadPublicAvatar(file);
        const fileId = String(asset?.fileID || asset?.fileId || '').trim();
        if (!/^cloud:\/\//i.test(fileId)) throw new Error('照片没有成功上传到云端');
        const targetDraft = state.drafts.find(item => item.draftId === draftId);
        if (targetDraft) {
          if (!targetDraft.authoringPayload) targetDraft.authoringPayload = {};
          if (!targetDraft.authoringPayload.templateMetadata) targetDraft.authoringPayload.templateMetadata = {};
          targetDraft.authoringPayload.templateMetadata.avatarAssetId = fileId;
        }
        if (state.active?.draftId === draftId) {
          const hidden = root.querySelector('[data-draft-path="templateMetadata.avatarAssetId"]');
          if (hidden) {
            hidden.value = fileId;
            hidden.dispatchEvent?.(new Event('input', { bubbles: true }));
          }
          if (status) status.textContent = '照片上传完成，请保存草稿。';
        } else {
          notify('头像已上传并写回原角色草稿，请切换回去保存。');
        }
      } catch (error) {
        if (status) status.textContent = error?.message || '照片上传失败，请检查网络后重试。';
      } finally {
        input.disabled = false;
        input.value = '';
      }
    }

    async function handleBackgroundSelection(input, form) {
      const file = (window.SHEXImageCropper?.filesForInput?.(input) || Array.from(input?.files || []))[0];
      if (!file) return;
      const status = form.querySelector('[data-background-status]');
      const preview = form.querySelector('[data-background-preview]');
      const hidden = form.querySelector('[data-draft-path="templateMetadata.backgroundAssetId"]');
      if (!/^image\//i.test(String(file.type || ''))) {
        if (status) status.textContent = '请选择图片文件。';
        input.value = '';
        return;
      }
      const localUrl = global.URL?.createObjectURL?.(file) || '';
      if (preview && localUrl) preview.innerHTML = `<img src="${escapeHtml(localUrl)}" alt="刚刚选择的角色公开背景">`;
      if (status) status.textContent = '背景正在上传，请稍候…';
      input.disabled = true;
      try {
        const asset = await uploadPublicBackground(file);
        const fileId = String(asset?.fileID || asset?.fileId || '').trim();
        if (!/^cloud:\/\//i.test(fileId)) throw new Error('背景没有成功上传到云端');
        hidden.value = fileId;
        hidden.dispatchEvent?.(new Event('input', { bubbles: true }));
        const clearButton = form.querySelector('[data-background-clear]');
        const pickLabel = form.querySelector('[data-background-file]')?.closest('label')?.querySelector('span');
        if (clearButton) clearButton.hidden = false;
        if (pickLabel) pickLabel.textContent = '更换背景';
        if (status) status.textContent = '背景上传完成，请保存草稿。';
      } catch (error) {
        if (status) status.textContent = error?.message || '背景上传失败，请检查网络后重试。';
      } finally {
        input.disabled = false;
        input.value = '';
      }
    }

    function voiceBindingFromHidden(hidden) {
      try {
        const value = JSON.parse(String(hidden?.value || ''));
        return value && typeof value === 'object' ? value : null;
      } catch (_) { return null; }
    }

    async function handleTemplateVoiceValidation(button, form) {
      const field = button?.closest?.('[data-template-voice-field]');
      const input = field?.querySelector('[data-template-voice-reference]');
      const hidden = field?.querySelector('[data-draft-path="templateMetadata.voiceBinding"]');
      const status = field?.querySelector('[data-template-voice-status]');
      const reference = String(input?.value || '').trim();
      if (!reference) { if (status) status.textContent = '请先粘贴 Fish 公开音色链接或音色ID。'; return; }
      if (typeof api.validateTemplatePublicVoice !== 'function') { if (status) status.textContent = '音色验证服务尚未加载，请刷新后再试。'; return; }
      button.disabled = true;
      if (status) status.textContent = '正在验证 Fish 公开音色…';
      try {
        const result = await api.validateTemplatePublicVoice({
          draftId: state.active.draftId,
          publicVoiceReference: reference,
          existingVoiceBinding: voiceBindingFromHidden(hidden)
        });
        const binding = result?.voiceBinding;
        if (!binding?.referenceId) throw new Error('音色服务没有返回有效验证结果');
        hidden.value = JSON.stringify(binding);
        input.value = String(binding.referenceId);
        hidden.dispatchEvent?.(new Event('input', { bubbles: true }));
        const clear = field.querySelector('[data-template-voice-clear]');
        if (clear) clear.hidden = false;
        button.textContent = '重新验证';
        if (status) status.textContent = `已验证：${binding.title || 'Fish 公开音色'}。请保存草稿后生效。`;
      } catch (error) {
        if (status) status.textContent = error?.message || '公开音色验证失败，请稍后重试。';
      } finally {
        button.disabled = false;
      }
    }

    function renderEditor(focusPath = '') {
      const draft = state.active;
      const payload = draft.authoringPayload || {};
      const presentation = editorPresentation(draft);
      const panels = EDITOR_STEPS.map((step, index) => {
        const fields = definitions.filter(definition => editorStepFor(definition.path) === index);
        const fieldContent = stepFieldsMarkup(fields, payload, taxonomyMarkupOptions());
        if (index === EDITOR_STEPS.length - 1) {
          return `<section class="shex-creator-step" data-editor-step="${index}"${state.editorStep === index ? '' : ' hidden'}>${requiredChecklistMarkup(payload)}${showExperimentalTrial ? '<aside class="shex-creator-trial"><span><strong>发布前试聊</strong><small>管理员验证入口；本轮不接真实AI，也不会扣能量。</small></span><button type="button" data-trial-chat>试聊两句</button></aside>' : ''}<div class="shex-creator-publish-actions"><button type="button" class="primary" data-public-preview>保存并预览发布</button></div></section>`;
        }
        return `<section class="shex-creator-step" data-editor-step="${index}"${state.editorStep === index ? '' : ' hidden'}><div class="shex-creator-fields">${fieldContent || '<p class="shex-creator-empty">这一部分暂时没有字段。</p>'}</div></section>`;
      }).join('');
      renderShell(`<form class="shex-creator-editor" data-draft-form novalidate>
        <nav class="shex-creator-editor-steps" data-creator-progress aria-label="角色编辑步骤">${EDITOR_STEPS.map((step, index) => `<button type="button" data-editor-step-nav="${index}" class="${state.editorStep === index ? 'active' : ''}"${state.editorStep === index ? ' aria-current="step"' : ''}>${escapeHtml(step.title)}</button>`).join('')}</nav>
        <div class="shex-creator-editor-actions"><span>修改后请及时保存</span><div><button type="submit" class="primary" data-editor-save>保存</button><button type="button" data-editor-reimport>再次导入</button>${presentation.action === 'unpublish' ? `<button type="button" class="danger" data-editor-unpublish data-character-id="${escapeHtml(presentation.publication.characterId || '')}">下架角色</button>` : '<button type="button" class="danger" data-editor-delete>删除草稿</button>'}</div></div>
        <div class="shex-creator-step-viewport" data-step-viewport>${panels}</div>
      </form>`, { editor: true, title: draftName(draft), status: presentation.status, draftRevision: draft.draftRevision });
      const form = root.querySelector('[data-draft-form]');
      root.querySelector('[data-list-back]')?.addEventListener('click', renderList);
      form?.addEventListener('submit', event => { event.preventDefault(); void saveDraft(event.currentTarget); });
      root.querySelectorAll('[data-editor-step-nav]').forEach(button => button.addEventListener('click', event => changeEditorStep(event.currentTarget.form, Number(event.currentTarget.dataset.editorStepNav))));
      root.querySelector('[data-editor-reimport]')?.addEventListener('click', () => beginCharacterReimport(form));
      root.querySelector('[data-editor-delete]')?.addEventListener('click', () => void deleteDraft(draft.draftId));
      root.querySelector('[data-editor-unpublish]')?.addEventListener('click', event => void unpublishDraft(draft.draftId, event.currentTarget.dataset.characterId, { stayInEditor: true }));
      root.querySelector('[data-trial-chat]')?.addEventListener('click', () => notify('暂不支持此操作'));
      root.querySelector('[data-public-preview]')?.addEventListener('click', event => {
        const button = event.currentTarget;
        button.disabled = true;
        void saveAndPreview(button.form).finally(() => { button.disabled = false; });
      });
      root.querySelectorAll('[data-required-jump]').forEach(button => button.addEventListener('click', event => {
        const path = button.dataset.requiredJump;
        changeEditorStep(event.currentTarget.form, editorStepFor(path), { focusPath: path });
      }));
      root.querySelector('[data-avatar-file]')?.addEventListener('change', event => void handleAvatarSelection(event.currentTarget, event.currentTarget.form));
      root.querySelector('[data-background-file]')?.addEventListener('change', event => void handleBackgroundSelection(event.currentTarget, event.currentTarget.form));
      root.querySelector('[data-background-clear]')?.addEventListener('click', event => {
        const field = event.currentTarget.closest('[data-background-field]');
        const hidden = field?.querySelector('[data-draft-path="templateMetadata.backgroundAssetId"]');
        const preview = field?.querySelector('[data-background-preview]');
        const status = field?.querySelector('[data-background-status]');
        if (!hidden) return;
        hidden.value = '';
        hidden.dispatchEvent?.(new Event('input', { bubbles: true }));
        if (preview) preview.innerHTML = '<span data-background-fallback>可选：为角色设置一张公开背景</span>';
        if (status) status.textContent = '公开背景已移除，保存草稿后生效。';
        const pickLabel = field.querySelector('[data-background-file]')?.closest('label')?.querySelector('span');
        if (pickLabel) pickLabel.textContent = '选择背景';
        event.currentTarget.hidden = true;
      });
      const voiceReference = root.querySelector('[data-template-voice-reference]');
      voiceReference?.addEventListener('input', event => {
        const field = event.currentTarget.closest('[data-template-voice-field]');
        const hidden = field?.querySelector('[data-draft-path="templateMetadata.voiceBinding"]');
        const status = field?.querySelector('[data-template-voice-status]');
        const binding = voiceBindingFromHidden(hidden);
        if (binding && String(binding.referenceId || '') !== String(event.currentTarget.value || '').trim()) {
          hidden.value = '';
          hidden.dispatchEvent?.(new Event('input', { bubbles: true }));
          const clear = field.querySelector('[data-template-voice-clear]');
          if (clear) clear.hidden = true;
          if (status) status.textContent = '音色编号已变化，请点击“验证音色”后再保存。';
        }
      });
      root.querySelector('[data-template-voice-validate]')?.addEventListener('click', event => void handleTemplateVoiceValidation(event.currentTarget, event.currentTarget.form));
      root.querySelector('[data-template-voice-clear]')?.addEventListener('click', event => {
        const field = event.currentTarget.closest('[data-template-voice-field]');
        const hidden = field?.querySelector('[data-draft-path="templateMetadata.voiceBinding"]');
        const input = field?.querySelector('[data-template-voice-reference]');
        const status = field?.querySelector('[data-template-voice-status]');
        if (hidden) { hidden.value = ''; hidden.dispatchEvent?.(new Event('input', { bubbles: true })); }
        if (input) input.value = '';
        if (status) status.textContent = '公开音色已移除，保存草稿后生效。';
        event.currentTarget.hidden = true;
      });
      bindCreatorChoices(form);
      bindTaxonomyControls(form);
      form?.addEventListener('input', () => { invalidateReadiness(); updateEditorStep(form); });
      let touchStart = null;
      const viewport = root.querySelector('[data-step-viewport]');
      viewport?.addEventListener('touchstart', event => {
        const touch = event.touches?.[0];
        if (touch) touchStart = { x: touch.clientX, y: touch.clientY };
      }, { passive: true });
      viewport?.addEventListener('touchend', event => {
        const touch = event.changedTouches?.[0];
        if (!touch || !touchStart) return;
        const deltaX = touch.clientX - touchStart.x;
        const deltaY = touch.clientY - touchStart.y;
        touchStart = null;
        if (Math.abs(deltaX) < 64 || Math.abs(deltaX) < Math.abs(deltaY) * 1.35) return;
        changeEditorStep(form, state.editorStep + (deltaX < 0 ? 1 : -1));
      }, { passive: true });
      resolveAssetImages(root);
      if (state.editorStep === 4) void hydrateTaxonomy(form);
      updateEditorStep(form, focusPath);
    }
    function renderPreview() {
      const preview = state.preview || {};
      const readiness = state.readiness;
      const rows = (preview.includedPaths || []).map(path => previewFieldMarkup(path, preview.publicPayload || {})).join('');
      const published = Boolean(state.review?.publishedVersionId);
      const legacyPendingReview = state.review?.status === 'pending' && !hasCurrentTextScreening(state.review);
      const reviewStatus = published
        ? '<p class="shex-review-status">发布状态：已发布到广场</p>'
        : legacyPendingReview
          ? '<p class="shex-review-status">发布状态：发现旧流程留下的待审记录，请按当前文字规则重新检查</p>'
          : state.review
            ? `<p class="shex-review-status">自动规则检查：${state.review.status === 'approved' ? '已通过，可以正式发布' : '旧审核记录已失效，请修改后重新检查'}${state.review.reviewNote ? ` · ${escapeHtml(state.review.reviewNote)}` : ''}</p>`
            : '';
      let primaryAction = '';
      // 角色资料没改、只改了作品美化时草稿版本号不变，仍需能把新美化发布成新版本，已领取的人才会看到"有新版本"。
      if (published) primaryAction = '<button type="button" class="primary" data-open-character-gallery>前往广场查看</button><button type="button" data-republish-character>重新发布（同步美化更新）</button>';
      else if (state.review?.status === 'approved') primaryAction = '<button type="button" class="primary" data-publish-character>确认发布到广场</button>';
      else if (legacyPendingReview) primaryAction = '<button type="button" class="primary" data-submit-review>按当前文字规则重新检查并发布</button>';
      else if (state.review?.status === 'pending') primaryAction = '<button type="button" class="primary" data-submit-review>按当前自动规则重新检查</button>';
      else if (state.review?.status === 'rejected') primaryAction = '<button type="button" class="primary" data-edit-after-rejection>返回修改后重新检查</button>';
      else if (readiness?.structurallyReady) primaryAction = '<button type="button" class="primary" data-submit-review>检查并发布到广场</button>';
      const statusMarkup = readiness
        ? readiness.structurallyReady
          ? `<div class="shex-public-status is-ready"><i aria-hidden="true">✓</i><strong>已通过</strong>${reviewStatus}</div>`
          : `<section class="shex-public-status is-blocked"><strong>还差必填内容</strong><ul>${(readiness.blockingIssues || []).map(item => `<li>${item.fieldPath ? `<button type="button" data-edit-required-path="${escapeHtml(item.fieldPath)}">${escapeHtml(item.message)}<small>去填写</small></button>` : escapeHtml(item.message)}</li>`).join('')}</ul></section>`
        : '';
      renderShell(`<section class="shex-public-preview">${statusMarkup}<dl class="shex-public-preview-fields">${rows || '<div class="shex-creator-empty">当前草稿还没有可公开内容。</div>'}</dl><aside class="shex-private-exclusions"><h4>不会公开</h4><ul>${(preview.privateExclusions || []).map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul></aside>${primaryAction ? `<div class="shex-public-preview-actions">${primaryAction}</div>` : ''}</section>`);
      root.querySelectorAll('[data-submit-review]').forEach(button => button.addEventListener('click', () => {
        button.disabled = true;
        void submitReview().finally(() => { button.disabled = false; });
      }));
      root.querySelectorAll('[data-publish-character]').forEach(button => button.addEventListener('click', () => {
        button.disabled = true;
        void publishCharacter().finally(() => { button.disabled = false; });
      }));
      root.querySelectorAll('[data-republish-character]').forEach(button => button.addEventListener('click', () => {
        button.disabled = true;
        void republishCharacter().finally(() => { button.disabled = false; });
      }));
      root.querySelectorAll('[data-open-review-queue]').forEach(button => button.addEventListener('click', () => void openReviewQueue()));
      root.querySelectorAll('[data-edit-after-rejection]').forEach(button => button.addEventListener('click', renderEditor));
      root.querySelectorAll('[data-open-character-gallery]').forEach(button => button.addEventListener('click', () => global.dispatchEvent?.(new CustomEvent('shex:creator-open-character-gallery'))));
      root.querySelectorAll('[data-edit-required-path]').forEach(button => button.addEventListener('click', () => {
        const path = String(button.dataset.editRequiredPath || '');
        state.editorStep = editorStepFor(path);
        renderEditor(path);
      }));
      resolveAssetImages(root);
    }
    function renderReviewQueue() {
      const cards = state.pendingReviews.map(review => {
        const findings = (review.textScreening?.findings || []).map(item => `<li>${escapeHtml(item.message)}${item.fieldPaths?.length ? `（${escapeHtml(item.fieldPaths.join('、'))}）` : ''}</li>`).join('');
        return `<article class="shex-review-card"><header><strong>${escapeHtml(draftName({ authoringPayload: review.publicPayloadSnapshot || {} }))}</strong><span>草稿第${Number(review.draftRevision || 1)}版</span></header><p>创作者：${escapeHtml(review.creatorId || '')}</p>${findings ? `<div class="shex-public-warnings"><strong>文字初筛命中</strong><ul>${findings}</ul></div>` : ''}<dl class="shex-public-preview-fields">${(review.includedPaths || []).map(path => previewFieldMarkup(path, review.publicPayloadSnapshot || {})).join('')}</dl><label><span>审核备注</span><textarea data-review-note="${escapeHtml(review.reviewId)}" maxlength="500"></textarea></label><div class="shex-review-actions"><button type="button" data-review-reject="${escapeHtml(review.reviewId)}">驳回</button><button type="button" class="primary" data-review-approve="${escapeHtml(review.reviewId)}">通过</button></div></article>`;
      }).join('');
      renderShell(`<section class="shex-review-queue"><div class="shex-creator-editor-bar"><button type="button" data-review-back>返回草稿列表</button><span>${state.pendingReviews.length}份待人工复核</span></div>${cards || '<div class="shex-creator-empty"><p>目前没有需要人工复核的角色。</p></div>'}</section>`);
      root.querySelector('[data-review-back]')?.addEventListener('click', renderList);
      root.querySelectorAll('[data-review-approve]').forEach(button => button.addEventListener('click', () => void decideReview(button.dataset.reviewApprove, 'approved')));
      root.querySelectorAll('[data-review-reject]').forEach(button => button.addEventListener('click', () => void decideReview(button.dataset.reviewReject, 'rejected')));
    }
    async function load() {
      clearExternalImport(); reimportContext = null; readinessSequence += 1;
      if (!hasAccess()) return deny();
      const requestSequence = ++loadSequence;
      state.error = ''; renderShell('<div class="shex-creator-loading">正在读取角色草稿…</div>');
      try {
        const result = await loadWorkbenchData(api, { worldClient: options.offlineClient });
        if (requestSequence !== loadSequence) return;
        state.creator = result.creator;
        state.creatorStatistics = result.statistics;
        state.creatorRewardRules = result.rewardRules;
        state.drafts = result.drafts;
        state.reviews = result.reviews;
        state.works = result.works || [];
        state.worksPager = result.worksPager || null;
        state.worksHasMore = result.worksHasMore === true;
        renderList();
        Array.from(new Set(result.warnings || [])).forEach(message => notify(message));
      }
      catch (error) {
        if (requestSequence !== loadSequence) return;
        state.error = error?.message || '角色草稿读取失败'; state.drafts = []; renderList();
      }
    }
    async function loadMoreWorks() {
      if (state.worksLoading || !state.worksHasMore || !state.worksPager) return;
      state.worksLoading = true;
      state.error = '';
      renderList();
      try {
        const page = await state.worksPager.next();
        const known = new Set(state.works.map(item => item.workType + ':' + item.workId));
        state.works.push(...(page.items || []).filter(item => !known.has(item.workType + ':' + item.workId)));
        state.works.sort(WORK_LIST_MODULE.compareWorks);
        state.worksHasMore = page.hasMore === true;
        Array.from(new Set(page.warnings || [])).forEach(message => notify(message));
      } catch (error) {
        state.error = error?.message || '更多作品读取失败';
      } finally {
        state.worksLoading = false;
        renderList();
      }
    }
    function upsertCharacterWork(draft) {
      const next = WORK_LIST_MODULE.normalizeCharacterWork(draft);
      state.works = state.works.filter(item => !(item.workType === 'character' && item.workId === next.workId));
      state.works.push(next);
      state.works.sort(WORK_LIST_MODULE.compareWorks);
    }
    function upsertWorldWork(draft) {
      const next = WORK_LIST_MODULE.normalizeWorldWork(draft);
      if (!next.draftId) return;
      state.works = state.works.filter(item => !(item.workType === 'world' && item.workId === next.workId));
      state.works.push(next);
      state.works.sort(WORK_LIST_MODULE.compareWorks);
    }
    function removeWorldWork(draftId) {
      const normalized = String(draftId || '').trim();
      state.works = state.works.filter(item => !(item.workType === 'world' && item.workId === normalized));
    }
    async function deleteWorldDraft(draftId) {
      const normalized = String(draftId || '').trim();
      if (!normalized || !global.confirm?.('确认删除这个世界草稿吗？删除后无法继续编辑。')) return;
      try {
        await options.offlineClient.deleteDraft({ draftId: normalized });
        removeWorldWork(normalized);
        state.error = ''; notify('已删除'); renderList();
      } catch (error) { notify(shortFailure(error, '删除失败，请稍后重试')); renderList(); }
    }
    async function unpublishWorldDraft(draftId, draftRevision) {
      const normalized = String(draftId || '').trim();
      const revision = Number(draftRevision || 0);
      if (!normalized || !Number.isInteger(revision) || revision < 1) return;
      if (pendingWorldUnpublishes.has(normalized)) return;
      if (!global.confirm?.('确认下架这个模拟器吗？\n下架后将不再出现在首页和广场，但草稿和已有创作内容会保留。')) return;
      const listView = root.querySelector('.shex-creator-list');
      pendingWorldUnpublishes.add(normalized);
      root.querySelectorAll('[data-unpublish-world-work]').forEach(button => {
        if (String(button.dataset.unpublishWorldWork || '') === normalized) button.disabled = true;
      });
      try {
        const result = await options.offlineClient.unpublishSimulator({ draftId: normalized, draftRevision: revision });
        const current = state.works.find(item => item.workType === 'world' && item.workId === normalized);
        upsertWorldWork({
          ...(current?.raw || {}),
          draftId: normalized,
          title: current?.title || '未命名世界',
          promoAssetId: current?.promoAssetId || '',
          status: 'unpublished',
          revision: Number(result?.revision || revision),
          updatedAt: Date.now(),
        });
        state.error = ''; notify('模拟器已下架，已有世界和存档可继续使用');
      } catch (error) {
        notify(shortFailure(error, '下架失败，请稍后重试'));
      } finally {
        pendingWorldUnpublishes.delete(normalized);
        if (listView?.isConnected && root.contains(listView)) renderList();
      }
    }
    async function createBlank() {
      const key = 'blank'; const requestId = state.pendingRequests.get(key) || createRequestId('blank_draft'); state.pendingRequests.set(key, requestId);
      try { const result = await api.createBlankDraft({ requestId }); state.pendingRequests.delete(key); state.active = result.draft; state.editorStep = 0; state.drafts.unshift(result.draft); upsertCharacterWork(result.draft); renderEditor(); }
      catch (error) { state.error = error?.message || '空白草稿创建失败'; renderList(); }
    }
    async function importDream() {
      const dreamId = root.querySelector('[data-import-dream]')?.value || '';
      if (!dreamId) { state.error = '请先选择一个私人原创梦角'; return renderList(); }
      const key = `import:${dreamId}`; const requestId = state.pendingRequests.get(key) || createRequestId('import_draft'); state.pendingRequests.set(key, requestId);
      try { const result = await api.importPrivateDream({ requestId, dreamId }); state.pendingRequests.delete(key); state.active = result.draft; state.editorStep = 0; state.drafts.unshift(result.draft); upsertCharacterWork(result.draft); renderEditor(); }
      catch (error) { state.error = error?.message || '梦角导入失败'; renderList(); }
    }
    function openDraft(draftId) {
      state.active = state.drafts.find(item => item.draftId === draftId) || null; state.editorStep = 0;
      readinessSequence += 1;
      state.readiness = null; state.review = null; state.preview = null; state.error = '';
      if (state.active) renderEditor();
    }
    async function deleteDraft(draftId) {
      const draft = state.drafts.find(item => item.draftId === draftId);
      if (!draft || !global.confirm?.('删除这份草稿？删除后不能恢复。')) return;
      try {
        await api.deleteDraft({ draftId, baseRevision: draft.draftRevision });
        state.drafts = state.drafts.filter(item => item.draftId !== draftId);
        state.works = state.works.filter(item => !(item.workType === 'character' && item.workId === draftId));
        state.error = ''; notify('已删除'); renderList();
      } catch (error) { notify(shortFailure(error, '删除失败，请稍后重试')); renderList(); }
    }
    async function unpublishDraft(draftId, characterId, optionsValue = {}) {
      if (!draftId || !characterId || !global.confirm?.('确认下架这个角色？下架后新用户不能领取，已经领取的副本仍会保留。')) return;
      try {
        const result = await api.unpublishCharacter({ draftId, characterId });
        state.drafts = state.drafts.map(item => item.draftId === draftId ? { ...item, publicationStatus: 'unpublished', unpublishedAt: result.publication?.unpublishedAt || Date.now() } : item);
        const updated = state.drafts.find(item => item.draftId === draftId);
        upsertCharacterWork(updated);
        state.error = ''; notify('已下架');
        if (optionsValue.stayInEditor === true && state.active?.draftId === draftId) {
          state.active = updated;
          renderEditor();
        } else renderList();
      } catch (error) {
        notify(shortFailure(error, '下架失败，请稍后重试'));
        if (optionsValue.stayInEditor === true && state.active?.draftId === draftId) renderEditor(); else renderList();
      }
    }
    async function saveDraft(form) {
      const mySequence = ++readinessSequence;
      const initiatingDraftId = state.active?.draftId || '';
      try {
        const result = await api.saveDraft({ draftId: state.active.draftId, baseRevision: state.active.draftRevision, draftPayload: payloadFromForm(form, definitions, state.active.authoringPayload) });
        applySavedDraft(result.draft);
        if (mySequence !== readinessSequence || state.active?.draftId !== initiatingDraftId) return;
        state.active = result.draft;
        state.readiness = null; state.review = null; state.preview = null;
        state.error = ''; notify('已保存'); renderEditor();
      } catch (error) {
        if (mySequence !== readinessSequence || state.active?.draftId !== initiatingDraftId) return;
        notify(shortFailure(error, error?.code === 'DRAFT_REVISION_CONFLICT' ? '草稿已在别处更新，请重新打开' : '保存失败，请稍后重试')); renderEditor();
      }
    }
    async function saveAndPreview(form) {
      const actionKey = `preview:${state.active?.draftId || ''}`;
      if (publicationRequestsInFlight.has(actionKey)) return;
      publicationRequestsInFlight.add(actionKey);
      const mySequence = ++readinessSequence;
      const initiatingDraftId = state.active?.draftId || '';
      const currentEnough = () => mySequence === readinessSequence
        && state.active?.draftId === initiatingDraftId;
      try {
        const nextPayload = payloadFromForm(form, definitions, state.active.authoringPayload);
        const saved = sameDraftPayload(nextPayload, state.active.authoringPayload)
          ? { draft: state.active }
          : await api.saveDraft({ draftId: state.active.draftId, baseRevision: state.active.draftRevision, draftPayload: nextPayload });
        applySavedDraft(saved.draft);
        if (mySequence !== readinessSequence || state.active?.draftId !== initiatingDraftId) return;
        state.active = saved.draft;
        const result = await api.previewPublication(saved.draft.draftId);
        if (!currentEnough()) return;
        state.preview = result.preview;
        const checked = await api.checkPublication({ draftId: saved.draft.draftId, draftRevision: saved.draft.draftRevision });
        if (!currentEnough()) return;
        state.readiness = checked.readiness;
        const reviewList = await api.listPublicationReviews({ limit: 50 });
        if (!currentEnough()) return;
        state.review = selectPublicationReview(reviewList.reviews || [], {
          draftId: saved.draft.draftId,
          draftRevision: saved.draft.draftRevision,
          publicPayloadHash: checked.readiness.publicPayloadHash
        });
        state.error = '';
        renderPreview();
      } catch (error) {
        if (!currentEnough()) return;
        state.error = error?.code === 'DRAFT_REVISION_CONFLICT' ? '另一处已经修改过这份草稿，请重新打开后核对。' : (error?.message || '发布检查失败');
        renderEditor();
      } finally {
        publicationRequestsInFlight.delete(actionKey);
      }
    }
    async function submitReview() {
      const key = `review:${state.active.draftId}:${state.active.draftRevision}`;
      if (publicationRequestsInFlight.has(key)) return;
      publicationRequestsInFlight.add(key);
      const mySequence = ++readinessSequence;
      const initiatingDraftId = state.active?.draftId || '';
      const requestId = state.pendingRequests.get(key) || createRequestId('publication_review');
      state.pendingRequests.set(key, requestId);
      try {
        const result = await api.submitPublicationReview({ requestId, draftId: state.active.draftId, draftRevision: state.active.draftRevision });
        state.pendingRequests.delete(key);
        if (mySequence !== readinessSequence || state.active?.draftId !== initiatingDraftId) return;
        state.review = result.review; state.error = '';
        if (result.review?.status === 'approved') {
          notify('检查通过，正在发布…');
          return await publishCharacter();
        }
        throw new Error('自动规则结果异常，请重新检查');
      } catch (error) {
        if (mySequence !== readinessSequence || state.active?.draftId !== initiatingDraftId) return;
        if (error?.code === 'PUBLICATION_NOT_READY') {
          invalidateReadiness();
          state.error = error?.message || '角色资料还没有通过发布前检查';
          renderEditor();
          return;
        }
        state.error = error?.code === 'PUBLICATION_TEXT_BLOCKED' ? publicationScreeningErrorMessage(error) : (error?.message || '提交审核失败'); renderPreview();
      } finally {
        publicationRequestsInFlight.delete(key);
      }
    }
    async function openReviewQueue() {
      try { const result = await api.listPendingPublicationReviews({ limit: 50 }); state.pendingReviews = result.reviews || []; state.error = ''; renderReviewQueue(); }
      catch (error) { state.error = error?.message || '审核队列读取失败'; state.pendingReviews = []; renderReviewQueue(); }
    }
    async function decideReview(reviewId, decision) {
      const review = state.pendingReviews.find(item => item.reviewId === reviewId);
      if (!review) return;
      const reviewNote = root.querySelector(`[data-review-note="${reviewId}"]`)?.value || '';
      try {
        await api.decidePublicationReview({ reviewId, reviewRevision: review.reviewRevision, decision, reviewNote });
        notify(decision === 'approved' ? '已通过' : '已驳回'); state.error = ''; await openReviewQueue();
      } catch (error) { state.error = error?.message || '审核决定保存失败'; renderReviewQueue(); }
    }
    // 已发布后再发一次：走一张新的自动检查单再发布。内容和美化都没变时服务端会拒绝重复建版本，这时退回原来的已发布状态。
    async function republishCharacter() {
      if (!state.review?.publishedVersionId || !state.active?.draftId) return;
      const previousReview = state.review;
      state.review = null;
      state.republishFromReview = previousReview;
      try {
        await submitReview();
      } finally {
        if (state.republishFromReview === previousReview) state.republishFromReview = null;
        if (!state.review && state.active?.draftId === previousReview.draftId) {
          state.review = previousReview;
          renderPreview();
        }
      }
    }
    async function publishCharacter() {
      if (!state.review || state.review.status !== 'approved') return;
      const initiatingDraftId = state.active?.draftId || '';
      const initiatingReview = state.review;
      const key = `publish:${initiatingReview.reviewId}`;
      if (publicationRequestsInFlight.has(key)) return;
      publicationRequestsInFlight.add(key);
      const mySequence = ++readinessSequence;
      const requestId = state.pendingRequests.get(key) || createRequestId('character_publication');
      state.pendingRequests.set(key, requestId);
      try {
        const beautifyRef=await global?.SHEXBeautify?.editor?.creatorWorkBeautify?.publicationRefFor?.({workType:'character',draftId:initiatingDraftId,title:draftName(state.active||{})},{publicationRequestId:`${requestId}-beautify`})||null;
        const result = await api.publishCharacter({ requestId, draftId: initiatingDraftId, reviewId: initiatingReview.reviewId, ...(beautifyRef?{beautifyRef}:{}) });
        state.pendingRequests.delete(key);
        const publishedDraft = {
          ...(state.drafts.find(item => item.draftId === initiatingDraftId) || { draftId: initiatingDraftId, draftRevision: 0, authoringPayload: {} }),
          publicationStatus: 'published',
          publishedCharacterId: result.publication.characterId,
          publishedVersionId: result.publication.versionId,
          publishedTemplateVersion: result.publication.templateVersion,
          publishedAt: result.publication.publishedAt
        };
        state.drafts = state.drafts.map(item => item.draftId === initiatingDraftId ? publishedDraft : item);
        upsertCharacterWork(publishedDraft);
        if (mySequence !== readinessSequence || state.active?.draftId !== initiatingDraftId) return;
        state.review = { ...initiatingReview, publishedVersionId: result.publication.versionId };
        state.active = publishedDraft;
        notify('发布成功');
        state.error = '';
        global.dispatchEvent?.(new CustomEvent('shex:creator-open-character-gallery', {
          detail: {
            characterId: result.publication.characterId,
            publishedAt: result.publication.publishedAt,
            sort: 'latest'
          }
        }));
      } catch (error) {
        if (mySequence !== readinessSequence || state.active?.draftId !== initiatingDraftId) return;
        if (error?.code === 'PUBLICATION_NOT_READY') {
          invalidateReadiness();
          state.error = error?.message || '角色资料还没有通过发布前检查';
          renderEditor();
          return;
        }
        if (error?.code === 'PUBLICATION_CONTENT_UNCHANGED' && state.republishFromReview) {
          state.review = state.republishFromReview;
          state.republishFromReview = null;
          state.error = '';
          notify('角色内容和美化都没有新变化，不需要重新发布');
          renderPreview();
          return;
        }
        state.error = error?.message || '角色发布失败'; renderPreview();
      } finally {
        publicationRequestsInFlight.delete(key);
      }
    }
    function resume() {
      if (!state.active || !root.querySelector?.('[data-draft-form]')) return false;
      markIndependentPage(true);
      const scrollHost = root.closest?.('.x-panel');
      if (scrollHost) scrollHost.scrollTop = 0;
      syncEditorStickyOffsets();
      global.requestAnimationFrame?.(syncEditorStickyOffsets);
      return true;
    }
    return Object.freeze({ open: load, resume, renderList, upsertWorldWork, removeWorldWork, getState: () => ({ ...state }) });
  }

  return Object.freeze({ WORKBENCH_VERSION, FIELD_LABELS, EDITOR_STEPS, CREATOR_HIDDEN_PATHS, LEGACY_TAXONOMY_PATHS, CHOICE_FIELDS, MODE_GROUPS, editorStepFor, orderedDefinitions, requiredCompletion, isPrivateOriginalDream, availablePrivateDreams, draftName, payloadFromForm, fieldMarkup, choiceFieldMarkup, categoryFieldMarkup, tagFieldMarkup, canActivateTaxonomyChoice, toggleTagId, pairedSelectedTags, avatarFieldMarkup, backgroundFieldMarkup, publicAppearanceCardMarkup, voiceBindingFieldMarkup, previewFieldMarkup, creatorIdentityCardMarkup, loadWorkbenchData, createPublicMediaUploader, sameDraftPayload, hasCurrentTextScreening, publicationScreeningErrorMessage, publicationReviewPriority, selectPublicationReview, creatorActionsMarkup, worldWorkCardMarkup, externalImportPreviewMarkup, materializeExternalImport, materializeReimport, createWorkbench });
});
