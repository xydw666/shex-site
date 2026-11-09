(function initCharacterOpeningContract(global, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.SHEXCharacterOpeningContract = api;
})(typeof window !== 'undefined' ? window : globalThis, function createCharacterOpeningContract() {
  'use strict';

  const CONTRACT_VERSION = 'character-opening-contract-v6-template-delivery-only';
  const OPENING_MAX_CHARACTERS = 400;

  function text(value, maxCharacters = OPENING_MAX_CHARACTERS) {
    return Array.from(String(value || '').replace(/\r\n?/g, '\n').trim())
      .slice(0, Math.max(0, Number(maxCharacters) || 0))
      .join('');
  }

  function normalizeOpening(value = {}) {
    return Object.freeze({
      freeform: text(value?.freeform),
      updatedAt: Math.max(0, Math.floor(Number(value?.updatedAt || 0)))
    });
  }

  function isTemplateDerived(dream = {}) {
    return String(dream?.origin || dream?.sourceOrigin || '') === 'template_derived'
      || Boolean(dream?.characterInstanceId && dream?.characterId);
  }

  function resolveOpening(dream = {}) {
    // 私人自建梦角没有作品开场白。开场白只属于从角色广场领取的模板副本。
    if (!isTemplateDerived(dream)) return Object.freeze({ text: '', source: '' });
    const templateOpening = text(dream?.templateMetadata?.openingText);
    if (templateOpening) return Object.freeze({ text: templateOpening, source: 'template_metadata' });

    // 已发布旧角色可能仍把开场保存在历史字段中，只对模板副本兼容读取。
    const storedOpening = normalizeOpening(dream?.characterProfile?.opening);
    if (storedOpening.freeform) return Object.freeze({ text: storedOpening.freeform, source: 'legacy_character_profile' });
    const legacyOpening = normalizeOpening(
      dream?.relationshipProfile?.opening?.freeform
        ? dream.relationshipProfile.opening
        : dream?.templateDefaults?.opening
    );
    if (legacyOpening.freeform) return Object.freeze({ text: legacyOpening.freeform, source: 'legacy_opening' });
    return Object.freeze({ text: '', source: '' });
  }

  function shouldInsert(options = {}) {
    return options.dataReady === true
      && options.historyHydrated === true
      && Math.max(0, Number(options.openingHandledAt || 0)) === 0
      && options.historyCleared !== true
      && Math.max(0, Number(options.messageCount || 0)) === 0
      && Boolean(text(options.openingText));
  }

  // Keep the visible syntax aligned with parseMinimalSegments, without invoking AI.
  function parseOpeningSegments(value = '', maxCharacters = OPENING_MAX_CHARACTERS) {
    const raw = text(value, maxCharacters);
    if (!raw) return [];
    const segments = [];
    const tokenPattern = /<scene>\s*([\s\S]*?)\s*<\/scene>|（([\s\S]*?)）|\(([^()]*)\)/gi;
    let cursor = 0;
    let match;
    const pushDialogue = (value) => {
      const content = String(value || '').replace(/<\/?scene>/gi, '').trim();
      if (content) segments.push({ type: 'dialogue', text: content });
    };
    while ((match = tokenPattern.exec(raw))) {
      if (match.index > cursor) pushDialogue(raw.slice(cursor, match.index));
      const content = String(match[1] ?? match[2] ?? match[3] ?? '').trim();
      if (content) segments.push({ type: match[1] !== undefined ? 'scene' : 'action', text: content });
      cursor = tokenPattern.lastIndex;
    }
    if (cursor < raw.length) pushDialogue(raw.slice(cursor));
    if (!segments.length) pushDialogue(raw);
    return segments;
  }

  return Object.freeze({
    CONTRACT_VERSION,
    OPENING_MAX_CHARACTERS,
    isTemplateDerived,
    normalizeOpening,
    resolveOpening,
    parseOpeningSegments,
    shouldInsert
  });
});
