(() => {
  "use strict";

  const RETRY_DELAYS_MS = [2000, 5000, 10000, 30000, 60000];
  const SYNC_RETRY_DELAYS_MS = [2000, 5000];
  const SYNC_REASONS = new Set([
    "chat_module_enter",
    "conversation_open",
    "manual_sync",
    "mutation_reconcile",
    "calendar_mood_hydrate",
    "cursor_recovery"
  ]);
  const DEFAULT_HYDRATION_DEDUPE_MS = 60 * 1000;
  const QUEUE_PREFIX = "shex_chat_sync_queue_v1:";
  const CURSOR_PREFIX = "shex_chat_sync_cursor_v1:";
  const RECOVERY_PREFIX = "shex_chat_sync_recovery_v1:";
  const MAX_QUEUE_ITEMS = 2000;
  const LOCAL_PREVIEW_SYNC_DISABLED = /^(localhost|127\.0\.0\.1)$/i.test(String(window.location?.hostname || ""))
    && new URLSearchParams(String(window.location?.search || "")).get("previewChatSync") === "0";

  let queue = [];
  let running = false;
  let flushing = false;
  let pulling = false;
  let applyingRemote = false;
  let pullActive = false;
  let retryTimer = 0;
  let inFlightOperationId = "";
  let activeUserId = "";
  let pullRecovery = null;
  let syncRequestPromise = null;
  let activeSyncRequestKey = "";
  let pendingSyncRequest = null;
  let lastSyncAt = 0;
  let lastSyncReason = "";
  let lastSyncFailure = null;
  let historyRequestSequence = 0;
  const historyState = new Map();
  const successfulHydrations = new Map();
  const remoteVersions = new Map();
  const remoteTerminalStates = new Map();
  const calendarMoodHydratedUsers = new Set();
  const calendarMoodExplicitHydrationUsers = new Set();

  const auth = () => window.SHEXAuth;
  const session = () => auth()?.current?.() || null;
  const notify = (message, type = "error") => auth()?.notify?.(message, type);

  function storageKey(prefix, userId = activeUserId || session()?.userId || "guest") {
    return `${prefix}${String(userId || "guest")}`;
  }

  function readJson(key, fallback) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || "");
      return parsed ?? fallback;
    } catch (_) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (_) {
      return false;
    }
  }

  function loadQueue() {
    const stored = readJson(storageKey(QUEUE_PREFIX), []);
    queue = Array.isArray(stored)
      ? stored.slice(-MAX_QUEUE_ITEMS).map((item) => ({
          ...item,
          operationId: String(item.operationId || createOperationId()),
          attempts: 0,
          nextAttemptAt: 0,
          lastError: ""
        }))
      : [];
    saveQueue();
  }

  function createOperationId() {
    return `chatop_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
  }

  function saveQueue() {
    return writeJson(storageKey(QUEUE_PREFIX), queue.slice(-MAX_QUEUE_ITEMS));
  }

  function cursor() {
    const value = Number(localStorage.getItem(storageKey(CURSOR_PREFIX)) || 0);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  }

  function setCursor(value) {
    const next = Math.max(cursor(), Math.floor(Number(value || 0)) || 0);
    localStorage.setItem(storageKey(CURSOR_PREFIX), String(next));
    return next;
  }

  function loadRecoveryState() {
    const stored = readJson(storageKey(RECOVERY_PREFIX), null);
    pullRecovery = stored?.status === "cursor_gap" ? stored : null;
    return pullRecovery;
  }

  function blockPullForCursorGap(result = {}) {
    pullRecovery = {
      status: "cursor_gap",
      detectedAt: Date.now(),
      cursor: cursor(),
      earliestAvailableVersion: Number(result.earliestAvailableVersion || 0),
      latestVersion: Number(result.latestVersion || 0),
      expectedVersion: Number(result.expectedVersion || 0),
      firstAvailableVersion: Number(result.firstAvailableVersion || 0),
      gapReason: String(result.gapReason || "cursor_gap")
    };
    writeJson(storageKey(RECOVERY_PREFIX), pullRecovery);
    dispatchStatus({ status: "cursor_gap", recovery: { ...pullRecovery } });
    return { ok: false, skipped: false, blocked: true, cursorGap: true, changeCount: 0, hasMore: false, recovery: { ...pullRecovery } };
  }

  function operationIdentity(operation = {}) {
    if (operation.action === "clearConversation") {
      return `clear:${operation.conversationType}:${operation.conversationId}`;
    }
    return `message:${operation.conversationType}:${operation.conversationId}:${operation.messageId}`;
  }

  function dispatchStatus(detail) {
    document.dispatchEvent(new CustomEvent("shex:chat-sync-status", { detail }));
  }

  function calendarMoodActivity() {
    return window.SHEXCalendarMoodActivity;
  }

  function applyCalendarMoodEnvelope(result = {}) {
    if (!Object.prototype.hasOwnProperty.call(result, "calendarMoodMonths")) return false;
    const activity = calendarMoodActivity();
    if (!activeUserId || !activity?.mergeAndWrite) return false;
    activity.mergeAndWrite(activeUserId, result.calendarMoodMonths || {});
    activity.markCloudHydrationComplete?.(activeUserId);
    calendarMoodHydratedUsers.add(activeUserId);
    return true;
  }

  function recordCalendarMoodChanges(changes = []) {
    const activity = calendarMoodActivity();
    if (!activeUserId || !activity?.recordMessages) return;
    changes.forEach((change) => {
      const message = change?.kind === "message" ? change.message : null;
      if (!message || message.conversationType !== "single") return;
      activity.recordMessages(activeUserId, "single", message.conversationId, [{
        ...(message.payload || {}),
        sentAt: message.sentAt
      }], { dispatch: false });
    });
  }

  function sanitizePayload(value, depth = 0) {
    if (depth > 12) return null;
    if (typeof value === "string") return value;
    if (Array.isArray(value)) return value.map((item) => sanitizePayload(item, depth + 1));
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitizePayload(item, depth + 1)]));
  }

  function containsInlineMedia(value, depth = 0) {
    if (depth > 12) return false;
    if (typeof value === "string") return /^\s*data:(?:image|audio|video)\//i.test(value);
    if (Array.isArray(value)) return value.some((item) => containsInlineMedia(item, depth + 1));
    if (!value || typeof value !== "object") return false;
    return Object.values(value).some((item) => containsInlineMedia(item, depth + 1));
  }

  function enqueue(operation = {}) {
    const current = session();
    if (!current?.userId) return false;
    if (current.userId !== activeUserId) {
      activeUserId = current.userId;
      loadQueue();
    }
    const next = {
      ...operation,
      operationId: createOperationId(),
      queuedAt: Date.now(),
      attempts: 0,
      nextAttemptAt: 0,
      lastError: ""
    };
    const identity = operationIdentity(next);
    const terminalPending = queue.find((item) => operationIdentity(item) === identity && ["deleteMessage", "revokeMessage"].includes(item.action));
    if (terminalPending?.action === "deleteMessage") return true;
    if (terminalPending?.action === "revokeMessage" && next.action === "upsertMessage") return true;
    const index = queue.findIndex((item) => item.operationId !== inFlightOperationId && operationIdentity(item) === identity);
    if (index >= 0) {
      const previous = queue[index];
      // A local delete must dominate any pending upsert/revoke for the same message.
      if (previous.action === "deleteMessage" && next.action !== "deleteMessage") return true;
      queue[index] = next;
    } else {
      queue.push(next);
    }
    queue = queue.slice(-MAX_QUEUE_ITEMS);
    const persisted = saveQueue();
    if (!persisted) {
      dispatchStatus({ status: "storage-error", operation: next });
      notify("聊天消息已进入本次页面的发送队列，但浏览器无法持久保存；请勿刷新页面，并检查隐私模式或存储空间。", "error");
    }
    dispatchStatus({ status: "pending", operation: next });
    void flush();
    return true;
  }

  function enqueueUpsert(conversationType, conversationId, payload) {
    if (containsInlineMedia(payload)) {
      const operation = {
        action: "upsertMessage",
        conversationType,
        conversationId,
        messageId: String(payload?.id ?? ""),
        payload
      };
      const error = new Error("图片或表情包尚未上传到云端");
      error.code = "INLINE_MEDIA_NOT_UPLOADED";
      dispatchStatus({ status: "media-upload-required", operation, error });
      notify("图片或表情包发送失败，请点击重试");
      return false;
    }
    const safePayload = sanitizePayload(payload);
    const activity = calendarMoodActivity();
    const currentUserId = String(session()?.userId || '');
    const calendarMoodMonthsSeed = currentUserId && activity?.needsCloudSeed?.(currentUserId)
      ? activity.read(currentUserId)
      : null;
    return enqueue({
      action: safePayload?.revoked ? "revokeMessage" : "upsertMessage",
      conversationType,
      conversationId,
      messageId: String(safePayload?.id ?? ""),
      payload: safePayload,
      sentAt: Number(safePayload?.time || safePayload?.createdAt || safePayload?.timestamp || Date.now()),
      clientUpdatedAt: Number(safePayload?.updatedAt || safePayload?.time || safePayload?.createdAt || Date.now()),
      ...(calendarMoodMonthsSeed !== null ? { calendarMoodMonthsSeed } : {})
    });
  }

  function enqueueDelete(conversationType, conversationId, messageId, deletedAt = Date.now()) {
    return enqueue({
      action: "deleteMessage",
      conversationType,
      conversationId,
      messageId: String(messageId ?? ""),
      payload: { id: messageId },
      sentAt: deletedAt,
      clientUpdatedAt: deletedAt
    });
  }

  function enqueueClear(conversationType, conversationId, cleanupWatermark) {
    return enqueue({ action: "clearConversation", conversationType, conversationId, cleanupWatermark });
  }

  function mutationRequest(operation) {
    return {
      ...operation,
      cursor: cursor(),
      limit: 200,
      includeChangesSinceCursor: true,
      includeCalendarMoodMonths: !calendarMoodHydratedUsers.has(activeUserId)
    };
  }

  function applyDirectMutationResult(result, operation) {
    if (result?.message) {
      return applyChanges([{
        kind: "message",
        operation: operation.action,
        syncVersion: result.syncVersion,
        message: result.message
      }]);
    }
    if (result?.conversation) {
      return applyChanges([{
        kind: "conversation",
        operation: operation.action,
        syncVersion: result.syncVersion,
        conversation: result.conversation
      }]);
    }
    return 0;
  }

  function applyMutationResult(result, operation) {
    applyCalendarMoodEnvelope(result);
    const envelopeValid = result?.changesIncluded === true
      && Array.isArray(result.changes)
      && Number.isFinite(Number(result.cursor))
      && Number(result.cursor) >= 0;
    if (!envelopeValid) {
      applyDirectMutationResult(result, operation);
      return { combined: false, needsPull: true };
    }
    if (result.cursorGap) {
      applyDirectMutationResult(result, operation);
      blockPullForCursorGap(result);
      return { combined: true, needsPull: false, cursorGap: true };
    }
    applyChanges(result.changes);
    setCursor(result.cursor);
    return { combined: true, needsPull: Boolean(result.hasMore) };
  }

  async function commitTerminalMutation(action, conversationType, conversationId, message) {
    if (conversationType === 'world_run' && message?.role === 'ta'
      && !message?.authoritativeReplyId && !message?.terminalMessageId
      && String(message?.id || '').includes(':reply:')) {
      throw new Error("这条回复仍在生成，请完成后再撤回或删除");
    }
    const caller = auth()?.callChatSync;
    if (typeof caller !== "function") throw new Error("聊天同步服务暂时不可用");
    const messageId = conversationType === 'world_run'
      ? String(message?.terminalMessageId || (message?.authoritativeReplyId && Number.isInteger(Number(message.replyIndex))
        ? `${message.authoritativeReplyId}:${Number(message.replyIndex) + 1}` : message?.id) || '') : String(message?.id ?? "");
    const updatedAt = Date.now();
    const operation = {
      action,
      conversationType,
      conversationId,
      messageId,
      payload: action === "revokeMessage"
        ? sanitizePayload({ ...message, id:messageId })
        : { id: messageId },
      sentAt: Number(message?.time || message?.createdAt || updatedAt),
      clientUpdatedAt: updatedAt
    };
    dispatchStatus({ status: "pending-terminal", operation });
    try {
      const result = await caller(action, mutationRequest(operation));
      const syncResult = applyMutationResult(result, operation);
      if (syncResult.needsPull) requestSync("mutation_reconcile");
      dispatchStatus({ status: "synced", operation, result });
      return result;
    } catch (error) {
      dispatchStatus({
        status: error?.code === "ARCHIVED_MESSAGE_READ_ONLY" ? "archived-readonly" : "failed-terminal",
        operation,
        error
      });
      throw error;
    }
  }

  async function flush() {
    if (!running || flushing || !queue.length || !navigator.onLine) return false;
    const caller = auth()?.callChatSync;
    if (typeof caller !== "function") return false;
    flushing = true;
    clearTimeout(retryTimer);
    try {
      const attemptedThisRun = new Set();
      let needsPullAfterFlush = false;
      while (running && queue.length && navigator.onLine) {
        const now = Date.now();
        const operation = queue.find((item) => (
          !attemptedThisRun.has(item.operationId)
          && Number(item.attempts || 0) < RETRY_DELAYS_MS.length
          && Number(item.nextAttemptAt || 0) <= now
        ));
        if (!operation) break;
        attemptedThisRun.add(operation.operationId);
        inFlightOperationId = operation.operationId;
        try {
          const result = await caller(operation.action, mutationRequest(operation));
          if (result?.calendarMoodSeedAccepted === true && Object.prototype.hasOwnProperty.call(operation, 'calendarMoodMonthsSeed')) {
            calendarMoodActivity()?.markCloudSeedComplete?.(activeUserId);
          }
          queue = queue.filter((item) => item.operationId !== operation.operationId);
          saveQueue();
          const syncResult = applyMutationResult(result, operation);
          needsPullAfterFlush = needsPullAfterFlush || syncResult.needsPull;
          dispatchStatus({ status: "synced", operation, result });
        } catch (error) {
          operation.attempts = Number(operation.attempts || 0) + 1;
          operation.lastError = String(error?.message || error || "chat sync failed");
          operation.nextAttemptAt = operation.attempts >= RETRY_DELAYS_MS.length
            ? 0
            : Date.now() + RETRY_DELAYS_MS[operation.attempts - 1];
          saveQueue();
          dispatchStatus({ status: operation.attempts >= RETRY_DELAYS_MS.length ? "failed" : "retrying", operation, error });
        } finally {
          inFlightOperationId = "";
        }
      }
      if (needsPullAfterFlush) requestSync("mutation_reconcile");
      return !queue.length;
    } finally {
      flushing = false;
      scheduleNextRetry();
    }
  }

  function scheduleNextRetry() {
    clearTimeout(retryTimer);
    if (!running || !navigator.onLine) return;
    const eligible = queue
      .filter((item) => Number(item.attempts || 0) < RETRY_DELAYS_MS.length && Number(item.nextAttemptAt || 0) > 0)
      .map((item) => Number(item.nextAttemptAt))
      .sort((left, right) => left - right)[0];
    if (!eligible) return;
    retryTimer = window.setTimeout(() => void flush(), Math.max(0, eligible - Date.now()));
  }

  function applyChanges(changes = []) {
    if (!Array.isArray(changes) || !changes.length) return 0;
    const freshChanges = changes.filter((change) => {
      const record = change?.kind === "message" ? change.message : change?.conversation;
      if (!record) return false;
      const key = change.kind === "message"
        ? `message:${record.conversationType}:${record.conversationId}:${record.messageId ?? record.payload?.id ?? ""}`
        : `conversation:${record.conversationType}:${record.conversationId}`;
      const incomingVersion = Number(record.syncVersion || change.syncVersion || 0);
      const knownVersion = Number(remoteVersions.get(key) || 0);
      const terminalState = remoteTerminalStates.get(key) || "";
      const incomingDeleted = Number(record.deletedAt || 0) > 0;
      const incomingRevoked = Boolean(record.payload?.revoked);
      if (terminalState === "delete" && !incomingDeleted) return false;
      if (terminalState === "revoke" && !incomingDeleted && !incomingRevoked) return false;
      if (incomingVersion > 0 && knownVersion > 0 && incomingVersion < knownVersion) return false;
      if (incomingVersion > 0) remoteVersions.set(key, Math.max(knownVersion, incomingVersion));
      if (incomingDeleted) remoteTerminalStates.set(key, "delete");
      else if (incomingRevoked) remoteTerminalStates.set(key, "revoke");
      return true;
    });
    if (!freshChanges.length) return 0;
    recordCalendarMoodChanges(freshChanges);
    applyingRemote = true;
    try {
      document.dispatchEvent(new CustomEvent("shex:chat-sync-changes", { detail: { changes: freshChanges } }));
    } finally {
      applyingRemote = false;
    }
    return freshChanges.length;
  }

  async function applyChangesAndWaitForPersistence(changes = []) {
    const appliedCount = applyChanges(changes);
    const waiter = window.SHEXWaitForXMessagePersistence;
    if (typeof waiter !== "function") return { ok: true, appliedCount, storage: "untracked" };
    const persistence = await waiter();
    if (persistence?.ok === false) {
      const error = new Error("更早的聊天记录未能安全保存到本机");
      error.code = String(persistence.code || "CHAT_LOCAL_STORAGE_WRITE_FAILED");
      error.storage = String(persistence.storage || "unknown");
      throw error;
    }
    return { ok: true, appliedCount, storage: String(persistence?.storage || "unknown") };
  }

  async function pull() {
    if (pullRecovery) {
      return { ok: false, skipped: true, blocked: true, cursorGap: true, changeCount: 0, hasMore: false, recovery: { ...pullRecovery } };
    }
    if (!running || pulling || !navigator.onLine || typeof auth()?.callChatSync !== "function") {
      return { ok: false, skipped: true, changeCount: 0, hasMore: false };
    }
    pulling = true;
    try {
      let hasMore = true;
      let rounds = 0;
      let changeCount = 0;
      while (hasMore && rounds < 20) {
        const includeCalendarMoodMonths = !calendarMoodHydratedUsers.has(activeUserId);
        const result = await auth().callChatSync("pullChanges", {
          cursor: cursor(),
          limit: 200,
          includeCalendarMoodMonths
        });
        applyCalendarMoodEnvelope(result);
        if (result?.cursorGap) return blockPullForCursorGap(result);
        const changes = Array.isArray(result.changes) ? result.changes : [];
        changeCount += changes.length;
        applyChanges(changes);
        setCursor(result.cursor);
        hasMore = Boolean(result.hasMore);
        rounds += 1;
      }
      return { ok: true, skipped: false, changeCount, hasMore, rounds };
    } catch (error) {
      dispatchStatus({ status: "pull_failed", error });
      return { ok: false, skipped: false, changeCount: 0, hasMore: false, error };
    } finally {
      pulling = false;
    }
  }

  function historyStateSnapshot(conversationType, conversationId) {
    const state = historyState.get(`${conversationType}:${conversationId}`);
    return state ? { ...state } : null;
  }

  async function loadConversationHistoryPage(conversationType, conversationId, requestBefore = "") {
    const historyKey = `${conversationType}:${conversationId}`;
    const baseBefore = String(requestBefore || "");
    const requestId = ++historyRequestSequence;
    const result = await auth().callChatSync("listConversation", {
      conversationType,
      conversationId,
      before: baseBefore,
      limit: 100
    });
    const changes = [];
    (result.messages || []).forEach((message) => changes.push({
      kind: "message",
      operation: message.deletedAt ? "delete" : "hydrate",
      message
    }));
    if (result.conversation) changes.push({ kind: "conversation", operation: "hydrate", conversation: result.conversation });
    const ordered = changes.sort((left, right) => {
      if (left.kind !== right.kind) return left.kind === "message" ? -1 : 1;
      return Number(left.message?.sentAt || 0) - Number(right.message?.sentAt || 0);
    });

    const persistence = await applyChangesAndWaitForPersistence(ordered);
    const nextBefore = String(result.nextBefore || "");
    const hasMore = Boolean(result.hasMore && nextBefore);
    const currentState = historyState.get(historyKey);
    const cursorStillMatches = currentState
      ? String(currentState.before || "") === baseBefore
      : baseBefore === "";
    if (cursorStillMatches) {
      historyState.set(historyKey, {
        before: nextBefore,
        hasMore,
        exhausted: !hasMore,
        committedRequestId: requestId,
        updatedAt: Date.now()
      });
    }
    const pageResult = {
      ok: true,
      requestId,
      baseBefore,
      nextBefore,
      hasMore,
      exhausted: !hasMore,
      stale: !cursorStillMatches,
      messageCount: Array.isArray(result.messages) ? result.messages.length : 0,
      appliedCount: persistence.appliedCount
    };
    dispatchStatus({
      status: "history_loaded",
      conversationType,
      conversationId,
      requestId,
      baseBefore,
      hasMore,
      stale: pageResult.stale,
      messageCount: pageResult.messageCount
    });
    return pageResult;
  }

  async function loadObservedConversationHistoryPage(conversationType, conversationId, requestBefore = "") {
    try {
      return await loadConversationHistoryPage(conversationType, conversationId, requestBefore);
    } catch (error) {
      dispatchStatus({
        status: "history_failed",
        conversationType,
        conversationId,
        baseBefore: String(requestBefore || ""),
        code: String(error?.code || error?.name || "CHAT_HISTORY_LOAD_FAILED")
      });
      throw error;
    }
  }

  async function hydrateConversation(conversationType, conversationId, options = {}) {
    if (LOCAL_PREVIEW_SYNC_DISABLED) return true;
    if (typeof auth()?.callChatSync !== "function") return false;
    let before = String(options.before || "");
    let pages = 0;
    const maxPages = Math.max(1, Math.min(20, Number(options.maxPages || 5)));
    const historyKey = `${conversationType}:${conversationId}`;
    const requestedDedupeWindowMs = options.dedupeWindowMs == null
      ? DEFAULT_HYDRATION_DEDUPE_MS
      : Number(options.dedupeWindowMs);
    const dedupeWindowMs = Number.isFinite(requestedDedupeWindowMs)
      ? Math.max(0, Math.min(5 * 60 * 1000, requestedDedupeWindowMs))
      : 0;
    const hydrationKey = `${String(activeUserId || session()?.userId || "")}:${historyKey}`;
    const lastSuccessfulHydrationAt = Number(successfulHydrations.get(hydrationKey) || 0);
    if (!before && dedupeWindowMs > 0 && Date.now() - lastSuccessfulHydrationAt < dedupeWindowMs) return true;
    let lastPageResult = null;
    do {
      lastPageResult = await loadObservedConversationHistoryPage(conversationType, conversationId, before);
      before = String(lastPageResult.nextBefore || "");
      pages += 1;
      if (!lastPageResult.hasMore || lastPageResult.stale) break;
    } while (before && pages < maxPages);
    if (!String(options.before || "") && dedupeWindowMs > 0) {
      successfulHydrations.set(hydrationKey, Date.now());
      for (const [key, completedAt] of successfulHydrations) {
        if (Date.now() - Number(completedAt || 0) >= 5 * 60 * 1000) successfulHydrations.delete(key);
      }
    }
    return true;
  }

  async function hydrateCalendarMoodMonths() {
    const activity = calendarMoodActivity();
    if (!activeUserId || !activity?.needsCloudHydration?.(activeUserId)) return true;
    if (calendarMoodExplicitHydrationUsers.has(activeUserId)) return false;
    calendarMoodExplicitHydrationUsers.add(activeUserId);
    const result = await requestSync("calendar_mood_hydrate");
    return Boolean(result?.ok || !activity.needsCloudHydration(activeUserId));
  }

  async function loadOlderConversation(conversationType, conversationId) {
    const state = historyState.get(`${conversationType}:${conversationId}`);
    if (!state?.hasMore || !state.before) {
      return { ok: true, skipped: true, exhausted: true, hasMore: false, baseBefore: String(state?.before || "") };
    }
    return loadObservedConversationHistoryPage(conversationType, conversationId, state.before);
  }

  function retryFailed() {
    queue.forEach((item) => {
      item.attempts = 0;
      item.nextAttemptAt = 0;
      item.lastError = "";
      dispatchStatus({ status: "retrying", operation: item });
    });
    saveQueue();
    clearTimeout(retryTimer);
    return flush();
  }

  function pendingAction(conversationType, conversationId, messageId) {
    const identity = `message:${conversationType}:${conversationId}:${String(messageId ?? "")}`;
    const actions = queue.filter((item) => operationIdentity(item) === identity).map((item) => item.action);
    if (actions.includes("deleteMessage")) return "deleteMessage";
    if (actions.includes("revokeMessage")) return "revokeMessage";
    return actions[actions.length - 1] || "";
  }

  function waitForSyncRetry(delayMs) {
    return new Promise((resolve) => window.setTimeout(resolve, Math.max(0, Number(delayMs || 0))));
  }

  function syncRequestKey(reason, options = {}) {
    return [
      String(reason || ""),
      String(options.conversationType || ""),
      String(options.conversationId || "")
    ].join(":");
  }

  function syncFailure(kind, reason, options, error) {
    lastSyncFailure = {
      kind,
      reason,
      conversationType: String(options?.conversationType || ""),
      conversationId: String(options?.conversationId || ""),
      code: String(error?.code || error?.name || "CHAT_SYNC_FAILED")
    };
    return lastSyncFailure;
  }

  async function retryBounded(operation, detail = {}) {
    let lastResult = null;
    for (let attempt = 0; attempt <= SYNC_RETRY_DELAYS_MS.length; attempt += 1) {
      try {
        const result = await operation();
        if (result?.ok === false && result?.error) throw result.error;
        return result;
      } catch (error) {
        lastResult = error;
        if (attempt >= SYNC_RETRY_DELAYS_MS.length || navigator.onLine === false) throw error;
        dispatchStatus({
          status: detail.retryStatus || "sync_retrying",
          reason: detail.reason,
          conversationType: detail.conversationType,
          conversationId: detail.conversationId,
          attempt: attempt + 1,
          code: String(error?.code || error?.name || "CHAT_SYNC_FAILED")
        });
        await waitForSyncRetry(SYNC_RETRY_DELAYS_MS[attempt]);
      }
    }
    throw lastResult;
  }

  async function performAccountSync(reason) {
    const first = await retryBounded(() => pull(), { reason, retryStatus: "pull_retrying" });
    if (!first?.ok || first?.blocked || !first?.hasMore) return first;
    const second = await retryBounded(() => pull(), { reason, retryStatus: "pull_retrying" });
    const combined = {
      ...second,
      changeCount: Number(first.changeCount || 0) + Number(second?.changeCount || 0),
      rounds: Number(first.rounds || 0) + Number(second?.rounds || 0)
    };
    if (combined.hasMore) {
      dispatchStatus({ status: "sync_more_available", reason, changeCount: combined.changeCount, rounds: combined.rounds });
    }
    return combined;
  }

  async function performSyncRequest(request) {
    const reason = request.reason;
    const options = request.options || {};
    if (reason === "cursor_recovery") {
      dispatchStatus({ status: "cursor_gap", recovery: pullRecovery ? { ...pullRecovery } : null });
      return { ok: false, skipped: true, blocked: true, cursorGap: Boolean(pullRecovery), recovery: pullRecovery ? { ...pullRecovery } : null };
    }
    if (reason === "manual_sync") {
      if (pullRecovery) return { ok: false, skipped: true, blocked: true, cursorGap: true, recovery: { ...pullRecovery } };
      if (queue.some((item) => Number(item.attempts || 0) > 0)) {
        const recovered = await retryFailed();
        return { ok: recovered === true, skipped: false, retriedQueue: true };
      }
      if (lastSyncFailure?.kind === "history" && lastSyncFailure.conversationType && lastSyncFailure.conversationId) {
        return performSyncRequest({
          reason: "conversation_open",
          options: {
            conversationType: lastSyncFailure.conversationType,
            conversationId: lastSyncFailure.conversationId
          }
        });
      }
      return performAccountSync(reason);
    }
    if (reason === "conversation_open") {
      const conversationType = String(options.conversationType || "");
      const conversationId = String(options.conversationId || "");
      if (!(conversationType === "single" || conversationType === "group") || !conversationId) {
        return { ok: false, skipped: true, code: "CHAT_CONVERSATION_REQUIRED" };
      }
      try {
        await retryBounded(
          () => hydrateConversation(conversationType, conversationId, { maxPages: 1, dedupeWindowMs: 0 }),
          { reason, retryStatus: "history_retrying", conversationType, conversationId }
        );
        lastSyncFailure = null;
        dispatchStatus({ status: "history_ready", reason, conversationType, conversationId });
        return { ok: true, skipped: false, conversationType, conversationId };
      } catch (error) {
        const failure = syncFailure("history", reason, options, error);
        dispatchStatus({ status: "history_failed", reason, conversationType, conversationId, code: failure.code, error });
        return { ok: false, skipped: false, error, code: failure.code };
      }
    }
    try {
      const result = await performAccountSync(reason);
      if (result?.ok) {
        lastSyncFailure = null;
        if (!result.hasMore) {
          dispatchStatus({ status: "sync_ready", reason, changeCount: Number(result.changeCount || 0), hasMore: false });
        }
      }
      return result;
    } catch (error) {
      const failure = syncFailure("account", reason, options, error);
      dispatchStatus({ status: "pull_failed", reason, code: failure.code, error });
      return { ok: false, skipped: false, error, code: failure.code, changeCount: 0, hasMore: false };
    }
  }

  function requestSync(reason, options = {}) {
    if (LOCAL_PREVIEW_SYNC_DISABLED && /^(localhost|127\.0\.0\.1)$/i.test(globalThis.location?.hostname || '') && new URLSearchParams(globalThis.location?.search || '').get('candidateThemes') === '1') return Promise.resolve({ ok:true, skipped:true, code:'LOCAL_PREVIEW_SYNC_DISABLED' });
    const normalizedReason = String(reason || "");
    if (!SYNC_REASONS.has(normalizedReason)) return Promise.resolve({ ok: false, skipped: true, code: "CHAT_SYNC_REASON_INVALID" });
    if (pullRecovery && !["conversation_open", "cursor_recovery"].includes(normalizedReason)) {
      dispatchStatus({ status: "cursor_gap", recovery: { ...pullRecovery } });
      return Promise.resolve({ ok: false, skipped: true, blocked: true, cursorGap: true, recovery: { ...pullRecovery } });
    }
    if (!running && !start()) return Promise.resolve({ ok: false, skipped: true, code: "CHAT_SYNC_NOT_READY" });
    if (navigator.onLine === false) {
      const error = new Error("当前离线");
      error.code = "CHAT_SYNC_OFFLINE";
      const kind = normalizedReason === "conversation_open" ? "history" : "account";
      syncFailure(kind, normalizedReason, options, error);
      dispatchStatus({ status: normalizedReason === "conversation_open" ? "history_failed" : "pull_failed", reason: normalizedReason, code: error.code, error });
      return Promise.resolve({ ok: false, skipped: true, error, code: error.code });
    }
    const request = { reason: normalizedReason, options: { ...options } };
    const key = syncRequestKey(normalizedReason, options);
    if (syncRequestPromise) {
      if (key !== activeSyncRequestKey && key !== syncRequestKey(pendingSyncRequest?.reason, pendingSyncRequest?.options)) {
        pendingSyncRequest = request;
      }
      return syncRequestPromise;
    }
    syncRequestPromise = (async () => {
      let current = request;
      let result = null;
      let completed = 0;
      while (current && completed < 2) {
        activeSyncRequestKey = syncRequestKey(current.reason, current.options);
        pendingSyncRequest = null;
        lastSyncReason = current.reason;
        result = await performSyncRequest(current);
        lastSyncAt = Date.now();
        completed += 1;
        current = pendingSyncRequest;
      }
      return result;
    })().finally(() => {
      syncRequestPromise = null;
      activeSyncRequestKey = "";
      pendingSyncRequest = null;
    });
    return syncRequestPromise;
  }

  function setPullActive(value, options = {}) {
    pullActive = Boolean(value);
    return pullActive;
  }

  function start() {
    if (LOCAL_PREVIEW_SYNC_DISABLED) return false;
    const current = session();
    if (!current?.userId || typeof auth()?.callChatSync !== "function") return false;
    if (typeof auth()?.getDataLoadStatus === "function" && auth().getDataLoadStatus() !== "success") return false;
    if (running && activeUserId === current.userId) return true;
    if (activeUserId && activeUserId !== current.userId) {
      historyState.clear();
      successfulHydrations.clear();
      remoteVersions.clear();
      remoteTerminalStates.clear();
      calendarMoodHydratedUsers.clear();
      calendarMoodExplicitHydrationUsers.clear();
      pullRecovery = null;
    }
    activeUserId = current.userId;
    loadQueue();
    loadRecoveryState();
    running = true;
    void flush();
    document.dispatchEvent(new CustomEvent("shex:chat-sync-ready", { detail: { userId: activeUserId } }));
    return true;
  }

  function stop() {
    running = false;
    pullActive = false;
    clearTimeout(retryTimer);
  }

  window.addEventListener("online", () => {
    if (!running) start();
    void retryFailed();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    if (!running) start();
    void flush();
  });
  document.addEventListener("shex:user-data-restored", start);
  document.addEventListener("shex:auth-change", () => {
    const current = session();
    if (!current?.userId) stop();
    else start();
  });
  document.addEventListener("DOMContentLoaded", start);

  function pendingCountForConversation(conversationType, conversationId) {
    return queue.filter((item) => (
      item.action !== "clearConversation"
      && item.messageId
      && String(item.conversationType) === String(conversationType)
      && String(item.conversationId) === String(conversationId)
    )).length;
  }

  window.SHEXChatSync = {
    enqueueUpsert,
    enqueueDelete,
    enqueueClear,
    commitTerminalMutation,
    flush,
    hydrateConversation,
    hydrateCalendarMoodMonths,
    conversationHistoryState: historyStateSnapshot,
    hasOlderConversation: (conversationType, conversationId) => Boolean(historyState.get(`${conversationType}:${conversationId}`)?.hasMore),
    isApplyingRemote: () => applyingRemote,
    isRunning: () => running,
    // Apply a same-owner mutation returned by shexDatingAI without echoing it
    // through enqueueUpsert, or moving the cursor past unseen changes.
    acceptAuthoritativeChanges: (changes, ownerUserId) => {
      if (!running || String(ownerUserId || '') !== activeUserId) return Promise.resolve({ ok:false });
      return applyChangesAndWaitForPersistence(changes);
    },
    loadOlderConversation,
    pendingAction,
    pendingCount: () => queue.length,
    pendingCountForConversation,
    pull,
    requestSync,
    retryFailed,
    setPullActive,
    start,
    stop,
    pullState: () => ({
      active: pullActive,
      blocked: Boolean(pullRecovery),
      inFlight: Boolean(syncRequestPromise),
      lastReason: lastSyncReason,
      lastSyncAt,
      pendingReason: String(pendingSyncRequest?.reason || "")
    }),
    recoveryState: () => pullRecovery ? { ...pullRecovery } : null
  };
})();
