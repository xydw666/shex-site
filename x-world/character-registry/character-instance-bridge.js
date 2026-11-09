(function initCharacterInstanceBridge(global, factory) {
  const modelCatalog = typeof module !== 'undefined' && module.exports
    ? require('../character-ai/model-catalog.generated.js')
    : global?.SHEXCharacterAIModelCatalog;
  const api = factory(modelCatalog);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.SHEXCharacterInstanceBridge = api;
})(typeof window !== 'undefined' ? window : globalThis, function createCharacterInstanceBridge(modelCatalog) {
  'use strict';

  const BRIDGE_VERSION = 'character-instance-bridge-v8-x92-empty-user-call';
  const TEMPLATE_DERIVED_ORIGIN = 'template_derived';
  const MODEL_IDS = new Set((modelCatalog?.models || []).map((model) => String(model.id || '')));
  const LEGACY_MODEL_ALIASES = modelCatalog?.legacyAliases || {};

  function normalizeModelId(value) {
    const requested = String(value || '').trim().toLowerCase();
    if (Object.prototype.hasOwnProperty.call(LEGACY_MODEL_ALIASES, requested)) return requested;
    return MODEL_IDS.has(requested) ? requested : 'economy';
  }

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function text(value, fallback = '') {
    return String(value ?? '').trim() || fallback;
  }

  function buildLegacyDreamFromInstance(instance = {}, options = {}) {
    const source = instance.sourceCharacter && typeof instance.sourceCharacter === 'object'
      ? instance.sourceCharacter : {};
    const payload = source.publicPayload && typeof source.publicPayload === 'object'
      ? source.publicPayload : {};
    const instanceId = text(instance.instanceId);
    if (!instanceId) throw Object.assign(new Error('角色副本编号缺失'), { code: 'INSTANCE_ID_REQUIRED' });
    const displayName = text(source.displayName || payload.characterProfile?.basic?.displayName, '未命名角色');
    const userCall = text(options.userCall);
    const timestamp = Math.max(0, Number(instance.createdAt || options.now || Date.now()) || Date.now());
    return {
      id: instanceId,
      characterInstanceId: instanceId,
      origin: TEMPLATE_DERIVED_ORIGIN,
      characterId: text(instance.characterId || source.characterId),
      sourceTemplateVersion: Math.max(1, Math.floor(Number(instance.sourceTemplateVersion || source.templateVersion) || 1)),
      sourceVersionId: text(instance.sourceVersionId || source.versionId),
      name: displayName,
      nickname: displayName,
      userNickname: userCall,
      userCall,
      avatar: text(source.avatarAssetId),
      characterProfile: clone(payload.characterProfile || {}),
      templateMetadata: clone(payload.templateMetadata || {}),
      relationshipProfile: clone(instance.relationshipProfile || {}),
      accountUserProfile: {},
      userRelationProfile: { userCall },
      // 角色广场副本是固定 AI 角色；服务端资格门禁仍决定当前用户能否实际调用。
      replyMode: 'ai',
      aiOnlineMode: instance.instanceSettings?.aiOnlineMode === 'on'
        || (!Object.prototype.hasOwnProperty.call(instance.instanceSettings || {}, 'aiOnlineMode')
          && instance.instanceSettings?.aiActionMode === 'off'),
      aiLongformMode: instance.instanceSettings?.aiLongformMode === 'on',
      aiModelTier: normalizeModelId(instance.instanceSettings?.aiModelTier),
      voiceMode: ['manual', 'auto'].includes(instance.instanceSettings?.voiceMode) ? instance.instanceSettings.voiceMode : 'off',
      backgroundPhotoId: '',
      albumDisplayPhotoId: '',
      worldAvatarCaption: '',
      characterHydrationState: Object.keys(payload.characterProfile || {}).length ? 'complete' : 'summary',
      createdAt: timestamp,
      updatedAt: Math.max(timestamp, Number(instance.updatedAt || 0) || 0)
    };
  }

  function findDreamIndex(dreams = [], instance = {}) {
    const instanceId = text(instance.instanceId);
    return dreams.findIndex((dream) => text(dream?.characterInstanceId || dream?.id) === instanceId);
  }

  function countActiveDreams(dreams = []) {
    return (Array.isArray(dreams) ? dreams : [])
      .filter((dream) => dream && typeof dream === 'object' && text(dream.id) && !Number(dream.deletedAt || 0))
      .length;
  }

  function mergeInstanceIntoState(stateValue = {}, instance = {}, options = {}) {
    const state = stateValue && typeof stateValue === 'object' ? stateValue : {};
    const dreams = Array.isArray(state.dreams) ? state.dreams : (state.dreams = []);
    const existingIndex = findDreamIndex(dreams, instance);
    if (existingIndex >= 0) {
      const existing = dreams[existingIndex];
      const hydrated = buildLegacyDreamFromInstance(instance, { userCall: options.userCall || existing.userCall, now: options.now });
      const hasFullPayload = hydrated.characterHydrationState === 'complete';
      dreams[existingIndex] = {
        ...existing,
        characterInstanceId: text(existing.characterInstanceId || instance.instanceId),
        origin: TEMPLATE_DERIVED_ORIGIN,
        replyMode: 'ai',
        characterId: text(existing.characterId || instance.characterId),
        // X103：服务端副本是版本的权威来源；用户选择更新后，本地镜像跟随新的来源版本。
        sourceTemplateVersion: Math.max(1, Math.floor(Number(instance.sourceTemplateVersion || existing.sourceTemplateVersion) || 1)),
        sourceVersionId: text(instance.sourceVersionId || existing.sourceVersionId),
        name: hasFullPayload ? hydrated.name : text(existing.name || hydrated.name, '未命名角色'),
        nickname: hasFullPayload ? hydrated.nickname : text(existing.nickname || hydrated.nickname, '未命名角色'),
        avatar: hasFullPayload ? hydrated.avatar : text(existing.avatar || hydrated.avatar),
        characterProfile: hasFullPayload ? hydrated.characterProfile : clone(existing.characterProfile || {}),
        templateMetadata: hasFullPayload ? hydrated.templateMetadata : clone(existing.templateMetadata || {}),
        relationshipProfile: hasFullPayload ? clone(instance.relationshipProfile || existing.relationshipProfile || {}) : clone(existing.relationshipProfile || {}),
        characterHydrationState: hasFullPayload ? 'complete' : text(existing.characterHydrationState, 'summary')
      };
      return { changed: JSON.stringify(existing) !== JSON.stringify(dreams[existingIndex]), dreamId: dreams[existingIndex].id, restored: false };
    }
    const maxActiveInstances = options.maxActiveInstances === null || options.maxActiveInstances === 'unlimited'
      ? null
      : Math.max(1, Math.floor(Number(options.maxActiveInstances) || 5));
    if (maxActiveInstances !== null && countActiveDreams(dreams) >= maxActiveInstances) {
      return { changed: false, dreamId: '', restored: false, code: 'LOCAL_INSTANCE_LIMIT_REACHED' };
    }
    const dream = buildLegacyDreamFromInstance(instance, { userCall: options.userCall, now: options.now });
    dreams.push(dream);
    state.dreamsEmptyState = null;
    state.singleChats = state.singleChats && typeof state.singleChats === 'object' ? state.singleChats : {};
    state.letters = state.letters && typeof state.letters === 'object' ? state.letters : {};
    state.replies = state.replies && typeof state.replies === 'object' ? state.replies : {};
    state.companions = state.companions && typeof state.companions === 'object' ? state.companions : {};
    state.singleChats[dream.id] ||= [];
    state.letters[dream.id] ||= {};
    state.replies[dream.id] ||= [];
    state.companions[dream.id] ||= {};
    if (!text(state.currentDreamId)) state.currentDreamId = dream.id;
    return { changed: true, dreamId: dream.id, restored: true };
  }

  function mergeInstancesIntoState(state = {}, instances = [], options = {}) {
    const results = [];
    for (const instance of Array.isArray(instances) ? instances : []) {
      results.push({ instanceId: text(instance?.instanceId), ...mergeInstanceIntoState(state, instance, options) });
    }
    return {
      changed: results.some(item => item.changed),
      restoredCount: results.filter(item => item.restored).length,
      results
    };
  }

  return Object.freeze({
    BRIDGE_VERSION,
    TEMPLATE_DERIVED_ORIGIN,
    buildLegacyDreamFromInstance,
    findDreamIndex,
    countActiveDreams,
    mergeInstanceIntoState,
    mergeInstancesIntoState
  });
});
