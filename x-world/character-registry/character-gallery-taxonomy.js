(function initCharacterGalleryTaxonomy(global, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.SHEXCharacterGalleryTaxonomy = api;
})(typeof window !== 'undefined' ? window : globalThis, function createCharacterGalleryTaxonomy() {
  'use strict';

  const TAXONOMY_VERSION = 'character-gallery-taxonomy-v3-x98-categories-only';
  const TYPE_FILTERS = Object.freeze([
    Object.freeze({ id: 'world', label: '世界观' }),
    Object.freeze({ id: 'multi', label: '多人' }),
    Object.freeze({ id: 'gl', label: '百合' }),
    Object.freeze({ id: 'bg', label: 'BG' }),
    Object.freeze({ id: 'bl', label: 'BL' }),
    Object.freeze({ id: 'derivative', label: '衍生作品' }),
    Object.freeze({ id: 'single', label: '单人' }),
    Object.freeze({ id: 'simulator', label: '模拟器' })
  ]);
  // 公共标签只能来自 shex_character_tags；这里故意不保留第二份前端常量。
  const TAG_FILTERS = Object.freeze([]);
  const CONTENT_TYPE_VALUES = Object.freeze(TYPE_FILTERS.map(item => item.label));
  const GALLERY_TAG_VALUES = Object.freeze([]);

  return Object.freeze({ TAXONOMY_VERSION, TYPE_FILTERS, TAG_FILTERS, CONTENT_TYPE_VALUES, GALLERY_TAG_VALUES });
});
