(function initPublicFieldSemantics(global, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.SHEXPublicFieldSemantics = api;
})(typeof window !== 'undefined' ? window : globalThis, function createPublicFieldSemantics() {
  'use strict';

  const PUBLIC_FIELD_SEMANTICS_VERSION = 'character-public-field-semantics-v2-x99-chat-default';
  const clean = value => String(value || '').trim();

  function backgroundMediaSource(value) {
    if (typeof value === 'string') return clean(value);
    if (!value || typeof value !== 'object') return '';
    return clean(value.fileID || value.url || value.posterFileID || value.posterUrl);
  }

  function resolveEffectiveBackground(input = {}) {
    const privateBackground = clean(input.privateBackgroundPhotoId);
    if (privateBackground) return { source: privateBackground, origin: 'private' };
    const claimedBackground = clean(input.templateMetadata?.backgroundAssetId);
    if (claimedBackground) return { source: claimedBackground, origin: 'claimed_template' };
    const productDefault = clean(input.productDefaultBackground);
    return { source: productDefault, origin: productDefault ? 'product_default' : 'none' };
  }

  function resolveEffectiveChatBackground(input = {}) {
    const instanceId = clean(input.instanceId);
    if (backgroundMediaSource(input.userBackground)) {
      return { background: input.userBackground, origin: 'user_custom', instanceId };
    }
    const claimedBackground = clean(input.templateMetadata?.backgroundAssetId);
    const isClaimedSingle = clean(input.conversationKind) === 'single'
      && clean(input.characterOrigin) === 'template_derived'
      && Boolean(instanceId);
    if (isClaimedSingle && claimedBackground) {
      return {
        background: { version: 2, mediaType: 'image', fileID: claimedBackground },
        origin: 'claimed_template',
        instanceId
      };
    }
    return { background: '', origin: 'product_default', instanceId: '' };
  }

  function chatBackgroundMediaRoute(resolution = {}) {
    const fileId = backgroundMediaSource(resolution.background);
    if (!fileId) return { kind: 'none', fileId: '', instanceId: '' };
    if (!/^cloud:\/\//i.test(fileId)) return { kind: 'direct', fileId, instanceId: '' };
    if (clean(resolution.origin) === 'claimed_template' && clean(resolution.instanceId)) {
      return { kind: 'public_character', fileId, instanceId: clean(resolution.instanceId) };
    }
    return { kind: 'private_user', fileId, instanceId: '' };
  }

  return Object.freeze({
    PUBLIC_FIELD_SEMANTICS_VERSION,
    resolveEffectiveBackground,
    resolveEffectiveChatBackground,
    chatBackgroundMediaRoute
  });
});
