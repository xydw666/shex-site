(function initReplyDeliveryCore(global, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.SHEXReplyDeliveryCore = api;
})(typeof window !== 'undefined' ? window : globalThis, function createReplyDeliveryCore() {
  'use strict';

  const MAX_DELAY_SECONDS = 360;
  const FINAL_FAILURE_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;
  const PENDING_RECOVERY_MAX_AGE_MS = 2 * 60 * 1000;
  const GENERATION_RECOVERY_MAX_AGE_MS = 5 * 60 * 1000;
  const DELIVERY_OVERDUE_GRACE_MS = 2 * 60 * 1000;
  const TERMINAL_ITEM_STATES = new Set(['delivered', 'cancelled', 'final-failed']);

  function finiteNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function normalizeReplyTiming(input = {}) {
    let min = finiteNumber(input.min, 1);
    let max = finiteNumber(input.max, 4);
    min = Math.min(MAX_DELAY_SECONDS, Math.max(0, min));
    max = Math.min(MAX_DELAY_SECONDS, Math.max(0, max));
    if (max < min) max = min;
    return { min, max };
  }

  function stableTaskId(task = {}) {
    return String(task.taskId || task.requestId || `${task.conversationKey || ''}::${task.messageId || ''}`);
  }

  function stableDeliveryItemId(task = {}, index = 0) {
    return `${stableTaskId(task)}:reply:${Math.max(0, Number(index || 0))}`;
  }

  function createGeneratedTask(base = {}, descriptors = [], now = Date.now()) {
    let cursor = Number(now || Date.now());
    const items = (Array.isArray(descriptors) ? descriptors : []).map((descriptor, index) => {
      cursor += Math.max(0, finiteNumber(descriptor?.delayMs, 0));
      return {
        deliveryItemId: stableDeliveryItemId(base, index),
        dueAt: cursor,
        status: 'waiting',
        attempts: 0,
        payload: descriptor?.payload && typeof descriptor.payload === 'object' ? descriptor.payload : {},
        meta: descriptor?.meta && typeof descriptor.meta === 'object' ? descriptor.meta : {}
      };
    });
    return {
      ...base,
      taskId: stableTaskId(base),
      replyStatus: 'generated-waiting',
      replyQueued: true,
      generatedAt: Number(now || Date.now()),
      items,
      updatedAt: Number(now || Date.now())
    };
  }

  function markDeliveryItem(task = {}, deliveryItemId = '', status = 'delivered', now = Date.now(), patch = {}) {
    const items = (Array.isArray(task.items) ? task.items : []).map((item) => (
      item?.deliveryItemId === deliveryItemId
        ? { ...item, ...patch, status, updatedAt: Number(now || Date.now()) }
        : item
    ));
    return { ...task, items, updatedAt: Number(now || Date.now()) };
  }

  function allItemsTerminal(task = {}) {
    const items = Array.isArray(task.items) ? task.items : [];
    return items.length > 0 && items.every((item) => TERMINAL_ITEM_STATES.has(item?.status));
  }

  function hasFinalFailure(task = {}) {
    return task.replyStatus === 'final-failed'
      || (Array.isArray(task.items) && task.items.some((item) => item?.status === 'final-failed'));
  }

  function canClearTask(task = {}) {
    if (!allItemsTerminal(task) || hasFinalFailure(task)) return false;
    return task.items.every((item) => item.status === 'delivered' || item.status === 'cancelled');
  }

  function markTaskFailed(task = {}, error = null, now = Date.now(), failureCount = 1) {
    const at = Number(now || Date.now());
    return {
      ...task,
      replyStatus: 'final-failed',
      replyQueued: false,
      failureCount: Math.max(1, Number(failureCount || 1)),
      lastError: String(error?.message || error || 'reply delivery failed'),
      lastAttemptAt: at,
      retainUntil: at + FINAL_FAILURE_RETENTION_MS,
      updatedAt: at
    };
  }

  function shouldPruneTask(task = {}, now = Date.now()) {
    if (task.replyStatus !== 'final-failed') return false;
    return Number(task.retainUntil || 0) > 0 && Number(task.retainUntil) <= Number(now || Date.now());
  }

  function taskActivityAt(task = {}) {
    return Math.max(0, finiteNumber(task.updatedAt, finiteNumber(task.createdAt, 0)));
  }

  function waitingDeliveryItems(task = {}) {
    return (Array.isArray(task.items) ? task.items : []).filter((item) => item?.status === 'waiting');
  }

  function pendingPresentationDeadline(task = {}) {
    const activityAt = taskActivityAt(task);
    if (!activityAt) return 0;
    if (task.replyStatus === 'pending') return activityAt + PENDING_RECOVERY_MAX_AGE_MS;
    if (task.replyStatus === 'ready' || task.replyStatus === 'paid-generating') {
      return activityAt + GENERATION_RECOVERY_MAX_AGE_MS;
    }
    if (task.replyStatus === 'generated-waiting') {
      const waiting = waitingDeliveryItems(task);
      if (!waiting.length) return 0;
      const lastDueAt = waiting.reduce((latest, item) => Math.max(latest, finiteNumber(item?.dueAt, activityAt)), activityAt);
      return lastDueAt + DELIVERY_OVERDUE_GRACE_MS;
    }
    return 0;
  }

  function hasPendingPresentation(task = {}, now = Date.now()) {
    const deadline = pendingPresentationDeadline(task);
    return deadline > 0 && finiteNumber(now, Date.now()) <= deadline;
  }

  function recoveryAction(task = {}, now = Date.now()) {
    if (task.replyStatus === 'pending') {
      return hasPendingPresentation(task, now) ? 'resume-energy' : 'manual-retry';
    }
    if (task.replyStatus === 'ready' || task.replyStatus === 'paid-generating') {
      return hasPendingPresentation(task, now) ? 'resume-generation' : 'manual-retry';
    }
    if (task.replyStatus === 'generated-waiting') {
      if (waitingDeliveryItems(task).length) return 'schedule-delivery';
      if (canClearTask(task)) return 'clear';
    }
    return 'ignore';
  }

  function canConfirmSourceMissing(input = {}) {
    if (input.userDataReady !== true) return false;
    if (input.localChatStoreEnabled === true && input.localChatStoreReady !== true) return false;
    return true;
  }

  return Object.freeze({
    MAX_DELAY_SECONDS,
    FINAL_FAILURE_RETENTION_MS,
    PENDING_RECOVERY_MAX_AGE_MS,
    GENERATION_RECOVERY_MAX_AGE_MS,
    DELIVERY_OVERDUE_GRACE_MS,
    normalizeReplyTiming,
    stableTaskId,
    stableDeliveryItemId,
    createGeneratedTask,
    markDeliveryItem,
    allItemsTerminal,
    hasFinalFailure,
    canClearTask,
    markTaskFailed,
    shouldPruneTask,
    pendingPresentationDeadline,
    hasPendingPresentation,
    recoveryAction,
    canConfirmSourceMissing
  });
});
