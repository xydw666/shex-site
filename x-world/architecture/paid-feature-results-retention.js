((root, factory) => {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SHEXPaidFeatureResultsRetention = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  'use strict';

  const DEFAULT_RETENTION_DAYS = 7;
  const DAY_MS = 24 * 60 * 60 * 1000;

  function isRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function cloneJsonRecord(value) {
    if (!isRecord(value)) return {};
    try {
      const cloned = JSON.parse(JSON.stringify(value));
      return isRecord(cloned) ? cloned : {};
    } catch (_) {
      return {};
    }
  }

  function normalizeRetentionDays(value) {
    const days = Math.floor(Number(value || DEFAULT_RETENTION_DAYS));
    return Number.isFinite(days) ? Math.min(366, Math.max(1, days)) : DEFAULT_RETENTION_DAYS;
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

  function prunePaidFeatureResults(value, options = {}) {
    const store = cloneJsonRecord(value);
    const todayOrdinal = dateKeyOrdinal(options.todayKey);
    const retentionDays = normalizeRetentionDays(options.retentionDays);
    if (todayOrdinal === null) {
      return { store, changed: false, removedDateEntries: 0, retentionDays };
    }
    const oldestKeptOrdinal = todayOrdinal - retentionDays + 1;
    let removedDateEntries = 0;
    Object.values(store).forEach((dreamRecords) => {
      if (!isRecord(dreamRecords)) return;
      Object.keys(dreamRecords).forEach((dateKey) => {
        const ordinal = dateKeyOrdinal(dateKey);
        // Unknown keys are retained. This governance only removes proven, expired date entries.
        if (ordinal !== null && ordinal < oldestKeptOrdinal) {
          delete dreamRecords[dateKey];
          removedDateEntries += 1;
        }
      });
    });
    return {
      store,
      changed: removedDateEntries > 0,
      removedDateEntries,
      retentionDays
    };
  }

  return Object.freeze({
    DEFAULT_RETENTION_DAYS,
    dateKeyOrdinal,
    normalizeRetentionDays,
    prunePaidFeatureResults
  });
});
