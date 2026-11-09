(function initCharacterAIStreamScrollController(global, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.SHEXCharacterAIStreamScroll = api;
})(typeof window !== 'undefined' ? window : globalThis, function createCharacterAIStreamScrollControllerAPI() {
  'use strict';

  function defaultNearBottom(container, threshold = 80) {
    if (!container) return false;
    return Number(container.scrollHeight || 0)
      - Number(container.scrollTop || 0)
      - Number(container.clientHeight || 0) <= threshold;
  }

  function createController(options = {}) {
    const container = options.container || null;
    const threshold = Math.max(0, Number(options.threshold || 80));
    const settleDelayMs = Math.max(80, Number(options.settleDelayMs || 160));
    const isNearBottom = typeof options.isNearBottom === 'function' ? options.isNearBottom : defaultNearBottom;
    const scheduleFrame = typeof options.scheduleFrame === 'function'
      ? options.scheduleFrame
      : (callback) => globalThis.requestAnimationFrame(callback);
    const cancelFrame = typeof options.cancelFrame === 'function'
      ? options.cancelFrame
      : (frame) => globalThis.cancelAnimationFrame(frame);
    const setTimer = typeof options.setTimer === 'function' ? options.setTimer : setTimeout;
    const clearTimer = typeof options.clearTimer === 'function' ? options.clearTimer : clearTimeout;
    const debugEnabled = options.debug === true;

    let following = isNearBottom(container, threshold);
    let userInteracting = false;
    let waitingForScrollSettle = false;
    let programmatic = false;
    let destroyed = false;
    let followFrame = 0;
    let releaseFrame = 0;
    let settleTimer = 0;
    let scrollWrites = 0;
    let writesSinceSnapshot = 0;

    function clearSettleTimer() {
      if (!settleTimer) return;
      clearTimer(settleTimer);
      settleTimer = 0;
    }

    function settleUserScroll() {
      clearSettleTimer();
      if (destroyed || userInteracting) return;
      waitingForScrollSettle = false;
      following = isNearBottom(container, threshold);
    }

    function scheduleUserScrollSettle() {
      clearSettleTimer();
      if (destroyed || userInteracting) return;
      waitingForScrollSettle = true;
      settleTimer = setTimer(settleUserScroll, settleDelayMs);
    }

    function onScroll() {
      if (destroyed || programmatic) return;
      if (userInteracting || waitingForScrollSettle) {
        scheduleUserScrollSettle();
        return;
      }
      following = isNearBottom(container, threshold);
    }

    function onUserScrollStart() {
      clearSettleTimer();
      userInteracting = true;
      waitingForScrollSettle = false;
      following = false;
    }

    function onUserScrollEnd() {
      userInteracting = false;
      scheduleUserScrollSettle();
    }

    function onWheel() {
      userInteracting = false;
      following = false;
      scheduleUserScrollSettle();
    }

    function onScrollEnd() {
      if (userInteracting) return;
      settleUserScroll();
    }

    container?.addEventListener?.('scroll', onScroll, { passive: true });
    container?.addEventListener?.('touchstart', onUserScrollStart, { passive: true });
    container?.addEventListener?.('touchend', onUserScrollEnd, { passive: true });
    container?.addEventListener?.('touchcancel', onUserScrollEnd, { passive: true });
    container?.addEventListener?.('wheel', onWheel, { passive: true });
    container?.addEventListener?.('scrollend', onScrollEnd, { passive: true });

    function followAfterLayout() {
      if (!container || destroyed || !following || userInteracting || waitingForScrollSettle || followFrame) return;
      followFrame = scheduleFrame(() => {
        followFrame = 0;
        if (!container?.isConnected || destroyed || !following || userInteracting || waitingForScrollSettle) return;
        programmatic = true;
        scrollWrites += 1;
        writesSinceSnapshot += 1;
        container.scrollTop = container.scrollHeight;
        if (releaseFrame) cancelFrame(releaseFrame);
        releaseFrame = scheduleFrame(() => {
          releaseFrame = 0;
          programmatic = false;
        });
      });
    }

    function debugSnapshot(resetWrites = false) {
      if (!debugEnabled) return null;
      const snapshot = {
        following,
        userInteracting,
        waitingForScrollSettle,
        programmatic,
        scrollWrites,
        writesSinceSnapshot
      };
      if (resetWrites) writesSinceSnapshot = 0;
      return snapshot;
    }

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      clearSettleTimer();
      if (followFrame) cancelFrame(followFrame);
      if (releaseFrame) cancelFrame(releaseFrame);
      followFrame = 0;
      releaseFrame = 0;
      container?.removeEventListener?.('scroll', onScroll);
      container?.removeEventListener?.('touchstart', onUserScrollStart);
      container?.removeEventListener?.('touchend', onUserScrollEnd);
      container?.removeEventListener?.('touchcancel', onUserScrollEnd);
      container?.removeEventListener?.('wheel', onWheel);
      container?.removeEventListener?.('scrollend', onScrollEnd);
    }

    return Object.freeze({
      followAfterLayout,
      destroy,
      ...(debugEnabled ? { debugSnapshot } : {})
    });
  }

  return Object.freeze({ createController });
});
