(function initWorldCreatorCloudClient(global, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.SHEXWorldCreatorCloudClient = api;
})(typeof window !== 'undefined' ? window : globalThis, function createWorldCreatorCloudClientModule() {
  'use strict';

  const CLIENT_VERSION = 'world-creator-cloud-client-v1-x100';
  const SAVE_TRACE_LIMIT = 300;
  const SAVE_TRACE_STORE_KEY = '__SHEX_WORLD_DRAFT_SAVE_TRACE_V1__';

  function traceStore() {
    if (!Array.isArray(globalThis[SAVE_TRACE_STORE_KEY])) globalThis[SAVE_TRACE_STORE_KEY] = [];
    return globalThis[SAVE_TRACE_STORE_KEY];
  }

  function recordSaveTrace(entry = {}) {
    const normalized = {
      at: Date.now(), phase: String(entry.phase || ''), draftId: String(entry.draftId || ''),
      blockKey: String(entry.blockKey || ''), fieldKey: String(entry.fieldKey || ''), requestId: String(entry.requestId || ''),
      caller: String(entry.caller || ''), callerStack: String(entry.callerStack || ''), stateSource: String(entry.stateSource || ''),
      revisionReadSource: String(entry.revisionReadSource || ''), revisionWriteTarget: String(entry.revisionWriteTarget || ''),
      localRevision: Number.isInteger(entry.localRevision) ? entry.localRevision : null,
      draftBaseRevision: Number.isInteger(entry.draftBaseRevision) ? entry.draftBaseRevision : null,
      requestBaseRevision: Number.isInteger(entry.requestBaseRevision) ? entry.requestBaseRevision : null,
      requestPayloadRevision: Number.isInteger(entry.requestPayloadRevision) ? entry.requestPayloadRevision : null,
      backendReturnedRevision: Number.isInteger(entry.backendReturnedRevision) ? entry.backendReturnedRevision : null,
      backendCurrentRevision: Number.isInteger(entry.backendCurrentRevision) ? entry.backendCurrentRevision : null,
      contentHash: String(entry.contentHash || ''), errorCode: String(entry.errorCode || ''), message: String(entry.message || ''),
      expectedRevision: Number.isInteger(entry.expectedRevision) ? entry.expectedRevision : null,
    };
    const entries = traceStore();
    entries.push(normalized);
    if (entries.length > SAVE_TRACE_LIMIT) entries.splice(0, entries.length - SAVE_TRACE_LIMIT);
    globalThis?.console?.info?.('[WORLD_DRAFT_SAVE_TRACE]', normalized);
    return normalized;
  }

  function loadSaveDiagnostics() { return JSON.parse(JSON.stringify(traceStore())); }
  function clearSaveDiagnostics() { traceStore().length = 0; }

  function clientError(code, message, details = {}) {
    return Object.assign(new Error(String(message || '世界创作服务暂时不可用')), {
      code: String(code || 'WORLD_CREATOR_FAILED'),
      ...(Number.isInteger(details?.currentRevision) ? { currentRevision: details.currentRevision } : {}),
      ...(Number.isInteger(details?.expectedRevision) ? { expectedRevision: details.expectedRevision } : {}),
      ...(details?.blockKey ? { blockKey: String(details.blockKey).slice(0, 120) } : {}),
      ...(details?.requestId ? { requestId: String(details.requestId).slice(0, 120) } : {}),
      ...(['unknown', 'not_committed'].includes(details?.commitState) ? { commitState: details.commitState } : {}),
    });
  }

  function createClient(options = {}) {
    const getCloudApp = options.getCloudApp;
    const currentUser = options.currentUser;
    const functionName = String(options.functionName || 'shexWorldCreator');
    const saveOrdinalByBlock = new Map();
    if (typeof getCloudApp !== 'function' || typeof currentUser !== 'function') throw new Error('world creator cloud client dependencies are required');

    async function call(action, input = {}, timeout = 60000) {
      const user = currentUser();
      if (!user?.userId || !user?.sessionToken) throw clientError('SESSION_EXPIRED', '登录状态已失效，请重新登录');
      const app = await getCloudApp();
      if (!app?.callFunction) throw clientError('WORLD_CREATOR_UNAVAILABLE', '世界创作服务暂时不可用');
      const callerStack = action === 'saveDraftBlocks' ? String(new Error('WORLD_DRAFT_SAVE_TRACE').stack || '') : '';
      const saveTraceContexts = action === 'saveDraftBlocks' ? (input?.patches || []).map((patch) => {
        const blockKey = String(patch?.blockKey || '');
        const counterKey = `${String(input?.draftId || '')}\u0000${blockKey}`;
        const ordinal = Number(saveOrdinalByBlock.get(counterKey) || 0) + 1;
        saveOrdinalByBlock.set(counterKey, ordinal);
        recordSaveTrace({
          phase: `request_payload_${ordinal}`, draftId: input?.draftId, blockKey, requestId: input?.requestId,
          caller: 'world-creator-cloud-client.call(saveDraftBlocks)', callerStack,
          stateSource: 'world-creator-cloud-client input.patches', revisionReadSource: 'caller supplied patch.baseRevision',
          localRevision: patch?.baseRevision, draftBaseRevision: input?.baseRevision,
          requestBaseRevision: patch?.baseRevision, requestPayloadRevision: patch?.baseRevision,
        });
        return { blockKey, ordinal, patch };
      }) : [];
      let response;
      try {
        response = await app.callFunction({
          name: functionName,
          data: { action, ...input, userId: user.userId, sessionToken: user.sessionToken },
          timeout,
        });
      } catch (error) {
        saveTraceContexts.forEach(({ blockKey, ordinal, patch }) => recordSaveTrace({
          phase: `after_response_${ordinal}`, draftId: input?.draftId, blockKey, requestId: input?.requestId,
          caller: 'world-creator-cloud-client.call(saveDraftBlocks)', callerStack,
          stateSource: 'CloudBase callFunction transport failure', revisionReadSource: 'caller supplied patch.baseRevision',
          localRevision: patch?.baseRevision, draftBaseRevision: input?.baseRevision,
          requestBaseRevision: patch?.baseRevision, requestPayloadRevision: patch?.baseRevision,
          errorCode: String(error?.code || 'WORLD_CREATOR_NETWORK_FAILED'), message: String(error?.message || ''),
        }));
        const missing = /FUNCTION_NOT_FOUND/i.test(`${String(error?.code || '')} ${String(error?.message || '')}`);
        throw clientError(String(error?.code || 'WORLD_CREATOR_NETWORK_FAILED'), missing ? '世界创作服务尚未部署，请先部署 shexWorldCreator' : '世界创作服务连接失败，请稍后重试', action === 'confirmWorldImport' && !missing ? { commitState: 'unknown' } : {});
      }
      const result = response?.result || response || {};
      saveTraceContexts.forEach(({ blockKey, ordinal, patch }) => {
        const head = (result?.blockHeads || []).find(item => String(item?.blockKey || '') === blockKey) || {};
        recordSaveTrace({
          phase: `after_response_${ordinal}`, draftId: input?.draftId, blockKey, requestId: input?.requestId,
          caller: 'world-creator-cloud-client.call(saveDraftBlocks)', callerStack,
          stateSource: 'CloudBase callFunction response.result', revisionReadSource: 'caller supplied patch.baseRevision',
          localRevision: patch?.baseRevision, draftBaseRevision: input?.baseRevision,
          requestBaseRevision: patch?.baseRevision, requestPayloadRevision: patch?.baseRevision,
          backendReturnedRevision: head?.revision, backendCurrentRevision: result?.currentRevision ?? head?.revision,
          contentHash: head?.contentHash, errorCode: !result.ok && !result.success ? result?.code : '',
          message: !result.ok && !result.success ? String(result?.message || result?.detail || '') : '',
          expectedRevision: result?.expectedRevision ?? patch?.baseRevision,
        });
      });
      if (!result.ok && !result.success) throw clientError(result.code, result.message || result.detail || '世界创作操作失败', result);
      return result;
    }

    return Object.freeze({
      inspectWorldImport: input => call('inspectWorldImport', { jsonText: String(input?.jsonText || ''), ...(input?.targetDraftId ? { targetDraftId: String(input.targetDraftId), baseRevision: input.baseRevision } : {}) }),
      confirmWorldImport: input => call('confirmWorldImport', {
        previewId: String(input?.previewId || ''), contentHash: String(input?.contentHash || ''), requestId: String(input?.requestId || ''),
      }),
      createDraft: input => call('createDraft', input),
      listDrafts: input => call('listDrafts', input),
      getDraft: input => call('getDraft', input),
      getDraftBlock: input => call('getDraftBlock', input),
      saveDraftBlocks: input => call('saveDraftBlocks', input),
      deleteDraft: input => call('deleteDraft', input),
      checkPublication: input => call('checkPublication', input),
      listCharacterVersions: input => call('listCharacterVersions', input),
      listCharacterDrafts: input => call('listCharacterDrafts', {
        query: String(input?.query || '').normalize('NFKC').trim().slice(0, 40),
        limit: Math.min(20, Math.max(1, Math.floor(Number(input?.limit) || 20))),
        cursor: String(input?.cursor || '').trim().slice(0, 500),
      }),
      publishSimulator: input => call('publishSimulator', input, 120000),
      unpublishSimulator: input => call('unpublishSimulator', input),
      listPublishedWorlds: input => call('listPublishedWorlds', input),
    });
  }

  return Object.freeze({ CLIENT_VERSION, clientError, createClient, loadSaveDiagnostics, clearSaveDiagnostics });
});
