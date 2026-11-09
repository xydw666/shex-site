(function initWorldRunView(global, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.SHEXWorldRunView = api;
})(typeof window !== 'undefined' ? window : globalThis, function createWorldRunViewModule() {
  'use strict';
  const escapeHtml = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const safeSource = value => {
    const source = String(value || '').trim();
    return /^(?:https?:|data:|blob:|cloud:\/\/)/i.test(source) ? source : '';
  };
  const text = (value, fallback = '') => String(value ?? fallback).trim() || fallback;
  function normalizeWorldRunResult(input = {}) {
    const root = input && typeof input === 'object' ? input : {};
    const run = root.run && typeof root.run === 'object'
      ? root.run
      : (root.worldRun && typeof root.worldRun === 'object' ? root.worldRun : root);
    const world = root.world && typeof root.world === 'object' ? root.world : {};
    const position = root.position && typeof root.position === 'object' ? root.position : (run.position && typeof run.position === 'object' ? run.position : {});
    return Object.assign({}, root, {
      runId: text(root.runId || run.runId),
      world: Object.assign({}, world, run.world && typeof run.world === 'object' ? run.world : {}),
      position: Object.assign({}, position),
      chapter: root.chapter && typeof root.chapter === 'object' ? root.chapter : {},
      stage: root.stage && typeof root.stage === 'object' ? root.stage : {},
      state: root.state || run.state || null
    });
  }
  function mediaMarkup(source, alt, className, fallback) {
    const clean = safeSource(source);
    if (!clean) return '<div class="' + escapeHtml(className) + ' shex-world-run-media-fallback" aria-hidden="true">' + escapeHtml(fallback) + '</div>';
    const cloudSource = /^cloud:\/\//i.test(clean);
    return '<div class="' + escapeHtml(className) + '"><img class="shex-gallery-cover-image' + (cloudSource ? ' x-cloud-image-loading' : '') + '"' +
      (cloudSource ? '' : ' src="' + escapeHtml(clean) + '"') + ' data-gallery-cover-source="' + escapeHtml(clean) + '" alt="' + escapeHtml(alt) + '"></div>';
  }
  function worldDetailMarkup(input = {}) {
    const title = text(input.title, '未命名世界');
    const creator = text(input.creatorSummary?.displayName || input.creatorDisplayName, '匿名创作者');
    const usage = Number(input.usageCount) >= 50 ? String(Math.max(0, Math.floor(Number(input.usageCount)))) + '次使用' : '';
    const usageMarkup = usage ? ' · ' + escapeHtml(usage) : '';
    const error = text(input.error);
    const detailMedia = mediaMarkup(input.promoUrl || input.promoAssetId, title + '宣传主题图', 'shex-world-run-promo', '界');
    const errorMarkup = error ? '<p class="shex-world-run-message is-error" data-world-run-error>' + escapeHtml(error) + '</p>' : '';
    return '<section class="shex-world-run-detail" data-world-run-detail>' +
      '<header class="shex-world-run-nav"><button type="button" data-world-run-back aria-label="返回广场">‹</button><div><small>世界 / 模拟器</small><strong>' + escapeHtml(title) + '</strong></div></header>' +
      '<div class="shex-world-run-detail-hero">' + detailMedia + '<div class="shex-world-run-detail-copy"><span>世界 / 模拟器</span><h1>' + escapeHtml(title) + '</h1><p>' + escapeHtml(input.publicSummary || '走进这个世界，开启属于你的剧情。') + '</p><small>BY ' + escapeHtml(creator) + usageMarkup + '</small></div></div>' +
      errorMarkup +
      '<button type="button" class="shex-world-run-start" data-world-run-start ' + (input.loading ? 'disabled aria-busy="true"' : '') + '>' + (input.loading ? '正在进入…' : '开始体验') + '</button>' +
      '</section>';
  }
  function worldRunMarkup(input = {}) {
    void input;
    return '';
  }
  return Object.freeze({ escapeHtml, normalizeWorldRunResult, worldDetailMarkup, worldRunMarkup });
});
