(function initSimulatorCreatorState(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SHEXSimulatorCreatorState = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function buildSimulatorCreatorState() {
  'use strict';

  const CORE_BLOCK_TYPES = Object.freeze(['overview', 'world', 'roster', 'state', 'director']);
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
    if (typeof window !== 'undefined') globalThis.console?.info?.('[WORLD_DRAFT_SAVE_TRACE]', normalized);
    return normalized;
  }

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function stableJson(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }

  function createBlankCoreBlocks() {
    return {
      overview: {
        title: '', summary: '', categoryId: '', tagIds: [], contentRating: 'general',
        visibility: 'admin_only', creatorNotes: '',
      },
      world: {
        premise: '', openingText: '', rules: [], locations: [], toneTags: [], safetyNotes: [],
        openingChapterId: '', openingStageId: '', runtimeProfile: 'ai_directed_v1',
      },
      roster: { characters: [] },
      state: { variables: [], items: [], initialRelationships: [], routes: [] },
      director: {
        narrativeGoal: '', toneInstructions: '', npcControlRules: [], pacing: 'balanced',
        forbiddenReveals: [],
        candidatePolicy: { allowedKinds: ['event_candidate', 'variable_candidate', 'chapter_transition_candidate'] },
        outputContractVersion: 'simulator-ai-director-output-v1',
      },
    };
  }

  function safeIdPart(value) {
    return String(value || '').trim().replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80);
  }

  function createSafeEntityId(prefixValue, existingIdsValue, generator) {
    const prefix = safeIdPart(prefixValue) || 'entity';
    const existingIds = existingIdsValue instanceof Set ? existingIdsValue : new Set(existingIdsValue || []);
    const generated = typeof generator === 'function' ? safeIdPart(generator(prefix)) : '';
    if (generated && !existingIds.has(generated)) return generated;
    for (let index = 1; index <= 100000; index += 1) {
      const candidate = `${prefix}_${index}`.slice(0, 80);
      if (!existingIds.has(candidate)) return candidate;
    }
    throw new Error('无法生成唯一内容编号');
  }

  function normalizeBlock(raw) {
    return {
      blockKey: String(raw?.blockKey || ''),
      blockType: String(raw?.blockType || ''),
      revision: Number.isInteger(raw?.revision) ? raw.revision : 0,
      contentHash: String(raw?.contentHash || ''),
      payload: clone(raw?.payload),
    };
  }

  function createSimulatorEditorState(options = {}) {
    const createRequestId = typeof options.createRequestId === 'function'
      ? options.createRequestId
      : prefix => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    let draftId = '';
    let revision = 0;
    let blocks = new Map();
    let savedFingerprints = new Map();
    let dirtyKeys = new Set();
    let publicationCheck = null;
    let activeIntent = null;
    let failedIntent = null;
    let readConsistency = { inconsistentBlockKeys: [] };
    let saveAcknowledgementGaps = new Set();
    let tokenCounter = 0;

    function load(draft = {}, loadOptions = {}) {
      draftId = String(draft.draftId || '');
      revision = Number(draft.revision || 0);
      blocks = new Map();
      savedFingerprints = new Map();
      dirtyKeys = new Set();
      publicationCheck = null;
      activeIntent = null;
      failedIntent = null;
      readConsistency = { inconsistentBlockKeys: [] };
      saveAcknowledgementGaps = new Set();
      const authoritativeHeads = new Map((Array.isArray(draft.blockHeads) ? draft.blockHeads : [])
        .map(head => [String(head?.blockKey || ''), head]));
      (draft.blocks || []).forEach((raw) => {
        const block = normalizeBlock(raw);
        if (!block.blockKey) return;
        const head = authoritativeHeads.get(block.blockKey);
        const samePersistedContent = String(raw?.contentHash || '')
          && String(head?.contentHash || '') === String(raw.contentHash);
        if (samePersistedContent && Number.isInteger(head?.revision)) {
          block.revision = head.revision;
          block.contentHash = String(head.contentHash || block.contentHash || '');
        } else if (head && (Number(head.revision) !== Number(block.revision)
          || String(head.contentHash || '') !== String(block.contentHash || ''))) {
          readConsistency.inconsistentBlockKeys.push(block.blockKey);
          readConsistency[block.blockKey] = {
            localRevision:Number(block.revision || 0),
            authoritativeRevision:Number(head.revision || 0),
            contentHash:String(block.contentHash || ''),
            authoritativeContentHash:String(head.contentHash || ''),
          };
        }
        blocks.set(block.blockKey, block);
        savedFingerprints.set(block.blockKey, stableJson(block.payload));
      });
      readConsistency.inconsistentBlockKeys.sort();
      if (loadOptions.withBlankCore === true) {
        const defaults = createBlankCoreBlocks();
        CORE_BLOCK_TYPES.forEach((key) => {
          if (!blocks.has(key)) {
            blocks.set(key, { blockKey: key, blockType: key, revision: 0, payload: clone(defaults[key]) });
            dirtyKeys.add(key);
          }
        });
      }
    }

    function getBlock(blockKey) {
      const block = blocks.get(String(blockKey || ''));
      return block ? clone(block) : null;
    }

    function setBlock(blockKeyValue, blockTypeValue, value) {
      const blockKey = String(blockKeyValue || '').trim();
      const blockType = String(blockTypeValue || '').trim();
      if (!blockKey || !blockType) throw new Error('内容块编号和类型不能为空');
      const prior = blocks.get(blockKey);
      const next = { blockKey, blockType, revision: prior?.revision || 0, payload: clone(value) };
      blocks.set(blockKey, next);
      const currentFingerprint = stableJson(next.payload);
      if (currentFingerprint === savedFingerprints.get(blockKey)) dirtyKeys.delete(blockKey);
      else dirtyKeys.add(blockKey);
      publicationCheck = null;
      failedIntent = null;
      return getBlock(blockKey);
    }

    function deleteBlock(blockKeyValue, blockTypeValue) {
      const blockKey = String(blockKeyValue || '').trim();
      const prior = blocks.get(blockKey);
      const blockType = String(blockTypeValue || prior?.blockType || '').trim();
      if (!prior || !blockType) return false;
      blocks.set(blockKey, { blockKey, blockType, revision: prior.revision || 0, deleted: true });
      dirtyKeys.add(blockKey);
      publicationCheck = null;
      failedIntent = null;
      return true;
    }

    function makeIntent(options = {}) {
      const normalizeRequestedKeys = value => [...new Set((Array.isArray(value) ? value : [])
        .map(value => String(value || '')).filter(key => dirtyKeys.has(key)))];
      const onlyRequested = Array.isArray(options.onlyBlockKeys);
      const onlyKeys = normalizeRequestedKeys(options.onlyBlockKeys);
      const prioritized = normalizeRequestedKeys(options.includeBlockKeys);
      const sortedKeys = [...dirtyKeys].sort();
      const candidates = onlyRequested
        ? onlyKeys
        : [...prioritized, ...sortedKeys.filter(key => !prioritized.includes(key))];
      const keys = candidates.slice(0, 20);
      if (!draftId || !keys.length) return null;
      const requestId = String(createRequestId('simulator_draft_save') || '').slice(0, 120);
      if (!requestId) throw new Error('无法生成保存请求编号');
      const fingerprints = {};
      const patches = keys.map((key) => {
        const block = blocks.get(key);
        fingerprints[key] = block.deleted ? '__deleted__' : stableJson(block.payload);
        recordSaveTrace({
          phase: 'state_revision_read', draftId, blockKey: key, requestId,
          caller: 'createSimulatorEditorState.makeIntent', callerStack: String(new Error('WORLD_DRAFT_SAVE_TRACE').stack || ''),
          stateSource: 'createSimulatorEditorState.blocks Map',
          revisionReadSource: `blocks.get(${key}).revision`, localRevision: block.revision || 0,
          draftBaseRevision: revision, requestBaseRevision: block.revision || 0,
          requestPayloadRevision: block.revision || 0, contentHash: block.contentHash,
        });
        return block.deleted
          ? { blockKey: key, blockType: block.blockType, baseRevision: block.revision || 0, delete: true }
          : { blockKey: key, blockType: block.blockType, baseRevision: block.revision || 0, value: clone(block.payload) };
      });
      return { request: { draftId, requestId, baseRevision: revision, patches }, fingerprints };
    }

    function beginSave(options = {}) {
      if (activeIntent) return null;
      const source = failedIntent || makeIntent(options);
      if (!source) return null;
      const next = { ...source, token: `save_intent_${++tokenCounter}` };
      activeIntent = next;
      failedIntent = null;
      return clone(next);
    }

    function acknowledgeSave(token, result = {}) {
      if (!activeIntent || activeIntent.token !== token) return false;
      const acknowledged = activeIntent;
      activeIntent = null;
      revision = Number(result.revision || revision);
      const heads = new Map((result.blockHeads || []).map(head => [String(head.blockKey), head]));
      const patchedKeys = new Set(acknowledged.request.patches.map(patch => String(patch.blockKey || '')));
      acknowledged.request.patches.forEach((patch) => {
        const key = patch.blockKey;
        const current = blocks.get(key);
        const head = heads.get(key);
        recordSaveTrace({
          phase: 'state_revision_write_before', draftId, blockKey: key, requestId: acknowledged.request.requestId,
          caller: 'createSimulatorEditorState.acknowledgeSave',
          stateSource: 'createSimulatorEditorState.blocks Map', revisionReadSource: `blocks.get(${key}).revision`,
          revisionWriteTarget: `blocks.get(${key}).revision`, localRevision: current?.revision,
          draftBaseRevision: acknowledged.request.baseRevision, requestBaseRevision: patch.baseRevision,
          requestPayloadRevision: patch.baseRevision, backendReturnedRevision: head?.revision,
          backendCurrentRevision: head?.revision, contentHash: head?.contentHash,
        });
        if (patch.delete === true) {
          savedFingerprints.delete(key);
          if (current?.deleted) {
            blocks.delete(key);
            dirtyKeys.delete(key);
          } else if (current) {
            // The acknowledged request removed the persisted block. If the user
            // recreated it while that request was in flight, its next CAS base
            // must therefore be the absent-block revision rather than the old one.
            current.revision = 0;
            dirtyKeys.add(key);
          }
          return;
        }
        if (!head || !Number.isInteger(head.revision)) {
          saveAcknowledgementGaps.add(key);
          dirtyKeys.add(key);
          return;
        }
        saveAcknowledgementGaps.delete(key);
        savedFingerprints.set(key, acknowledged.fingerprints[key]);
        // saveDraftBlocks returns blockHeads produced by this exact transaction
        // (and stores the same result for idempotent replay). Advancing an edit
        // made while the request was in flight to that committed revision keeps
        // its next CAS anchored to the content the edit was based on.
        if (current && head && Number.isInteger(head.revision)) {
          current.revision = head.revision;
          current.contentHash = String(head.contentHash || current.contentHash || '');
        }
        if (current && stableJson(current.payload) === acknowledged.fingerprints[key]) dirtyKeys.delete(key);
        else dirtyKeys.add(key);
        recordSaveTrace({
          phase: 'state_revision_write_after', draftId, blockKey: key, requestId: acknowledged.request.requestId,
          caller: 'createSimulatorEditorState.acknowledgeSave',
          stateSource: 'createSimulatorEditorState.blocks Map', revisionReadSource: `blocks.get(${key}).revision`,
          revisionWriteTarget: `blocks.get(${key}).revision`, localRevision: blocks.get(key)?.revision,
          draftBaseRevision: revision, requestBaseRevision: patch.baseRevision,
          requestPayloadRevision: patch.baseRevision, backendReturnedRevision: head?.revision,
          backendCurrentRevision: head?.revision, contentHash: blocks.get(key)?.contentHash,
        });
      });
      // The transaction returns the authoritative head set for the whole draft,
      // not only the blocks included in this request. A previous client can have
      // loaded a matching persisted block before learning its latest revision.
      // Absorb that revision only when the local block is clean and its persisted
      // content hash proves it is the same content. Dirty or hash-mismatched blocks
      // keep their original CAS base and will still conflict normally.
      heads.forEach((head, key) => {
        if (patchedKeys.has(key)) return;
        const current = blocks.get(key);
        if (!current || current.deleted || dirtyKeys.has(key) || saveAcknowledgementGaps.has(key)) return;
        if (!Number.isInteger(head?.revision)) return;
        const localHash = String(current.contentHash || '');
        const authoritativeHash = String(head.contentHash || '');
        if (!localHash || !authoritativeHash || localHash !== authoritativeHash) return;
        if (head.revision < Number(current.revision || 0)) return;
        current.revision = head.revision;
        current.contentHash = authoritativeHash;
        readConsistency.inconsistentBlockKeys = readConsistency.inconsistentBlockKeys
          .filter(blockKey => blockKey !== key);
        delete readConsistency[key];
      });
      publicationCheck = null;
      return true;
    }

    function failSave(token) {
      if (!activeIntent || activeIntent.token !== token) return false;
      failedIntent = { request: clone(activeIntent.request), fingerprints: clone(activeIntent.fingerprints) };
      activeIntent = null;
      publicationCheck = null;
      return true;
    }

    function setPublicationCheck(result) {
      if (!result || Number(result.checkedDraftRevision) !== revision || dirtyKeys.size) {
        publicationCheck = null;
        return false;
      }
      publicationCheck = clone(result);
      return true;
    }

    function acknowledgeLifecycle(result = {}) {
      if (Number.isInteger(result.revision) && result.revision >= revision) revision = result.revision;
      publicationCheck = null;
    }

    function getSnapshot() {
      return {
        draftId, revision,
        blocks: [...blocks.values()].map(clone),
        dirtyBlockKeys: [...dirtyKeys].sort(),
        saving: Boolean(activeIntent),
        retryPending: Boolean(failedIntent),
        publicationCheck: clone(publicationCheck),
        readConsistency: clone(readConsistency),
        saveAcknowledgementGaps: [...saveAcknowledgementGaps].sort(),
      };
    }

    return Object.freeze({
      load, getBlock, setBlock, deleteBlock, beginSave, acknowledgeSave, failSave,
      setPublicationCheck, acknowledgeLifecycle, getSnapshot,
    });
  }

  return Object.freeze({
    CORE_BLOCK_TYPES,
    createBlankCoreBlocks,
    createSafeEntityId,
    createSimulatorEditorState,
  });
}));
