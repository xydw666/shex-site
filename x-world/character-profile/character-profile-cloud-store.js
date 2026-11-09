(function initDreamProfileCloudStore(global, factory) {
  const sync = typeof module !== 'undefined' && module.exports
    ? require('./character-profile-sync.js')
    : global?.SHEXCharacterProfileSync;
  const api = factory(global, sync);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.SHEXDreamProfileCloudStore = api;
})(typeof window !== 'undefined' ? window : globalThis, function createDreamProfileCloudStore(global, profileSync) {
  'use strict';

  const PROTOCOL_VERSION = 1;

  function requireApi() {
    const api = global?.SHEXUserData;
    if (!api?.saveDreamProfileGroup) {
      const error = new Error('角色资料云端存储尚未就绪');
      error.code = 'DREAM_PROFILE_STORAGE_UNAVAILABLE';
      throw error;
    }
    return api;
  }

  function groupPayload(dream, group) {
    if (!profileSync?.groupValue || !profileSync?.groupHash) {
      const error = new Error('角色资料同步核心尚未就绪');
      error.code = 'CHARACTER_PROFILE_SYNC_MISSING';
      throw error;
    }
    const value = profileSync.groupValue(dream, group);
    return { value, valueHash: profileSync.groupHash(value, group) };
  }

  async function saveGroup(options = {}) {
    const dreamId = String(options.dreamId || '').trim();
    const group = String(options.group || '').trim();
    const rename = typeof options.displayName === 'string';
    // 旧后端会拒绝这个非资料字段，避免误把局部改名解析成空人设覆盖。
    const payload = rename ? { value: { displayNameIntent: options.displayName } } : groupPayload(options.dream || {}, group);
    return requireApi().saveDreamProfileGroup({
      dreamId,
      group,
      baseDocumentRevision: Math.max(0, Math.floor(Number(options.baseDocumentRevision || 0)) || 0),
      baseGroupRevision: Math.max(0, Math.floor(Number(options.baseGroupRevision || 0)) || 0),
      baseValueHash: String(options.baseValueHash || ''),
      value: payload.value,
      // 版本不一致时要求后端只回传最新资料，由前端自动合并后重试，不生成需要用户选择的冲突。
      ...(!rename && options.autoRebase === true ? { autoRebase: true } : {}),
      ...(rename ? { displayName: options.displayName } : {})
    }, { applyResult: options.applyResult });
  }

  async function resolveConflict(options = {}) {
    return requireApi().resolveDreamProfileConflict({
      dreamId: String(options.dreamId || '').trim(),
      conflictId: String(options.conflictId || '').trim(),
      selectedHash: String(options.selectedHash || '').trim(),
      expectedDocumentRevision: Math.max(0, Math.floor(Number(options.expectedDocumentRevision || 0)) || 0)
    });
  }

  function status(dreamId) {
    return requireApi().getDreamProfileStatus?.(dreamId) || { status: 'legacy', revision: 0 };
  }

  return Object.freeze({ PROTOCOL_VERSION, groupPayload, saveGroup, resolveConflict, status });
});
