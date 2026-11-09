(function initSegmentStreamRenderer(global, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.SHEXSegmentStreamRenderer = api;
})(typeof window !== 'undefined' ? window : globalThis, function createSegmentStreamRendererAPI() {
  'use strict';

  function createRenderer(options = {}) {
    const requestId = String(options.requestId || '').trim();
    const scheduleFrame = typeof options.scheduleFrame === 'function'
      ? options.scheduleFrame
      : (callback) => setTimeout(callback, 0);
    const createNode = typeof options.createNode === 'function' ? options.createNode : () => ({});
    const appendText = typeof options.appendText === 'function' ? options.appendText : () => {};
    const replaceText = typeof options.replaceText === 'function' ? options.replaceText : () => {};
    const removeNode = typeof options.removeNode === 'function' ? options.removeNode : () => {};
    const afterBatch = typeof options.afterBatch === 'function' ? options.afterBatch : () => {};
    const nodes = new Map();
    let queue = [];
    let scheduled = false;
    let stopped = false;
    let sealed = false;
    let idleWaiters = [];

    function ensureNode(event) {
      const key = String(event.segmentId || '');
      let node = nodes.get(key);
      if (!node) {
        node = createNode(event, nodes);
        if (!node) return null;
        nodes.set(key, node);
      }
      return node;
    }

    function applyEvent(event) {
      if (!event || String(event.requestId || '') !== requestId) return false;
      const key = String(event.segmentId || '');
      if (event.op === 'append') {
        const node = ensureNode(event);
        if (!node) return false;
        appendText(node, String(event.delta || ''), event);
        return true;
      }
      if (event.op === 'replace') {
        if (!String(event.text || '')) {
          const node = nodes.get(key);
          if (node) removeNode(node, event);
          nodes.delete(key);
          return Boolean(node);
        }
        const node = ensureNode(event);
        if (!node) return false;
        replaceText(node, String(event.text || ''), event);
        return true;
      }
      return false;
    }

    function resolveIdle() {
      if (scheduled || queue.length) return;
      const waiters = idleWaiters;
      idleWaiters = [];
      waiters.forEach((resolve) => resolve());
    }

    function schedule() {
      if (scheduled || stopped || !queue.length) return;
      scheduled = true;
      scheduleFrame(flush);
    }

    function flush() {
      scheduled = false;
      if (stopped || !queue.length) {
        resolveIdle();
        return;
      }
      // The provider already controls the natural arrival cadence. Flush every
      // delta received before this animation frame in one DOM batch so a burst
      // cannot create an artificial multi-second "typing" tail.
      const pending = queue;
      queue = [];
      const applied = [];
      pending.forEach((current) => {
        if (applyEvent(current)) applied.push(current);
      });
      if (applied.length) afterBatch(applied, nodes);
      if (queue.length) schedule();
      else resolveIdle();
    }

    function enqueue(event) {
      if (stopped || sealed) return false;
      const incoming = event && typeof event === 'object' ? { ...event } : event;
      const previous = queue[queue.length - 1];
      if (incoming?.op === 'append'
        && previous?.op === 'append'
        && String(previous.requestId || '') === String(incoming.requestId || '')
        && String(previous.segmentId || '') === String(incoming.segmentId || '')
        && String(previous.type || '') === String(incoming.type || '')) {
        previous.delta = `${String(previous.delta || '')}${String(incoming.delta || '')}`;
      } else {
        queue.push(incoming);
      }
      schedule();
      return true;
    }

    function whenIdle() {
      if (!scheduled && !queue.length) return Promise.resolve();
      return new Promise((resolve) => idleWaiters.push(resolve));
    }

    function seal() {
      sealed = true;
      schedule();
      return whenIdle();
    }

    function finish() {
      if (stopped) return;
      sealed = true;
      const pending = queue;
      queue = [];
      const applied = pending.filter(applyEvent);
      if (applied.length) afterBatch(applied, nodes);
      scheduled = false;
      stopped = true;
      resolveIdle();
    }

    return Object.freeze({
      enqueue,
      finish,
      flush,
      seal,
      whenIdle,
      nodeFor(segmentId) { return nodes.get(String(segmentId || '')) || null; },
      get size() { return nodes.size; }
    });
  }

  return Object.freeze({ createRenderer });
});
