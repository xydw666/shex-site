((root, factory) => {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SHEXCalendarPendingOps = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  'use strict';

  const QUEUE_SCHEMA_VERSION = 1;
  const DEFAULT_MAX_OPERATIONS = 100;
  const DEFAULT_MAX_BYTES = 128 * 1024;
  const DEFAULT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
  const ALLOWED_KINDS = Object.freeze([
    'set_mood',
    'upsert_plan',
    'delete_plan',
    'upsert_anniversary',
    'delete_anniversary',
    'upsert_period',
    'delete_period',
    'set_plan_completion'
  ]);

  function isRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function clone(value, fallback = null) {
    try { return JSON.parse(JSON.stringify(value)); } catch (_) { return fallback; }
  }

  function equal(left, right) {
    try { return JSON.stringify(left) === JSON.stringify(right); } catch (_) { return false; }
  }

  function serializedBytes(value) {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(serialized).byteLength;
    if (typeof Buffer !== 'undefined') return Buffer.byteLength(serialized, 'utf8');
    return unescape(encodeURIComponent(serialized)).length;
  }

  function dateValid(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
    if (!match) return false;
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    return date.getUTCFullYear() === Number(match[1])
      && date.getUTCMonth() + 1 === Number(match[2])
      && date.getUTCDate() === Number(match[3]);
  }

  function queueKey(userId) {
    return `shex_calendar_pending_ops_v1:${encodeURIComponent(String(userId || ''))}`;
  }

  function emptyQueue(ownerUserId, now = Date.now()) {
    return {
      queueSchemaVersion: QUEUE_SCHEMA_VERSION,
      ownerUserId: String(ownerUserId || ''),
      updatedAt: Number(now) || Date.now(),
      lastSequence: 0,
      operations: []
    };
  }

  function normalizeOperation(value, ownerUserId, sequence) {
    if (!isRecord(value) || !ALLOWED_KINDS.includes(String(value.kind || ''))) return null;
    const operationId = String(value.operationId || '').trim().slice(0, 240);
    const owner = String(value.ownerUserId || ownerUserId || '').trim();
    const kind = String(value.kind);
    const createdAt = Number(value.createdAt || 0);
    if (!operationId || !owner || owner !== String(ownerUserId || '').trim() || !Number.isFinite(createdAt) || createdAt <= 0) return null;
    const operation = {
      operationId,
      ownerUserId: owner,
      kind,
      sequence: Math.max(1, Math.floor(Number(sequence || value.sequence || 1))),
      baseRevision: Math.max(0, Math.floor(Number(value.baseRevision || 0))),
      createdAt
    };
    const dreamId = String(value.dreamId || '').trim();
    const recordId = String(value.recordId || value.record?.id || '').trim();
    if (kind === 'set_mood') {
      if (!dreamId || !dateValid(value.date)) return null;
      operation.dreamId = dreamId;
      operation.date = String(value.date);
      operation.mine = value.mine == null || value.mine === '' ? null : clone(value.mine, value.mine);
      return operation;
    }
    if (kind === 'upsert_plan' || kind === 'upsert_anniversary') {
      if (!dreamId || !recordId || !isRecord(value.record)) return null;
      operation.dreamId = dreamId;
      operation.record = clone(value.record, null);
      if (!operation.record) return null;
      operation.record.id = recordId;
      if (isRecord(value.baseRecord)) operation.baseRecord = clone(value.baseRecord, null);
      return operation;
    }
    if (kind === 'delete_plan' || kind === 'delete_anniversary') {
      if (!dreamId || !recordId) return null;
      operation.dreamId = dreamId;
      operation.recordId = recordId;
      return operation;
    }
    if (kind === 'upsert_period') {
      if (!recordId || !isRecord(value.record)) return null;
      operation.record = clone(value.record, null);
      if (!operation.record) return null;
      operation.record.id = recordId;
      if (isRecord(value.baseRecord)) operation.baseRecord = clone(value.baseRecord, null);
      return operation;
    }
    if (kind === 'delete_period') {
      if (!recordId) return null;
      operation.recordId = recordId;
      return operation;
    }
    if (kind === 'set_plan_completion') {
      if (!dreamId || !recordId || typeof value.done !== 'boolean') return null;
      operation.dreamId = dreamId;
      operation.recordId = recordId;
      operation.done = value.done;
      if (value.done) {
        operation.completedBy = String(value.completedBy || 'user');
        const completedAt = Number(value.completedAt || createdAt);
        operation.completedAt = Number.isFinite(completedAt) && completedAt > 0 ? completedAt : createdAt;
      }
      return operation;
    }
    return null;
  }

  function targetKey(operation) {
    if (operation.kind === 'set_mood') return `mood:${operation.dreamId}:${operation.date}`;
    if (operation.kind.includes('plan') && operation.kind !== 'set_plan_completion') return `plan:${operation.dreamId}:${operation.recordId || operation.record?.id}`;
    if (operation.kind === 'set_plan_completion') return `plan-completion:${operation.dreamId}:${operation.recordId}`;
    if (operation.kind.includes('anniversary')) return `anniversary:${operation.dreamId}:${operation.recordId || operation.record?.id}`;
    if (operation.kind.includes('period')) return `period:${operation.recordId || operation.record?.id}`;
    return operation.operationId;
  }

  function normalizeQueue(value, ownerUserId, options = {}) {
    const owner = String(ownerUserId || '').trim();
    if (!owner) return { ok: false, reason: 'owner_required', queue: null };
    if (value == null) {
      return { ok: true, queue: emptyQueue(owner, options.now), removedExpired: 0 };
    }
    if (!isRecord(value) || value.queueSchemaVersion !== QUEUE_SCHEMA_VERSION) {
      return { ok: false, reason: 'unsupported_schema', queue: null };
    }
    if (String(value.ownerUserId || '') !== owner) return { ok: false, reason: 'owner_mismatch', queue: null };
    if (!Array.isArray(value.operations)) return { ok: false, reason: 'invalid_operations_container', queue: null };
    const now = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
    const retentionMs = Math.max(1, Number(options.retentionMs || DEFAULT_RETENTION_MS));
    const rawOperations = Array.isArray(value.operations) ? value.operations : [];
    if (rawOperations.some((operation) => !Number.isInteger(Number(operation?.sequence)) || Number(operation.sequence) < 1)) {
      return { ok: false, reason: 'invalid_sequence', queue: null };
    }
    const normalizedOperations = rawOperations.map((operation) => normalizeOperation(operation, owner, operation?.sequence));
    if (normalizedOperations.some((operation) => !operation)) return { ok: false, reason: 'invalid_operation', queue: null };
    const sequenceSet = new Set(normalizedOperations.map((operation) => operation.sequence));
    const operationIdSet = new Set(normalizedOperations.map((operation) => operation.operationId));
    if (sequenceSet.size !== normalizedOperations.length || operationIdSet.size !== normalizedOperations.length) {
      return { ok: false, reason: 'duplicate_operation_identity', queue: null };
    }
    const operations = normalizedOperations
      .filter((operation) => operation.createdAt >= now - retentionMs)
      .sort((left, right) => left.sequence - right.sequence);
    return {
      ok: true,
      queue: {
        queueSchemaVersion: QUEUE_SCHEMA_VERSION,
        ownerUserId: owner,
        updatedAt: Number(value.updatedAt || now) || now,
        lastSequence: Math.max(
          Math.max(0, Math.floor(Number(value.lastSequence || 0))),
          operations.reduce((max, operation) => Math.max(max, operation.sequence), 0)
        ),
        operations
      },
      removedExpired: Math.max(0, rawOperations.length - operations.length)
    };
  }

  function enqueue(queueValue, operationValue, options = {}) {
    const owner = String(options.ownerUserId || queueValue?.ownerUserId || operationValue?.ownerUserId || '').trim();
    const now = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
    const normalized = normalizeQueue(queueValue, owner, { now, retentionMs: options.retentionMs });
    if (!normalized.ok) return normalized;
    const queue = normalized.queue;
    if (queue.operations.some((item) => item.operationId === String(operationValue?.operationId || ''))) {
      return { ok: true, queue, idempotent: true, coalesced: false };
    }
    const nextSequence = Math.max(0, Math.floor(Number(queue.lastSequence || 0))) + 1;
    const operation = normalizeOperation({ ...operationValue, createdAt: operationValue?.createdAt || now }, owner, nextSequence);
    if (!operation) return { ok: false, reason: 'invalid_operation', queue };
    const key = targetKey(operation);
    const operations = queue.operations.filter((item) => targetKey(item) !== key);
    const coalesced = operations.length !== queue.operations.length;
    operations.push(operation);
    operations.sort((left, right) => left.sequence - right.sequence);
    const nextQueue = { ...queue, updatedAt: now, lastSequence: nextSequence, operations };
    const maxOperations = Math.max(1, Math.floor(Number(options.maxOperations || DEFAULT_MAX_OPERATIONS)));
    if (operations.length > maxOperations) return { ok: false, reason: 'operation_limit', queue };
    const maxBytes = Math.max(512, Math.floor(Number(options.maxBytes || DEFAULT_MAX_BYTES)));
    const bytes = serializedBytes(nextQueue);
    if (bytes > maxBytes) return { ok: false, reason: 'byte_limit', queue, bytes };
    return { ok: true, queue: nextQueue, operation, idempotent: false, coalesced, bytes };
  }

  function acknowledge(queueValue, throughSequence, options = {}) {
    const owner = String(options.ownerUserId || queueValue?.ownerUserId || '').trim();
    const now = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
    const normalized = normalizeQueue(queueValue, owner, { now, retentionMs: options.retentionMs });
    if (!normalized.ok) return normalized;
    const sequence = Math.max(0, Math.floor(Number(throughSequence || 0)));
    const operations = normalized.queue.operations.filter((item) => item.sequence > sequence);
    return {
      ok: true,
      removed: normalized.queue.operations.length - operations.length,
      queue: { ...normalized.queue, updatedAt: now, operations }
    };
  }

  function applyChangedFields(currentValue, baseValue, desiredValue) {
    const current = isRecord(currentValue) ? clone(currentValue, {}) : {};
    const base = isRecord(baseValue) ? baseValue : {};
    const desired = isRecord(desiredValue) ? desiredValue : {};
    const keys = new Set([...Object.keys(base), ...Object.keys(desired)]);
    keys.forEach((key) => {
      if (equal(base[key], desired[key])) return;
      if (Object.prototype.hasOwnProperty.call(desired, key)) current[key] = clone(desired[key], desired[key]);
      else delete current[key];
    });
    return current;
  }

  function replay(calendarValue, operationsValue, options = {}) {
    const originalCalendar = clone(isRecord(calendarValue) ? calendarValue : {}, {});
    const calendar = clone(originalCalendar, {});
    calendar.moods = isRecord(calendar.moods) ? calendar.moods : {};
    calendar.plans = isRecord(calendar.plans) ? calendar.plans : {};
    calendar.anniversaries = isRecord(calendar.anniversaries) ? calendar.anniversaries : {};
    calendar.periodActual = Array.isArray(calendar.periodActual) ? calendar.periodActual : [];
    const owner = String(options.ownerUserId || operationsValue?.ownerUserId || '').trim();
    if (!owner) return { ok: false, reason: 'owner_required', calendar: originalCalendar, appliedOperationIds: [], appliedCount: 0 };
    const sourceOperations = Array.isArray(operationsValue) ? operationsValue : operationsValue?.operations;
    const normalizedOperations = (Array.isArray(sourceOperations) ? sourceOperations : [])
      .map((operation) => normalizeOperation(operation, owner, operation?.sequence));
    if (normalizedOperations.some((operation) => !operation)) {
      return { ok: false, reason: 'invalid_operation', calendar: originalCalendar, appliedOperationIds: [], appliedCount: 0 };
    }
    const replaySequences = new Set(normalizedOperations.map((operation) => operation.sequence));
    const replayIds = new Set(normalizedOperations.map((operation) => operation.operationId));
    if (replaySequences.size !== normalizedOperations.length || replayIds.size !== normalizedOperations.length) {
      return { ok: false, reason: 'duplicate_operation_identity', calendar: originalCalendar, appliedOperationIds: [], appliedCount: 0 };
    }
    const operations = normalizedOperations
      .sort((left, right) => left.sequence - right.sequence);
    const appliedOperationIds = [];

    const upsert = (rows, operation) => {
      const id = String(operation.record?.id || '');
      const index = rows.findIndex((item) => String(item?.id || '') === id);
      if (index < 0) rows.push(clone(operation.record, {}));
      else if (operation.baseRecord) rows[index] = applyChangedFields(rows[index], operation.baseRecord, operation.record);
    };

    operations.forEach((operation) => {
      if (operation.kind === 'set_mood') {
        calendar.moods[operation.dreamId] ||= {};
        calendar.moods[operation.dreamId][operation.date] ||= {};
        if (operation.mine == null) delete calendar.moods[operation.dreamId][operation.date].mine;
        else calendar.moods[operation.dreamId][operation.date].mine = clone(operation.mine, operation.mine);
        if (!Object.keys(calendar.moods[operation.dreamId][operation.date]).length) delete calendar.moods[operation.dreamId][operation.date];
      } else if (operation.kind === 'upsert_plan') {
        calendar.plans[operation.dreamId] ||= [];
        upsert(calendar.plans[operation.dreamId], operation);
      } else if (operation.kind === 'delete_plan') {
        calendar.plans[operation.dreamId] = (calendar.plans[operation.dreamId] || []).filter((item) => String(item?.id || '') !== operation.recordId);
      } else if (operation.kind === 'upsert_anniversary') {
        calendar.anniversaries[operation.dreamId] ||= [];
        upsert(calendar.anniversaries[operation.dreamId], operation);
      } else if (operation.kind === 'delete_anniversary') {
        calendar.anniversaries[operation.dreamId] = (calendar.anniversaries[operation.dreamId] || []).filter((item) => String(item?.id || '') !== operation.recordId);
      } else if (operation.kind === 'upsert_period') {
        upsert(calendar.periodActual, operation);
      } else if (operation.kind === 'delete_period') {
        calendar.periodActual = calendar.periodActual.filter((item) => String(item?.id || '') !== operation.recordId);
      } else if (operation.kind === 'set_plan_completion') {
        const item = (calendar.plans[operation.dreamId] || []).find((plan) => String(plan?.id || '') === operation.recordId);
        if (item) {
          item.done = operation.done;
          if (operation.done) {
            item.completedBy = operation.completedBy;
            item.completedAt = operation.completedAt;
          } else {
            delete item.completedBy;
            delete item.completedAt;
          }
        }
      }
      appliedOperationIds.push(operation.operationId);
    });
    return { ok: true, calendar, appliedOperationIds, appliedCount: appliedOperationIds.length };
  }

  function parseQueue(serialized, ownerUserId, options = {}) {
    let value = null;
    try { value = JSON.parse(String(serialized || '')); } catch (_) {
      return { ok: false, reason: 'invalid_json', queue: null };
    }
    const normalized = normalizeQueue(value, ownerUserId, options);
    if (!normalized.ok) return normalized;
    const maxBytes = Math.max(512, Math.floor(Number(options.maxBytes || DEFAULT_MAX_BYTES)));
    if (serializedBytes(normalized.queue) > maxBytes) return { ok: false, reason: 'byte_limit', queue: null };
    return normalized;
  }

  return Object.freeze({
    ALLOWED_KINDS,
    DEFAULT_MAX_BYTES,
    DEFAULT_MAX_OPERATIONS,
    DEFAULT_RETENTION_MS,
    QUEUE_SCHEMA_VERSION,
    acknowledge,
    applyChangedFields,
    emptyQueue,
    enqueue,
    normalizeOperation,
    normalizeQueue,
    parseQueue,
    queueKey,
    replay,
    serializedBytes,
    targetKey
  });
});
