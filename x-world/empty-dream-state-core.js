(function initEmptyDreamStateCore(global, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.SHEXEmptyDreamStateCore = api;
})(typeof window !== 'undefined' ? window : globalThis, function createEmptyDreamStateCore() {
  'use strict';

  function hasExplicitEmptyState(state = {}) {
    return Boolean(
      Array.isArray(state.dreams)
      && state.dreams.length === 0
      && state?.dreamsEmptyState?.reason === 'user_deleted_all'
    );
  }

  function cloudConfirmsLegacyEmptyState(state = {}, meta = {}, dataStatus = '') {
    return Boolean(
      Array.isArray(state.dreams)
      && state.dreams.length === 0
      && Object.keys(state.deletedDreams || {}).length > 0
      && dataStatus === 'success'
      && meta.loaded === true
      && meta.hasXStateKey === true
      && meta.xDreamCount === 0
      && Number(meta.xDeletedDreamCount || 0) > 0
    );
  }

  function shouldPreserveEmptyState(state = {}, meta = {}, dataStatus = '') {
    return hasExplicitEmptyState(state) || cloudConfirmsLegacyEmptyState(state, meta, dataStatus);
  }

  function markDeletedAll(state = {}, at = Date.now()) {
    if (!Array.isArray(state.dreams) || state.dreams.length > 0) return { ...state };
    return { ...state, dreamsEmptyState: { reason: 'user_deleted_all', at: Number(at || Date.now()) } };
  }

  function clearForFirstDream(state = {}) {
    return { ...state, dreamsEmptyState: null };
  }

  return Object.freeze({
    hasExplicitEmptyState,
    cloudConfirmsLegacyEmptyState,
    shouldPreserveEmptyState,
    markDeletedAll,
    clearForFirstDream
  });
});
