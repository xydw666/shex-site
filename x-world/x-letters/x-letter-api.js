((root, factory) => {
  const api = factory(root || {});
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SHEXXLettersAPI = api;
})(typeof window !== 'undefined' ? window : globalThis, root => {
  'use strict';
  const Stationery = root.SHEXXLettersStationery || (typeof require === 'function' ? require('./x-letter-stationery') : null);
  const WRITE_ACTIONS = new Set(['createDraft', 'saveDraft', 'deleteDraft', 'sendDraft', 'hidePaper', 'restorePaper', 'deletePaper', 'setPaperTemplate',
    'putBookmark', 'deleteBookmark', 'saveLastRead', 'beginAttachment', 'completeAttachment',
    'requestIncomingLetter', 'requestDreamReply', 'resumeOperation', 'attachVoiceSegment', 'updateLegacyOverlay', 'saveBookCover', 'saveMonthlyBookCover', 'saveMonthlyLastRead', 'claimSecondMonthlyBook', 'unlockStationeryEarly']);
  const PAGE_LIMITS = Object.freeze({ listMonthlyBooks: [20, 20], listMonthlyPapers: [24, 24], listBooks: [20, 50], listPapers: [24, 60], getPaperChain: [20, 50], listLegacyPapers: [24, 60], listBookmarks: [24, 24] });
  const PENDING_KEY = 'shex_x_letters_pending_v1';
  const LOCAL_DRAFT_KEY = 'shex_x_letters_local_drafts_v1';
  const SEND_CONTEXT_KEY = 'shex_x_letters_send_context_v1';
  const TERMINAL = new Set(['completed', 'complete', 'delivered', 'deleted']);
  function error(code, message) { return Object.assign(new Error(message), { code }); }
  function safeCloudCode(value, fallback) {
    const code = String(value || '').trim();
    return /^CLOUDBASE_[A-Z0-9_]{1,64}$/.test(code) || code === 'FUNCTION_NOT_FOUND' ? code : fallback;
  }
  function sharedCloudBaseClient() {
    const bridge = root.SHEXCloudBaseClient;
    if (typeof bridge?.getClient !== 'function' || typeof bridge?.run !== 'function') {
      throw Object.assign(error('X_LETTERS_CLIENT_MISSING',
        'X信笺连接失败（阶段：共享客户端；错误码：X_LETTERS_CLIENT_MISSING）'), { stage: 'shared_client' });
    }
    return bridge;
  }
  async function connect() {
    const bridge = sharedCloudBaseClient();
    try { await bridge.getClient(); }
    catch (cause) {
      const code = safeCloudCode(cause?.code, 'X_LETTERS_CONNECT_FAILED');
      throw Object.assign(error(code, `X信笺连接失败（阶段：CloudBase 初始化；错误码：${code}）`), { stage: 'cloudbase_initialize' });
    }
  }
  function cleanRequestId(value) {
    const id = String(value || '').trim();
    if (!/^[A-Za-z0-9:_-]{1,180}$/.test(id)) throw error('REQUEST_ID_REQUIRED', 'requestId is required');
    return id;
  }
  function limitFor(action, input) {
    const [defaultLimit, maximum] = PAGE_LIMITS[action];
    const requested = Number(input);
    return Number.isInteger(requested) && requested > 0 ? Math.min(requested, maximum) : defaultLimit;
  }
  function pendingPayload(value) {
    return JSON.parse(JSON.stringify(value, (_key, item) => {
      if (item && typeof item === 'object' && (ArrayBuffer.isView(item) || item instanceof ArrayBuffer || (typeof Blob !== 'undefined' && item instanceof Blob))) {
        throw error('BINARY_PENDING', '待办不能保存图片或音频文件');
      }
      if (typeof item === 'string' && /^(?:data:|blob:)/i.test(item)) throw error('BINARY_PENDING', '待办不能保存临时媒体地址');
      return item;
    }));
  }
  function canonicalPayload(value) {
    if (Array.isArray(value)) return value.map(canonicalPayload);
    if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalPayload(value[key])]));
    return value;
  }
  async function defaultCaller(request) {
    const bridge = sharedCloudBaseClient();
    try { return await bridge.run(api => api.app.callFunction(request), { retryAuthOnce: false }); }
    catch (cause) {
      const code = safeCloudCode(cause?.code, 'X_LETTERS_CALL_FAILED');
      const stage = code.startsWith('CLOUDBASE_') ? 'cloudbase_auth' : 'call_function';
      const label = stage === 'cloudbase_auth' ? 'CloudBase 鉴权' : '云函数调用';
      throw Object.assign(error(code, `X信笺连接失败（阶段：${label}；错误码：${code}）`), { stage });
    }
  }
  function createClient(options = {}) {
    const currentUser = options.currentUser || (() => root.SHEXAuth?.current?.());
    const currentDream = options.currentDream || (() => null);
    const caller = options.callFunction || defaultCaller;
    const storage = options.storage || root.localStorage;
    const functionName = options.functionName || root.SHEX_CLOUDBASE_CONFIG?.functions?.xLetters || 'shexXLetters';
    let account = null, generation = 0;
    const controllers = new Set();
    const readControllers = new Set();
    function identity() {
      const user = currentUser();
      if (!user?.userId || !user?.sessionToken) throw error('SESSION_REQUIRED', '请先登录');
      if (account !== null && account !== user.userId) {
        generation += 1;
        for (const controller of controllers) controller.abort();
        controllers.clear();
      }
      account = user.userId;
      return user;
    }
    function readPending() {
      try {
        const value = JSON.parse(storage?.getItem(PENDING_KEY) || '[]');
        return Array.isArray(value) ? value.filter(item => item?.userId && item?.dreamId && item?.requestId) : [];
      } catch (_) { return []; }
    }
    function savePending(records) { storage?.setItem(PENDING_KEY, JSON.stringify(records)); }
    function sendContexts() {
      try {
        const rows = JSON.parse(storage?.getItem(SEND_CONTEXT_KEY) || '[]');
        return Array.isArray(rows) ? rows.filter(item => item && typeof item === 'object' && !Array.isArray(item)
          && typeof item.userId === 'string' && typeof item.dreamId === 'string' && typeof item.paperId === 'string') : [];
      }
      catch (_) { return []; }
    }
    function sendContext(dreamId, paperId) {
      const user = identity();
      const row = sendContexts().find(item => item.userId === user.userId && item.dreamId === dreamId && item.paperId === paperId);
      return row ? { ...row } : null;
    }
    function localSendContext(dreamId, quarterKey) {
      const user = identity();
      const row = sendContexts().filter(item => item.userId === user.userId && item.dreamId === dreamId
        && item.localQuarterKey === quarterKey && String(item.paperId).startsWith('local:') && !item.sendIssued)
        .sort((a, b) => b.updatedAt - a.updatedAt)[0];
      return row ? { ...row } : null;
    }
    function stageSendContext(input = {}) {
      const user = identity(), dreamId = String(input.dreamId || '').trim(), paperId = String(input.paperId || '').trim();
      if (!dreamId || !paperId || !['sending', 'sent', 'failed', 'uncertain'].includes(input.phase)) throw error('SEND_CONTEXT_REQUIRED', '寄出恢复归属无效');
      const record = { userId: user.userId, dreamId, paperId, phase: input.phase, sendRequestId: cleanRequestId(input.sendRequestId),
        replyRequestId: `letter-reply:${paperId}`, deliveryMode: input.deliveryMode === 'within_24h' ? 'within_24h' : 'immediate',
        expectedMode: ['ai', 'card'].includes(input.expectedMode) ? input.expectedMode : null, sentSealStyle: Stationery?.seals.some(item=>item.id===input.sentSealStyle) ? input.sentSealStyle : 'botanical-round',
        stampId: input.stampId === 'stamp-default-1' ? input.stampId : null, advanceToWriting: input.advanceToWriting === true,
        localQuarterKey: paperId.startsWith('local:') && /^(?:\d{4}-Q[1-4]|undated)$/.test(input.localQuarterKey || '') ? input.localQuarterKey : '',
        replyStage: ['requested', 'completed'].includes(input.replyStage) ? input.replyStage : 'ready',
        sendIssued: input.sendIssued === true, updatedAt: Date.now() };
      const rows = sendContexts().filter(item => !(item.userId === user.userId && item.dreamId === dreamId
        && (item.paperId === paperId || item.paperId === input.previousPaperId && item.sendRequestId === record.sendRequestId)));
      // Completed replies are expendable; unresolved sends never silently lose their recovery settings.
      const retained = rows.filter(item => item.phase !== 'sent' || item.replyStage !== 'completed');
      if (retained.filter(item => item.userId === user.userId && item.dreamId === dreamId).length >= 50 || retained.length >= 200)
        throw error('SEND_CONTEXT_LIMIT', '寄出恢复空间已满，同一账号和梦角最多保留 50 封待恢复信笺');
      retained.push(record);
      const encoded = JSON.stringify(retained);
      if (new TextEncoder().encode(encoded).length > 256 * 1024) throw error('SEND_CONTEXT_LIMIT', '寄出恢复空间已满');
      storage?.setItem(SEND_CONTEXT_KEY, encoded);
      if (record.phase === 'sent') {
        savePending(readPending().filter(item => !(item.userId === user.userId && item.dreamId === dreamId
          && item.action === 'sendDraft' && item.requestId === record.sendRequestId && item.payload?.paperId === paperId)));
      }
      return { ...record };
    }
    function localDrafts() { try { const value=JSON.parse(storage?.getItem(LOCAL_DRAFT_KEY)||'[]');return Array.isArray(value)?value:[]; }catch(_){return [];} }
    function stageLocalDraftSnapshot({dreamId,paper}) {
      const user=identity();if(!dreamId||!paper?.localDraft||!String(paper.paperId).startsWith('local:'))throw error('DRAFT_TARGET_REQUIRED','本机草稿归属无效');
      const rows=localDrafts().filter(row=>!(row.userId===user.userId&&row.dreamId===dreamId&&row.paper.quarterKey===paper.quarterKey));
      rows.push({userId:user.userId,dreamId,paper:pendingPayload(paper)});
      const encoded=JSON.stringify(rows);
      if(rows.length>50||new TextEncoder().encode(encoded).length>2*1024*1024)throw error('LOCAL_DRAFT_LIMIT','本机草稿空间已满，请先保存现有草稿');
      storage?.setItem(LOCAL_DRAFT_KEY,encoded);
    }
    function pendingFor(userId, dreamId) { return readPending().filter(item => item.userId === userId && item.dreamId === dreamId); }
    function upsertPending(record) {
      const records = readPending().filter(item => !(item.userId === record.userId && item.dreamId === record.dreamId && TERMINAL.has(item.status) && item.requestId !== record.requestId));
      const existingIndex = records.findIndex(item => item.userId === record.userId && item.dreamId === record.dreamId && item.requestId === record.requestId);
      if (existingIndex >= 0) records[existingIndex] = record;
      else {
        if (records.filter(item => item.userId === record.userId && item.dreamId === record.dreamId).length >= 50) {
          throw error('PENDING_LIMIT', '同一账号和梦角最多保留 50 个待办');
        }
        records.push(record);
      }
      savePending(records);
    }
    function removePending(userId, dreamId, requestId) {
      savePending(readPending().filter(item => !(item.userId === userId && item.dreamId === dreamId && item.requestId === requestId)));
    }
    const draftContent = payload => JSON.stringify(canonicalPayload([payload?.paperTemplateId || null,payload?.stampId || null,payload?.sentSealStyle || 'botanical-round',payload?.blocks || []]));
    function discardSavedCheckpoint(userId,dreamId,payload) {
      const content=draftContent(payload);
      savePending(readPending().filter(item=>!(item.userId===userId&&item.dreamId===dreamId&&item.action==='saveDraft'
        &&item.status==='staged'&&item.payload?.paperId===payload.paperId&&draftContent(item.payload)===content)));
    }
    function stageWrite(action, input = {}) {
      if (!WRITE_ACTIONS.has(action)) throw error('WRITE_ACTION_REQUIRED', '只能暂存写入操作');
      const user = identity();
      const payload = { ...input };
      delete payload.userId; delete payload.sessionToken;
      const dreamId = String(payload.dreamId || '').trim();
      payload.requestId = cleanRequestId(payload.requestId);
      if (!dreamId) throw error('DREAM_ID_REQUIRED', 'dreamId is required');
      const old = readPending().find(item => item.userId === user.userId && item.requestId === payload.requestId);
      const durablePayload = pendingPayload(payload);
      if (old && (old.action !== action || old.dreamId !== dreamId)) throw error('REQUEST_ID_CONFLICT', 'requestId belongs to another action or dream');
      if (old?.payload && JSON.stringify(canonicalPayload(old.payload)) !== JSON.stringify(canonicalPayload(durablePayload))) {
        throw error('REQUEST_ID_CONFLICT', 'requestId belongs to different content');
      }
      upsertPending({ ...old, userId: user.userId, dreamId, requestId: payload.requestId, action, status: 'pending',
        payload: durablePayload, updatedAt: Date.now(), operationId: old?.operationId || '' });
      return payload;
    }
    function stageDraftSnapshot(input = {}) {
      const user = identity();
      const payload = { ...input, requestId: cleanRequestId(input.requestId) };
      if (!payload.dreamId || !payload.paperId) throw error('DRAFT_TARGET_REQUIRED', '草稿归属无效');
      const durablePayload = pendingPayload(payload);
      const records = readPending().filter(item => !(item.userId === user.userId && item.dreamId === payload.dreamId
        && item.action === 'saveDraft' && item.status === 'staged' && item.payload?.paperId === payload.paperId));
      if (records.some(item => item.userId === user.userId && item.requestId === payload.requestId)) {
        throw error('REQUEST_ID_CONFLICT', 'requestId already exists');
      }
      if (records.filter(item => item.userId === user.userId && item.dreamId === payload.dreamId).length >= 50) {
        throw error('PENDING_LIMIT', '同一账号和梦角最多保留 50 个待办');
      }
      records.push({ userId: user.userId, dreamId: payload.dreamId, requestId: payload.requestId,
        action: 'saveDraft', status: 'staged', payload: durablePayload, updatedAt: Date.now(), operationId: '' });
      savePending(records);
      return payload;
    }
    async function call(action, input = {}, runtime = {}) {
      const user = identity();
      const dreamId = String(input.dreamId || '').trim();
      const epoch = generation;
      const write = WRITE_ACTIONS.has(action);
      const payload = { ...input };
      delete payload.userId; delete payload.sessionToken;
      if (PAGE_LIMITS[action]) payload.limit = limitFor(action, payload.limit);
      if (write) {
        const old = readPending().find(item => item.userId === user.userId && item.requestId === payload.requestId);
        stageWrite(action, payload);
        if (!runtime.skipOperationLookup && old?.operationId && (action === 'requestIncomingLetter' || action === 'requestDreamReply')) {
          const recovered = await call('getOperation', { dreamId, operationId: old.operationId });
          if (recovered.status && !['retryable_failed', 'failed'].includes(recovered.status)) {
            if (TERMINAL.has(recovered.status)) removePending(user.userId, dreamId, payload.requestId);
            return recovered;
          }
        }
      }
      const controller = typeof AbortController === 'function' ? new AbortController() : null;
      if (controller) controllers.add(controller);
      if (controller && !write) readControllers.add(controller);
      try {
        const response = await caller({ name: functionName, data: { action, ...payload, userId: user.userId, sessionToken: user.sessionToken }, signal: controller?.signal });
        if (!write && controller?.signal.aborted) throw error('READ_CANCELLED', '已退出信笺，读取已取消');
        if (epoch !== generation || currentUser()?.userId !== user.userId) throw error('ACCOUNT_CHANGED', '账号已切换，旧请求结果已停止');
        const result = response?.result || response || {};
        if (!result.ok && !result.success) throw Object.assign(error(result.code || 'X_LETTERS_FAILED', result.message || 'X信笺操作失败'), { definitive: true });
        if (options.currentDream && dreamId && currentDream() !== dreamId) {
          if (write) upsertPending({ userId: user.userId, dreamId, requestId: payload.requestId, action, payload: pendingPayload(payload),
            operationId: result.operationId || '', status: result.status || 'pending', updatedAt: Date.now() });
          throw error('DREAM_CHANGED', '梦角已切换，原梦角结果待恢复');
        }
        if (['getOperation','resumeOperation'].includes(action) && TERMINAL.has(result.status)) {
          for (const record of pendingFor(user.userId, dreamId)) if (record.operationId === payload.operationId)
            removePending(user.userId, dreamId, record.requestId);
        }
        if (write) {
          if (result.operationId && !TERMINAL.has(result.status)) upsertPending({ userId: user.userId, dreamId,
            requestId: payload.requestId, action, payload: pendingPayload(payload), operationId: result.operationId,
            status: result.status || 'pending', updatedAt: Date.now() });
          else {
            removePending(user.userId, dreamId, payload.requestId);
            if(action==='saveDraft')discardSavedCheckpoint(user.userId,dreamId,payload);
          }
        }
        return result;
      } finally { if (controller) { controllers.delete(controller); readControllers.delete(controller); } }
    }
    const client = { call, getIncomingStatus: input => call('getIncomingStatus', input), stageWrite, stageDraftSnapshot, stageLocalDraftSnapshot, sendContext, localSendContext, stageSendContext,
      cancelReads() { for (const controller of readControllers) controller.abort(); readControllers.clear(); },
      clearStagedDraftSnapshot({dreamId,paperId}) {const user=identity();savePending(readPending().filter(item=>!(item.userId===user.userId&&item.dreamId===dreamId&&item.action==='saveDraft'&&item.status==='staged'&&item.payload?.paperId===paperId)));},
      localDraftSnapshot(dreamId,quarterKey) {const user=identity();const row=localDrafts().find(item=>item.userId===user.userId&&item.dreamId===dreamId&&item.paper.quarterKey===quarterKey);return row?pendingPayload(row.paper):null;},
      latestLocalDraftSnapshot(dreamId) {const user=identity();const row=localDrafts().filter(item=>item.userId===user.userId&&item.dreamId===dreamId).reverse().find(item=>(item.paper.blocks||[]).some(block=>block.type!=='text'||String(block.text||'').trim()));return row?pendingPayload(row.paper):null;},
      // 用户主动放弃 / 已失效的旧收信：只清本机待恢复记录，不动云端。
      discardPendingOperation({dreamId,operationId}) {const user=identity();if(!operationId)return;for(const record of pendingFor(user.userId,dreamId))if(record.operationId===operationId)removePending(user.userId,dreamId,record.requestId);},
      clearLocalDraftSnapshot({dreamId,paperId}) {const user=identity();storage?.setItem(LOCAL_DRAFT_KEY,JSON.stringify(localDrafts().filter(item=>!(item.userId===user.userId&&item.dreamId===dreamId&&item.paper.paperId===paperId))));},
      pendingFor(dreamId) { const user = identity(); return pendingFor(user.userId, dreamId); },
      onAccountChange() { generation += 1; for (const controller of controllers) controller.abort(); controllers.clear(); account = null; },
      async resumePending(dreamId, { actions = null } = {}) {
        const userId = identity().userId,epoch=generation;
        const checkOwner=()=>{if(epoch!==generation||currentUser()?.userId!==userId)throw error('ACCOUNT_CHANGED','账号已切换，旧账号待办已停止恢复');};
        const records = pendingFor(userId, dreamId).filter(item => !actions || actions.includes(item.action));
        const results = [];
        for (const item of records) {
          checkOwner();
          let result;
          if (item.operationId) {
            result = await call('getOperation', { dreamId, operationId: item.operationId });
            checkOwner();
            if (['retryable_failed', 'failed'].includes(result.status)) {
              result = await call(item.action, { ...item.payload, dreamId, requestId: item.requestId }, { skipOperationLookup: true });
            }
          } else result = await call(item.action, { ...item.payload, dreamId, requestId: item.requestId });
          checkOwner();
          if (TERMINAL.has(result.status)) removePending(userId, dreamId, item.requestId);
          results.push(result);
        }
        return results;
      } };
    for (const action of ['openMonthlyBooks', 'listMonthlyBooks', 'listMonthlyPapers', 'saveMonthlyBookCover', 'saveMonthlyLastRead', 'claimSecondMonthlyBook', 'unlockStationeryEarly', 'getLatestDraft', 'listBooks', 'listPapers', 'listBookmarks', 'getPaper', 'getPaperChain', 'getPaperMedia',
      'listLegacyPapers', 'getLegacyPaper', 'updateLegacyOverlay', 'saveBookCover',
      'createDraft', 'saveDraft', 'deleteDraft', 'sendDraft', 'hidePaper', 'restorePaper', 'deletePaper', 'setPaperTemplate', 'putBookmark',
      'deleteBookmark', 'saveLastRead', 'beginAttachment', 'completeAttachment', 'requestIncomingLetter',
      'requestDreamReply', 'getOperation', 'resumeOperation', 'attachVoiceSegment', 'petLetterInbox', 'petLetterDecide', 'petLetterWrite', 'petLetterOpen', 'petLetterSaveSettings', 'petSaveLoad', 'petSaveWrite', 'petJournalList', 'petJournalWrite', 'petJournalMigrate']) {
      client[action] = input => call(action, input);
    }
    return Object.freeze(client);
  }
  const defaultClient = createClient();
  return Object.freeze({ createClient, connect, ...defaultClient });
});
