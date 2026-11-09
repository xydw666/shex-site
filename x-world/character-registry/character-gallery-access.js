(function initCharacterGalleryAccess(global, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.SHEXCharacterGalleryAccess = api;
})(typeof window !== 'undefined' ? window : globalThis, function createCharacterGalleryAccessModule() {
  'use strict';

  // 已公开的广场角色与世界存档仍需走登录后的会话入口。
  function requiresGalleryAccessForConversation(intent = {}, dream = null) {
    if (intent?.kind === 'world_run') return true;
    return intent?.kind === 'single' && String(dream?.origin || '') === 'template_derived';
  }

  return Object.freeze({ requiresGalleryAccessForConversation });
});
