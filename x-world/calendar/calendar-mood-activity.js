(() => {
  'use strict';

  const STORAGE_PREFIX = 'shex_calendar_partner_mood_months_v1:';
  const LOCAL_BACKFILL_PREFIX = 'shex_calendar_partner_mood_backfill_v1:';
  const CLOUD_HYDRATION_PREFIX = 'shex_calendar_partner_mood_cloud_v1:';
  const CLOUD_SEED_PREFIX = 'shex_calendar_partner_mood_seed_v1:';
  const MAX_MONTH_MASK = 0x7fffffff;

  function safeUserId(value) {
    return String(value || '').trim();
  }

  function storageKey(prefix, userId) {
    return `${prefix}${encodeURIComponent(safeUserId(userId) || 'guest')}`;
  }

  function safeConversationId(value) {
    const id = String(value || '').trim();
    return id && id.length <= 240 && id !== '__proto__' && id !== 'prototype' && id !== 'constructor' ? id : '';
  }

  function normalizeTimestamp(value) {
    let timestamp = Math.floor(Number(value || 0));
    if (!Number.isFinite(timestamp) || timestamp <= 0) return 0;
    if (timestamp < 100000000000) timestamp *= 1000;
    return timestamp;
  }

  function chinaDateKey(value) {
    const timestamp = normalizeTimestamp(value);
    if (!timestamp) return '';
    return new Date(timestamp + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
  }

  function normalize(input) {
    const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
    const result = {};
    Object.entries(source).forEach(([conversationIdValue, monthsValue]) => {
      const conversationId = safeConversationId(conversationIdValue);
      if (!conversationId || !monthsValue || typeof monthsValue !== 'object' || Array.isArray(monthsValue)) return;
      const months = {};
      Object.entries(monthsValue).forEach(([month, maskValue]) => {
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return;
        const mask = Math.floor(Number(maskValue || 0));
        if (Number.isFinite(mask) && mask > 0) months[month] = Math.min(MAX_MONTH_MASK, mask);
      });
      if (Object.keys(months).length) result[conversationId] = months;
    });
    return result;
  }

  function merge(leftValue, rightValue) {
    const left = normalize(leftValue);
    const right = normalize(rightValue);
    const result = { ...left };
    Object.entries(right).forEach(([conversationId, months]) => {
      const mergedMonths = { ...(result[conversationId] || {}) };
      Object.entries(months).forEach(([month, mask]) => {
        mergedMonths[month] = ((Number(mergedMonths[month] || 0) | Number(mask || 0)) >>> 0) & MAX_MONTH_MASK;
      });
      result[conversationId] = mergedMonths;
    });
    return result;
  }

  function mark(input, conversationIdValue, timestampValue) {
    const conversationId = safeConversationId(conversationIdValue);
    const date = chinaDateKey(timestampValue);
    if (!conversationId || !date) return normalize(input);
    const result = normalize(input);
    const month = date.slice(0, 7);
    const day = Number(date.slice(8, 10));
    const bit = 2 ** (day - 1);
    const months = { ...(result[conversationId] || {}) };
    months[month] = ((Number(months[month] || 0) | bit) >>> 0) & MAX_MONTH_MASK;
    result[conversationId] = months;
    return result;
  }

  function datesForConversation(input, conversationIdValue, options = {}) {
    const conversationId = safeConversationId(conversationIdValue);
    const since = String(options.since || '');
    const months = normalize(input)[conversationId] || {};
    const dates = [];
    Object.keys(months).sort().forEach((month) => {
      const mask = Number(months[month] || 0);
      const [year, monthNumber] = month.split('-').map(Number);
      const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
      for (let day = 1; day <= daysInMonth; day += 1) {
        const bit = 2 ** (day - 1);
        if ((mask & bit) === 0) continue;
        const date = `${month}-${String(day).padStart(2, '0')}`;
        if (!since || date >= since) dates.push(date);
      }
    });
    return dates;
  }

  function read(userId) {
    try {
      return normalize(JSON.parse(localStorage.getItem(storageKey(STORAGE_PREFIX, userId)) || '{}'));
    } catch (_) {
      return {};
    }
  }

  function write(userId, input, options = {}) {
    const id = safeUserId(userId);
    if (!id) return false;
    const next = normalize(input);
    const key = storageKey(STORAGE_PREFIX, id);
    let previous = '';
    try {
      previous = String(localStorage.getItem(key) || '');
      const serialized = JSON.stringify(next);
      if (serialized === previous) return true;
      localStorage.setItem(key, serialized);
    } catch (_) {
      return false;
    }
    if (options.dispatch !== false && typeof document !== 'undefined' && typeof document.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
      document.dispatchEvent(new CustomEvent('shex:calendar-mood-months-updated', { detail: { userId: id } }));
    }
    return true;
  }

  function mergeAndWrite(userId, input, options = {}) {
    const merged = merge(read(userId), input);
    write(userId, merged, options);
    return merged;
  }

  function recordMessages(userId, conversationType, conversationId, messages, options = {}) {
    if (String(conversationType || '') !== 'single') return read(userId);
    let result = read(userId);
    (Array.isArray(messages) ? messages : []).forEach((message) => {
      if (String(message?.role || message?.originalRole || '') !== 'user') return;
      const timestamp = message?.time || message?.sentAt || message?.createdAt || message?.timestamp || 0;
      result = mark(result, conversationId, timestamp);
    });
    write(userId, result, options);
    return result;
  }

  function marker(prefix, userId) {
    try { return localStorage.getItem(storageKey(prefix, userId)) === '1'; } catch (_) { return false; }
  }

  function setMarker(prefix, userId) {
    try { localStorage.setItem(storageKey(prefix, userId), '1'); return true; } catch (_) { return false; }
  }

  const api = Object.freeze({
    chinaDateKey,
    datesForConversation,
    isEmpty: (input) => Object.keys(normalize(input)).length === 0,
    mark,
    merge,
    mergeAndWrite,
    normalize,
    read,
    recordMessages,
    needsLocalBackfill: (userId) => !marker(LOCAL_BACKFILL_PREFIX, userId),
    markLocalBackfillComplete: (userId) => setMarker(LOCAL_BACKFILL_PREFIX, userId),
    needsCloudHydration: (userId) => !marker(CLOUD_HYDRATION_PREFIX, userId),
    markCloudHydrationComplete: (userId) => setMarker(CLOUD_HYDRATION_PREFIX, userId),
    needsCloudSeed: (userId) => marker(LOCAL_BACKFILL_PREFIX, userId) && !marker(CLOUD_SEED_PREFIX, userId),
    markCloudSeedComplete: (userId) => setMarker(CLOUD_SEED_PREFIX, userId),
    write,
    _test: { normalizeTimestamp, storageKey }
  });

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.SHEXCalendarMoodActivity = api;
})();
