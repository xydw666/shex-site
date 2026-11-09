((root, factory) => {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SHEXTransmissionRetention = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  'use strict';

  const DEFAULT_RETENTION_DAYS = 90;
  const DAY_MS = 24 * 60 * 60 * 1000;
  const MESSAGE_HISTORY_PREFIX = 'shex_x_message_history_';
  const MESSAGE_CONTEXT_PREFIX = 'shex_x_message_context_';
  const TRANSMISSION_PREFIX = 'shex-transmission-';

  function isRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function normalizeRetentionDays(value) {
    const days = Math.floor(Number(value || DEFAULT_RETENTION_DAYS));
    return Number.isFinite(days) ? Math.min(3660, Math.max(1, days)) : DEFAULT_RETENTION_DAYS;
  }

  function dateKeyOrdinal(value) {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const timestamp = Date.UTC(year, month - 1, day);
    const parsed = new Date(timestamp);
    if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return null;
    return Math.floor(timestamp / DAY_MS);
  }

  function chinaDateKey(timestamp = Date.now()) {
    const date = new Date(Number(timestamp) + 8 * 60 * 60 * 1000);
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
  }

  function transmissionDateKey(logicalKey) {
    const key = String(logicalKey || '');
    if (key.startsWith(MESSAGE_HISTORY_PREFIX)) return key.slice(MESSAGE_HISTORY_PREFIX.length);
    if (key.startsWith(MESSAGE_CONTEXT_PREFIX)) return key.slice(MESSAGE_CONTEXT_PREFIX.length);
    if (key.startsWith(TRANSMISSION_PREFIX)) {
      const match = key.match(/^shex-transmission-.+-(\d{4}-\d{2}-\d{2})$/);
      return match ? match[1] : '';
    }
    return '';
  }

  function shouldRemoveTransmissionDateKey(logicalKey, options = {}) {
    const dateKey = transmissionDateKey(logicalKey);
    const dateOrdinal = dateKeyOrdinal(dateKey);
    const todayKey = options.todayKey || chinaDateKey(options.now);
    const todayOrdinal = dateKeyOrdinal(todayKey);
    if (dateOrdinal === null || todayOrdinal === null) return false;
    const retentionDays = normalizeRetentionDays(options.retentionDays);
    return dateOrdinal < todayOrdinal - retentionDays + 1;
  }

  function pruneTransmissionDateKeys(value, options = {}) {
    const rawData = isRecord(value) ? { ...value } : {};
    const todayKey = options.todayKey || chinaDateKey(options.now);
    const retentionDays = normalizeRetentionDays(options.retentionDays);
    const removedKeys = [];
    Object.keys(rawData).forEach((key) => {
      if (!shouldRemoveTransmissionDateKey(key, { todayKey, retentionDays })) return;
      delete rawData[key];
      removedKeys.push(key);
    });
    return {
      rawData,
      changed: removedKeys.length > 0,
      removedKeys,
      retentionDays,
      todayKey
    };
  }

  return Object.freeze({
    DEFAULT_RETENTION_DAYS,
    chinaDateKey,
    dateKeyOrdinal,
    normalizeRetentionDays,
    pruneTransmissionDateKeys,
    shouldRemoveTransmissionDateKey,
    transmissionDateKey
  });
});
