(function initWorldImportLocalClient(global) {
  'use strict';

  const SAVE_TRACE_LIMIT = 300;
  const SAVE_TRACE_STORE_KEY = '__SHEX_WORLD_DRAFT_SAVE_TRACE_V1__';
  const saveOrdinalByBlock = new Map();

  function traceStore() {
    if (!Array.isArray(global[SAVE_TRACE_STORE_KEY])) global[SAVE_TRACE_STORE_KEY] = [];
    return global[SAVE_TRACE_STORE_KEY];
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
    global.console?.info?.('[WORLD_DRAFT_SAVE_TRACE]', normalized);
    return normalized;
  }

  function loadSaveDiagnostics() { return JSON.parse(JSON.stringify(traceStore())); }
  function clearSaveDiagnostics() { traceStore().length = 0; }

  function isLocalPreviewHostname(hostnameValue) {
    const hostname = String(hostnameValue || '').trim().toLowerCase().replace(/^\[|\]$/g, '');
    if (hostname === 'localhost' || hostname === '::1' || hostname === '0.0.0.0') return true;
    const octets = hostname.split('.').map(value => Number(value));
    if (octets.length !== 4 || octets.some(value => !Number.isInteger(value) || value < 0 || value > 255)) return false;
    return octets[0] === 127
      || octets[0] === 10
      || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
      || (octets[0] === 192 && octets[1] === 168);
  }

  function isAvailable() {
    return isLocalPreviewHostname(global.location?.hostname);
  }

  async function request(action, input) {
    const callerStack = action === 'saveDraftBlocks' ? String(new Error('WORLD_DRAFT_SAVE_TRACE').stack || '') : '';
    const saveTraceContexts = action === 'saveDraftBlocks' ? (input?.patches || []).map((patch) => {
      const blockKey = String(patch?.blockKey || '');
      const counterKey = `${String(input?.draftId || '')}\u0000${blockKey}`;
      const ordinal = Number(saveOrdinalByBlock.get(counterKey) || 0) + 1;
      saveOrdinalByBlock.set(counterKey, ordinal);
      recordSaveTrace({
        phase: `request_payload_${ordinal}`, draftId: input?.draftId, blockKey, requestId: input?.requestId,
        caller: 'world-import-local-client.request(saveDraftBlocks)', callerStack,
        stateSource: 'world-import-local-client input.patches', revisionReadSource: 'caller supplied patch.baseRevision',
        localRevision: patch?.baseRevision, draftBaseRevision: input?.baseRevision,
        requestBaseRevision: patch?.baseRevision, requestPayloadRevision: patch?.baseRevision,
      });
      return { blockKey, ordinal, patch };
    }) : [];
    let response;
    try {
      response = await global.fetch('/__shex_world_import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, input })
      });
    } catch (error) {
      saveTraceContexts.forEach(({ blockKey, ordinal, patch }) => recordSaveTrace({
        phase: `after_response_${ordinal}`, draftId: input?.draftId, blockKey, requestId: input?.requestId,
        caller: 'world-import-local-client.request(saveDraftBlocks)', callerStack,
        stateSource: 'local preview fetch transport failure', revisionReadSource: 'caller supplied patch.baseRevision',
        localRevision: patch?.baseRevision, draftBaseRevision: input?.baseRevision,
        requestBaseRevision: patch?.baseRevision, requestPayloadRevision: patch?.baseRevision,
        errorCode: String(error?.code || 'LOCAL_WORLD_IMPORT_UNAVAILABLE'), message: String(error?.message || ''),
      }));
      throw error;
    }
    let payload = null;
    try { payload = await response.json(); } catch { /* handled below */ }
    const result = payload?.result || {};
    saveTraceContexts.forEach(({ blockKey, ordinal, patch }) => {
      const head = (result?.blockHeads || []).find(item => String(item?.blockKey || '') === blockKey) || {};
      const source = payload?.error || {};
      recordSaveTrace({
        phase: `after_response_${ordinal}`, draftId: input?.draftId, blockKey, requestId: input?.requestId,
        caller: 'world-import-local-client.request(saveDraftBlocks)', callerStack,
        stateSource: 'local preview HTTP response.result', revisionReadSource: 'caller supplied patch.baseRevision',
        localRevision: patch?.baseRevision, draftBaseRevision: input?.baseRevision,
        requestBaseRevision: patch?.baseRevision, requestPayloadRevision: patch?.baseRevision,
        backendReturnedRevision: head?.revision, backendCurrentRevision: source?.currentRevision ?? head?.revision,
        contentHash: head?.contentHash, errorCode: response.ok && payload?.ok === true ? '' : source?.code,
        message: response.ok && payload?.ok === true ? '' : source?.message,
        expectedRevision: source?.expectedRevision ?? patch?.baseRevision,
      });
    });
    if (!response.ok || payload?.ok !== true) {
      const source = payload?.error || {};
      const error = new Error(source.message || '本地世界导入服务未启动，请使用项目提供的 Simulator 本地预览服务。');
      error.code = source.code || 'LOCAL_WORLD_IMPORT_UNAVAILABLE';
      if (source.path) error.path = source.path;
      throw error;
    }
    return payload.result;
  }

  function createClient() {
    if (!isAvailable()) return null;
    return Object.freeze({
      inspectWorldImport: input => request('inspectWorldImport', input),
      confirmWorldImport: input => request('confirmWorldImport', input),
      createDraft: input => request('createDraft', input),
      listDrafts: input => request('listDrafts', input),
      getDraft: input => request('getDraft', input),
      saveDraftBlocks: input => request('saveDraftBlocks', input),
      deleteDraft: input => request('deleteDraft', input),
      checkPublication: input => request('checkPublication', input),
      listCharacterVersions: input => request('listCharacterVersions', input),
      publishSimulator: input => request('publishSimulator', input),
      listPublishedWorlds: input => request('listPublishedWorlds', input)
    });
  }

  global.SHEXWorldImportLocalClient = Object.freeze({
    isLocalPreviewHostname, isAvailable, createClient, loadSaveDiagnostics, clearSaveDiagnostics,
  });
}(typeof window !== 'undefined' ? window : globalThis));
