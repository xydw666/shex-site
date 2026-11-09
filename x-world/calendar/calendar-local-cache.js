((root, factory) => {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SHEXCalendarLocalCache = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  'use strict';

  const CACHE_SCHEMA_VERSION = 2;
  const CACHE_POLICY_VERSION = 1;
  const DEFAULT_HISTORY_MONTHS = 12;
  const DEFAULT_MAX_CACHE_BYTES = 512 * 1024;
  const MIN_PERIOD_RECORDS = 7;
  const DAY_MS = 24 * 60 * 60 * 1000;

  function isRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function clone(value, fallback = null) {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (_) {
      return fallback;
    }
  }

  function serializedBytes(value) {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(serialized).byteLength;
    if (typeof Buffer !== 'undefined') return Buffer.byteLength(serialized, 'utf8');
    return unescape(encodeURIComponent(serialized)).length;
  }

  function dateOrdinal(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
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
    const numeric = Number(timestamp);
    const date = new Date((Number.isFinite(numeric) ? numeric : Date.now()) + 8 * 60 * 60 * 1000);
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
  }

  function historyStartKey(todayKey, historyMonths = DEFAULT_HISTORY_MONTHS) {
    const ordinal = dateOrdinal(todayKey);
    if (ordinal === null) return '';
    const [year, month] = String(todayKey).split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1 - Math.max(0, Math.floor(Number(historyMonths) || 0)), 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-01`;
  }

  function cacheKey(userId) {
    return `shex_calendar_cache_v2:${encodeURIComponent(String(userId || ''))}`;
  }

  function legacyCacheKey(userId) {
    const safe = String(userId || 'local').replace(/[^a-zA-Z0-9_-]/g, '_');
    return `shex_calendar_records_v1:${safe}`;
  }

  function compactDream(value) {
    if (!isRecord(value)) return null;
    const id = String(value.id || '').slice(0, 240);
    if (!id) return null;
    return {
      id,
      name: String(value.name || value.displayName || 'TA').slice(0, 160),
      hasPersona: value.hasPersona === true
    };
  }

  function compactSetting(value) {
    if (!isRecord(value)) return { enabled: false };
    const result = { enabled: value.enabled === true };
    ['enabledAt', 'updatedAt'].forEach((key) => {
      const numeric = Number(value[key]);
      if (Number.isFinite(numeric) && numeric > 0) result[key] = numeric;
    });
    ['nextEligibleDate', 'lastGeneratedDate'].forEach((key) => {
      if (dateOrdinal(value[key]) !== null) result[key] = String(value[key]);
    });
    const intervalDays = Math.floor(Number(value.intervalDays || 0));
    if (intervalDays > 0) result.intervalDays = intervalDays;
    return result;
  }

  function emptyProjection(dreams, settings, dreamIds) {
    const moods = {};
    const plans = {};
    const anniversaries = {};
    dreamIds.forEach((id) => {
      moods[id] = {};
      plans[id] = [];
      anniversaries[id] = [];
    });
    return {
      dreams: clone(dreams, []),
      moods,
      periodActual: [],
      plans,
      anniversaries,
      dreamPlanSettings: clone(settings, {})
    };
  }

  function recordIdentity(value, index = 0) {
    return String(value?.id || `${value?.start || value?.date || 'record'}:${index}`);
  }

  function collectSource(value, todayKey, historyStart) {
    const source = isRecord(value) ? value : {};
    const dreams = (Array.isArray(source.dreams) ? source.dreams : []).map(compactDream).filter(Boolean);
    const dreamIds = new Set(dreams.map((item) => item.id));
    ['moods', 'plans', 'anniversaries', 'dreamPlanSettings'].forEach((group) => {
      Object.keys(isRecord(source[group]) ? source[group] : {}).forEach((id) => dreamIds.add(String(id)));
    });
    const settings = {};
    dreamIds.forEach((id) => { settings[id] = compactSetting(source.dreamPlanSettings?.[id]); });

    const moods = [];
    Object.entries(isRecord(source.moods) ? source.moods : {}).forEach(([dreamId, rows]) => {
      if (!isRecord(rows)) return;
      Object.entries(rows).forEach(([date, row]) => {
        if (dateOrdinal(date) === null || date < historyStart || date > todayKey || !isRecord(row) || !row.mine) return;
        moods.push({ dreamId, date, row: { mine: clone(row.mine, row.mine) } });
      });
    });
    moods.sort((left, right) => right.date.localeCompare(left.date));

    const periods = (Array.isArray(source.periodActual) ? source.periodActual : [])
      .map((record, index) => ({ record: clone(record, null), index }))
      .filter((item) => isRecord(item.record) && dateOrdinal(item.record.start) !== null)
      .sort((left, right) => String(left.record.start).localeCompare(String(right.record.start)));
    const latestPeriodIds = new Set(periods.slice(-MIN_PERIOD_RECORDS).map((item) => recordIdentity(item.record, item.index)));
    const priorityPeriods = periods.filter((item) => latestPeriodIds.has(recordIdentity(item.record, item.index))).reverse();
    const windowPeriods = periods.filter((item) => !latestPeriodIds.has(recordIdentity(item.record, item.index))
      && String(item.record.end || item.record.start) >= historyStart).reverse();

    const primaryPlans = [];
    const secondaryPlans = [];
    Object.entries(isRecord(source.plans) ? source.plans : {}).forEach(([dreamId, rows]) => {
      if (!Array.isArray(rows)) return;
      rows.forEach((record) => {
        if (!isRecord(record) || dateOrdinal(record.date) === null || String(record.date) < historyStart) return;
        const item = { dreamId, record: clone(record, {}) };
        if (String(record.date) >= todayKey || record.done !== true) primaryPlans.push(item);
        else secondaryPlans.push(item);
      });
    });
    primaryPlans.sort((left, right) => {
      const leftFuture = String(left.record.date) >= todayKey;
      const rightFuture = String(right.record.date) >= todayKey;
      if (leftFuture !== rightFuture) return leftFuture ? -1 : 1;
      return leftFuture
        ? String(left.record.date).localeCompare(String(right.record.date))
        : String(right.record.date).localeCompare(String(left.record.date));
    });
    secondaryPlans.sort((left, right) => String(right.record.date).localeCompare(String(left.record.date)));

    const anniversaries = [];
    Object.entries(isRecord(source.anniversaries) ? source.anniversaries : {}).forEach(([dreamId, rows]) => {
      if (!Array.isArray(rows)) return;
      rows.forEach((record) => {
        if (isRecord(record)) anniversaries.push({ dreamId, record: clone(record, {}) });
      });
    });
    anniversaries.sort((left, right) => String(left.record.date || '').localeCompare(String(right.record.date || '')));

    return {
      dreams,
      dreamIds: Array.from(dreamIds),
      settings,
      moods,
      priorityPeriods,
      windowPeriods,
      primaryPlans,
      secondaryPlans,
      anniversaries
    };
  }

  function addArrayCandidate(target, group, item, removers) {
    if (group === 'periodActual') {
      target.periodActual.push(clone(item.record, {}));
      removers.push(() => { target.periodActual.pop(); });
      return;
    }
    target[group][item.dreamId] ||= [];
    target[group][item.dreamId].push(clone(item.record, {}));
    removers.push(() => { target[group][item.dreamId].pop(); });
  }

  function buildEnvelope(calendar, options = {}) {
    const ownerUserId = String(options.ownerUserId || '').trim();
    if (!ownerUserId) return { ok: false, reason: 'owner_required', envelope: null, bytes: 0 };
    const now = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
    const todayKey = options.todayKey || chinaDateKey(now);
    if (dateOrdinal(todayKey) === null) return { ok: false, reason: 'invalid_today', envelope: null, bytes: 0 };
    const historyStart = historyStartKey(todayKey, options.historyMonths);
    const maxBytes = Math.max(1024, Math.floor(Number(options.maxBytes || DEFAULT_MAX_CACHE_BYTES)));
    const source = collectSource(calendar, todayKey, historyStart);
    const projection = emptyProjection(source.dreams, source.settings, source.dreamIds);
    const removers = [];
    const omittedCounts = { periods: 0, anniversaries: 0, plans: 0, moods: 0 };
    const reserveBytes = 2048;
    let estimate = serializedBytes(projection) + reserveBytes;

    const tryAdd = (kind, item, apply) => {
      const estimatedItemBytes = serializedBytes(item) + 96;
      if (estimate + estimatedItemBytes > maxBytes) {
        omittedCounts[kind] += 1;
        return false;
      }
      apply();
      estimate += estimatedItemBytes;
      return true;
    };

    source.priorityPeriods.forEach((item) => tryAdd('periods', item.record,
      () => addArrayCandidate(projection, 'periodActual', item, removers)));
    source.anniversaries.forEach((item) => tryAdd('anniversaries', item.record,
      () => addArrayCandidate(projection, 'anniversaries', item, removers)));
    [...source.primaryPlans, ...source.secondaryPlans].forEach((item) => tryAdd('plans', item.record,
      () => addArrayCandidate(projection, 'plans', item, removers)));
    source.windowPeriods.forEach((item) => tryAdd('periods', item.record,
      () => addArrayCandidate(projection, 'periodActual', item, removers)));
    source.moods.forEach((item) => tryAdd('moods', item.row, () => {
      projection.moods[item.dreamId] ||= {};
      projection.moods[item.dreamId][item.date] = clone(item.row, {});
      removers.push(() => { delete projection.moods[item.dreamId][item.date]; });
    }));

    const makeEnvelope = () => ({
      cacheSchemaVersion: CACHE_SCHEMA_VERSION,
      cachePolicyVersion: CACHE_POLICY_VERSION,
      ownerUserId,
      cachedAt: now,
      sourceRevision: Math.max(0, Math.floor(Number(options.sourceRevision || 0))),
      sourceUpdatedAt: Number(options.sourceUpdatedAt || 0) || null,
      historyStart,
      calendar: projection
    });
    let envelope = makeEnvelope();
    let serialized = JSON.stringify(envelope);
    let bytes = serializedBytes(serialized);
    let removedForExactBudget = 0;
    let usedMinimalProjection = false;
    while (bytes > maxBytes && removers.length) {
      removers.pop()();
      removedForExactBudget += 1;
      envelope = makeEnvelope();
      serialized = JSON.stringify(envelope);
      bytes = serializedBytes(serialized);
    }
    if (bytes > maxBytes) {
      usedMinimalProjection = true;
      const minimal = emptyProjection(source.dreams, source.settings, source.dreamIds);
      envelope = { ...makeEnvelope(), calendar: minimal };
      serialized = JSON.stringify(envelope);
      bytes = serializedBytes(serialized);
    }
    if (bytes > maxBytes) return { ok: false, reason: 'minimum_exceeds_budget', envelope: null, bytes };
    return {
      ok: true,
      envelope,
      serialized,
      bytes,
      truncated: Object.values(omittedCounts).some((count) => count > 0)
        || removedForExactBudget > 0
        || usedMinimalProjection,
      omittedCounts
    };
  }

  function parseEnvelope(serialized, options = {}) {
    let envelope = null;
    try { envelope = JSON.parse(String(serialized || '')); } catch (_) {
      return { ok: false, reason: 'invalid_json', envelope: null };
    }
    if (!isRecord(envelope) || envelope.cacheSchemaVersion !== CACHE_SCHEMA_VERSION || !isRecord(envelope.calendar)) {
      return { ok: false, reason: 'unsupported_schema', envelope: null };
    }
    if (!String(envelope.ownerUserId || '').trim()) return { ok: false, reason: 'owner_required', envelope: null };
    const ownerUserId = String(options.ownerUserId || '').trim();
    if (ownerUserId && envelope.ownerUserId !== ownerUserId) return { ok: false, reason: 'owner_mismatch', envelope: null };
    return { ok: true, envelope: clone(envelope, null) };
  }

  function parseLegacyCalendar(serialized) {
    let value = null;
    try { value = JSON.parse(String(serialized || '')); } catch (_) {
      return { ok: false, reason: 'invalid_json', calendar: null };
    }
    if (!isRecord(value) || Object.prototype.hasOwnProperty.call(value, 'cacheSchemaVersion')) {
      return { ok: false, reason: 'not_legacy_calendar', calendar: null };
    }
    const hasCalendarShape = ['dreams', 'moods', 'periodActual', 'plans', 'anniversaries'].some((key) => Object.prototype.hasOwnProperty.call(value, key));
    if (!hasCalendarShape) return { ok: false, reason: 'not_legacy_calendar', calendar: null };
    return { ok: true, calendar: clone(value, {}) };
  }

  function verifyReadback(serialized, expectedSerialized, options = {}) {
    if (String(serialized || '') !== String(expectedSerialized || '')) return { ok: false, reason: 'serialized_mismatch' };
    const parsed = parseEnvelope(serialized, options);
    if (!parsed.ok) return parsed;
    if (options.sourceRevision !== undefined
      && Number(parsed.envelope.sourceRevision) !== Math.max(0, Math.floor(Number(options.sourceRevision || 0)))) {
      return { ok: false, reason: 'revision_mismatch' };
    }
    return { ok: true, envelope: parsed.envelope };
  }

  return Object.freeze({
    CACHE_POLICY_VERSION,
    CACHE_SCHEMA_VERSION,
    DEFAULT_HISTORY_MONTHS,
    DEFAULT_MAX_CACHE_BYTES,
    MIN_PERIOD_RECORDS,
    buildEnvelope,
    cacheKey,
    chinaDateKey,
    dateOrdinal,
    historyStartKey,
    legacyCacheKey,
    parseEnvelope,
    parseLegacyCalendar,
    serializedBytes,
    verifyReadback
  });
});
