(function initWorldRunProgressStrip(global, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.SHEXWorldRunProgressStrip = api;
})(typeof window !== 'undefined' ? window : globalThis, function createWorldRunProgressStripModule() {
  'use strict';

  const text = value => String(value ?? '').trim();

  function model(context = {}, options = {}) {
    if (!context || context.kind !== 'world_run') return { visible:false, runId:'', label:'' };
    const runId = text(context.runId);
    const completed = context.completion?.status === 'completed';
    const label = completed
      ? `已通关 · ${text(context.completion.title) || '故事结束'}`.slice(0, 220)
      : text(context.statePresentation?.platformLabel).slice(0, 220);
    return { visible:Boolean(runId && label && (completed || options.showPlatformBar !== false)), runId, label };
  }

  function sync(chatRoot, context = {}, options = {}) {
    if (!chatRoot || typeof chatRoot.querySelector !== 'function') return model(context, options);
    const next = model(context, options);
    let strip = chatRoot.querySelector('#ixWorldProgressStrip');
    if (!strip) {
      const documentRef = chatRoot.ownerDocument || globalThis.document;
      if (!documentRef?.createElement) return next;
      strip = documentRef.createElement('div');
      strip.id = 'ixWorldProgressStrip';
      strip.className = 'ix-world-progress-strip';
      strip.setAttribute('aria-live', 'polite');
      const log = chatRoot.querySelector('#ixLog');
      if (log) chatRoot.insertBefore(strip, log);
      else chatRoot.appendChild(strip);
    }
    strip.textContent = next.label;
    strip.hidden = !next.visible;
    strip.dataset.runId = next.runId;
    // X103 Phase 5：签名必须同时覆盖 statePresentation 与公开变量快照，否则变量变了
    // 签名不变，现有的 event → refreshWorldProgressComponents 链就不会被触发。
    const signature = next.runId
      ? JSON.stringify({ presentation:context.statePresentation || {}, variables:context.variables || {} })
      : '';
    if (strip.dataset.presentationSignature !== signature) {
      strip.dataset.presentationSignature = signature;
      const view = chatRoot.ownerDocument?.defaultView;
      if (next.runId && typeof view?.CustomEvent === 'function') {
        chatRoot.ownerDocument.dispatchEvent(new view.CustomEvent('shex:world-run-state-presentation-changed', {
          detail:{ runId:next.runId, statePresentation:context.statePresentation || {}, variables:context.variables || {} }
        }));
      }
    }
    return next;
  }

  return { model, sync };
});
