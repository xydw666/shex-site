(function initCharacterProfileDataCore(global, factory) {
  const migration = typeof module !== 'undefined' && module.exports
    ? require('./character-profile-migration.js')
    : global?.SHEXCharacterProfileMigration;
  const profileSync = typeof module !== 'undefined' && module.exports
    ? require('./character-profile-sync.js')
    : global?.SHEXCharacterProfileSync;
  const api = factory(migration, profileSync);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.SHEXCharacterProfileDataCore = api;
})(typeof window !== 'undefined' ? window : globalThis, function createCharacterProfileDataCore(migration, profileSync) {
  'use strict';

  const STORAGE_MODE = 'character-v3-with-persona-v2-projection';

  function requireMigration() {
    if (!migration?.normalizePersonaV2 || !migration?.normalizeDatingUserProfileV1
      || !migration?.normalizeCharacterProfileV3 || !migration?.resolveCharacterProfileV3
      || !migration?.normalizeRelationshipProfileV1 || !migration?.resolveRelationshipProfileV1
      || !migration?.normalizeStoryOpeningV1
      || !migration?.normalizeUserRelationProfileV1 || !migration?.resolveUserRelationProfileV1
      || !migration?.projectCharacterV3ToPersonaV2 || !migration?.applyPersonaV2ToCharacterV3) {
      throw Object.assign(new Error('角色资料迁移模块未加载'), { code: 'CHARACTER_PROFILE_MIGRATION_MISSING' });
    }
    return migration;
  }

  function requireProfileSync() {
    if (!profileSync?.getGroupState || !profileSync?.touchGroup) {
      throw Object.assign(new Error('角色资料同步模块未加载'), { code: 'CHARACTER_PROFILE_SYNC_MISSING' });
    }
    return profileSync;
  }

  function findDream(state, dreamId = '') {
    const dreams = Array.isArray(state?.dreams) ? state.dreams : [];
    const requestedId = String(dreamId || '').trim();
    if (requestedId) {
      return dreams.find((item) => String(item?.id || '') === requestedId) || null;
    }
    const currentId = String(state?.currentDreamId || '').trim();
    if (currentId) {
      return dreams.find((item) => String(item?.id || '') === currentId) || null;
    }
    return dreams[0] || null;
  }

  function normalizePersonaV2(profile = {}, options = {}) {
    return requireMigration().normalizePersonaV2(profile, options);
  }

  function normalizeDatingUserProfileV1(profile = {}, options = {}) {
    return requireMigration().normalizeDatingUserProfileV1(profile, options);
  }

  function normalizeCharacterProfileV3(profile = {}, options = {}) {
    return requireMigration().normalizeCharacterProfileV3(profile, options);
  }

  function normalizeRelationshipProfileV1(profile = {}, options = {}) {
    return requireMigration().normalizeRelationshipProfileV1(profile, options);
  }

  function normalizeStoryOpeningV1(opening = {}, options = {}) {
    return requireMigration().normalizeStoryOpeningV1(opening, options);
  }

  function normalizeUserRelationProfileV1(profile = {}, options = {}) {
    return requireMigration().normalizeUserRelationProfileV1(profile, options);
  }

  function createDataApi(dependencies = {}) {
    const readState = dependencies.readState;
    const updateState = dependencies.updateState;
    const sync = dependencies.sync;
    const saveGroupCloud = dependencies.saveGroup;
    const resolveConflictCloud = dependencies.resolveConflict;
    const getCloudStatus = dependencies.getCloudStatus;
    const withLocalWrite = dependencies.withLocalWrite;
    const notify = dependencies.notify;
    const now = typeof dependencies.now === 'function' ? dependencies.now : Date.now;
    if (typeof readState !== 'function' || typeof updateState !== 'function') {
      throw new TypeError('角色资料数据模块缺少readState或updateState');
    }

    const toast = (message) => {
      if (typeof notify === 'function' && message) notify(message);
    };
    const syncAfterSave = async (message) => {
      if (typeof sync === 'function') {
        const result = await sync(message);
        return result !== false;
      }
      return false;
    };
    const performUpdate = (mutator) => typeof withLocalWrite === 'function'
      ? withLocalWrite(() => updateState(mutator))
      : updateState(mutator);
    // 将读取基线、本机修改、云端提交和权威回写作为一次局部保存排队。
    let profileSaveChain = Promise.resolve();
    const queueSave = (operation) => (...args) => {
      const captured = args.map(value => value && typeof value === 'object'
        ? JSON.parse(JSON.stringify(value)) : value);
      const task = profileSaveChain.then(() => operation(...captured));
      profileSaveChain = task.catch(() => undefined);
      return task;
    };

    // ---- X103 自动合并保存链 ----
    // 版本对不上时不再让用户选版本或重新打开：把"这次改了哪些字段"套到云端最新资料上再保存。
    const META_FIELD = 'profileSyncMeta';
    const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
    const isPlain = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
    const cloneValue = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
    const stable = (value) => {
      if (value === undefined) return '\u0000undefined';
      const stringify = requireProfileSync().stableStringify;
      return typeof stringify === 'function' ? stringify(value) : JSON.stringify(value);
    };
    const sameValue = (left, right) => stable(left) === stable(right);
    const isKeyedList = (list) => Array.isArray(list) && list.every((item) => isPlain(item)
      && (typeof item.id === 'string' || typeof item.id === 'number') && String(item.id));

    function rebaseKeyedList(base, edited, latest) {
      const byId = (list) => new Map(list.map((item) => [String(item.id), item]));
      const baseMap = byId(base);
      const editedMap = byId(edited);
      const latestMap = byId(latest);
      const result = [];
      latest.forEach((item) => {
        const id = String(item.id);
        if (editedMap.has(id)) result.push(rebaseValue(baseMap.get(id), editedMap.get(id), item));
        else if (!baseMap.has(id)) result.push(cloneValue(item));
        // 基线里有、这次编辑删掉的条目：按本次删除处理。
      });
      edited.forEach((item) => {
        const id = String(item.id);
        if (latestMap.has(id)) return;
        // 云端已删除且本次没改过它：跟随云端删除；本次新增或改过的条目保留。
        if (baseMap.has(id) && sameValue(baseMap.get(id), item)) return;
        result.push(cloneValue(item));
      });
      return result;
    }

    // 三方合并：base=编辑开始时的资料，edited=用户提交的资料，latest=当前最新资料。
    // 用户没动过的字段跟随 latest；用户改过的字段以本次修改为准。
    function rebaseValue(base, edited, latest) {
      if (sameValue(base, edited)) return cloneValue(latest);
      if (sameValue(base, latest) || sameValue(edited, latest)) return cloneValue(edited);
      if (isPlain(edited) && isPlain(latest)) {
        const origin = isPlain(base) ? base : {};
        const result = {};
        Array.from(new Set([...Object.keys(latest), ...Object.keys(edited)])).forEach((key) => {
          const inEdited = hasOwn(edited, key);
          const inLatest = hasOwn(latest, key);
          const inBase = hasOwn(origin, key);
          const untouched = inEdited === inBase && (!inEdited || sameValue(origin[key], edited[key]));
          if (untouched) {
            if (inLatest) result[key] = cloneValue(latest[key]);
            return;
          }
          if (!inEdited) return;
          result[key] = inLatest
            ? rebaseValue(inBase ? origin[key] : undefined, edited[key], latest[key])
            : cloneValue(edited[key]);
        });
        return result;
      }
      if (Array.isArray(base) && Array.isArray(edited) && Array.isArray(latest)
        && isKeyedList(base) && isKeyedList(edited) && isKeyedList(latest)) {
        return rebaseKeyedList(base, edited, latest);
      }
      return cloneValue(edited);
    }

    // 合并前先把三份资料整理成同一种结构：旧版只有人设 V2 的资料会被补成 V3，
    // 否则"基线里没有这个字段"会被误判成"用户改了所有字段"，把别处的更新整片盖掉。
    function materializeGroupValue(group, value) {
      if (!isPlain(value)) return cloneValue(value);
      try {
        const scratch = {};
        requireProfileSync().applyGroupValue(scratch, group, cloneValue(value));
        if (group === 'personaProfile') {
          const stamp = Number(scratch.characterProfile?.updatedAt || scratch.personaProfile?.updatedAt || 0) || now();
          const character = requireMigration().resolveCharacterProfileV3(scratch, { now: stamp });
          scratch.characterProfile = character;
          scratch.personaProfile = requireMigration().projectCharacterV3ToPersonaV2(character, {
            personaProfile: scratch.personaProfile,
            relationship: scratch.personaProfile?.relationship,
            now: character.updatedAt
          });
          if (!scratch.name && character.basic?.displayName) scratch.name = character.basic.displayName;
        } else if (group === 'datingUserProfile' && isPlain(scratch.datingUserProfile)) {
          scratch.datingUserProfile = normalizeDatingUserProfileV1(scratch.datingUserProfile, {
            now: Number(scratch.datingUserProfile.updatedAt || 0) || now()
          });
        }
        return cloneValue(requireProfileSync().groupValue(scratch, group));
      } catch (_) {
        return cloneValue(value);
      }
    }

    // 合并完成后让人设 V2 兼容投影与 V3 正文保持一致。
    function finalizeMergedValue(group, value) {
      if (group !== 'personaProfile' || !isPlain(value?.characterProfile)) return value;
      try {
        const scratch = {};
        requireProfileSync().applyGroupValue(scratch, group, cloneValue(value));
        scratch.personaProfile = requireMigration().projectCharacterV3ToPersonaV2(scratch.characterProfile, {
          personaProfile: scratch.personaProfile,
          relationship: scratch.personaProfile?.relationship,
          now: scratch.characterProfile.updatedAt
        });
        return cloneValue(requireProfileSync().groupValue(scratch, group));
      } catch (_) {
        return value;
      }
    }

    const mergeGroupValues = (group, base, edited, latest) => finalizeMergedValue(group, rebaseValue(
      materializeGroupValue(group, base), materializeGroupValue(group, edited), materializeGroupValue(group, latest)
    ));

    // 没有共同基线可参考时的两份资料合并：内容不同以较新的一份为准，
    // 但较新的一份留空而另一份有内容时保留内容，避免整段资料被空值顶掉。
    const isEmptyValue = (value) => value == null || value === ''
      || (Array.isArray(value) && !value.length) || (isPlain(value) && !Object.keys(value).length);
    function unionValue(newer, older) {
      if (sameValue(newer, older)) return cloneValue(newer);
      if (isPlain(newer) && isPlain(older)) {
        const result = {};
        Array.from(new Set([...Object.keys(older), ...Object.keys(newer)])).forEach((key) => {
          if (!hasOwn(newer, key)) result[key] = cloneValue(older[key]);
          else if (!hasOwn(older, key)) result[key] = cloneValue(newer[key]);
          else result[key] = unionValue(newer[key], older[key]);
        });
        return result;
      }
      if (Array.isArray(newer) && Array.isArray(older) && newer.length && older.length
        && isKeyedList(newer) && isKeyedList(older)) {
        const olderMap = new Map(older.map((item) => [String(item.id), item]));
        const seen = new Set(newer.map((item) => String(item.id)));
        return [
          ...newer.map((item) => olderMap.has(String(item.id)) ? unionValue(item, olderMap.get(String(item.id))) : cloneValue(item)),
          ...older.filter((item) => !seen.has(String(item.id))).map(cloneValue)
        ];
      }
      if (isEmptyValue(newer) && !isEmptyValue(older)) return cloneValue(older);
      return cloneValue(newer);
    }

    const groupKey = (dreamId, group) => `${String(dreamId || '')}\u0000${String(group || '')}`;
    // 尚未同步到云端的资料组：记住第一次本机修改之前的基线，后续保存与自动重试都以它为准。
    const pendingBases = new Map();
    // 可选的本机持久化：页面刷新或重开后，未同步的修改仍会被继续提交。
    const pendingStore = dependencies.pendingStore;
    const PENDING_MAX_AGE = 14 * 24 * 60 * 60 * 1000;
    const persistPending = () => {
      if (typeof pendingStore?.save !== 'function') return;
      try {
        pendingStore.save(Array.from(pendingBases.entries()).map(([key, value]) => {
          const [dreamId, group] = key.split('\u0000');
          return { dreamId, group, base: value, at: Number(value?.pendingAt || 0) };
        }));
      } catch (_) {}
    };
    const markPending = (key, value) => {
      if (pendingBases.has(key)) return;
      pendingBases.set(key, { ...value, pendingAt: now() });
      persistPending();
    };
    const clearPending = (key) => {
      if (pendingBases.delete(key)) persistPending();
    };
    try {
      const stored = typeof pendingStore?.load === 'function' ? pendingStore.load() : [];
      (Array.isArray(stored) ? stored : []).forEach((item) => {
        if (!item?.dreamId || !item?.group || !isPlain(item.base)) return;
        if (now() - Number(item.at || 0) > PENDING_MAX_AGE) return;
        pendingBases.set(groupKey(item.dreamId, item.group), item.base);
      });
    } catch (_) {}
    const retryAttempts = new Map();
    const retryTimers = new Set();
    const RETRY_DELAYS = Array.isArray(dependencies.retryDelays) ? dependencies.retryDelays : [4000, 15000, 60000];
    const TRANSIENT_DELAY = Number.isFinite(dependencies.transientRetryDelayMs) ? dependencies.transientRetryDelayMs : 400;
    const setTimer = typeof dependencies.setTimeout === 'function'
      ? dependencies.setTimeout
      : (typeof setTimeout === 'function' ? setTimeout : null);
    const wait = (ms) => new Promise((resolve) => {
      if (!setTimer || ms <= 0) { resolve(); return; }
      setTimer(resolve, ms);
    });
    // 每个资料组最近若干个版本的内容：编辑面板打开时读过的版本即使被后台同步顶掉，仍能找回基线。
    const groupHistory = new Map();
    const rememberGroupVersion = (dreamId, group, revision, value) => {
      const key = `${groupKey(dreamId, group)}\u0000${Number(revision || 0)}`;
      if (groupHistory.has(key)) return;
      groupHistory.set(key, cloneValue(value));
      if (groupHistory.size > 120) groupHistory.delete(groupHistory.keys().next().value);
    };
    const HARD_FAILURE_CODES = new Set([
      'DREAM_PROFILE_DELETED', 'DREAM_PROFILE_DREAM_NOT_FOUND', 'PROFILE_DREAM_NOT_FOUND',
      'DREAM_PROFILE_GROUP_INVALID', 'DREAM_PROFILE_TOO_LARGE', 'DREAM_PROFILE_NAME_INVALID',
      'DREAM_PROFILE_PROTOCOL_INVALID', 'DREAM_PROFILE_STORAGE_READONLY', 'DREAM_PROFILE_STORAGE_DISABLED',
      'DREAM_PROFILE_BASE_REQUIRED', 'DREAM_PROFILE_STORAGE_UNAVAILABLE', 'CHARACTER_PROFILE_SYNC_MISSING'
    ]);
    const DELETED_CODES = ['DREAM_PROFILE_DELETED', 'DREAM_PROFILE_DREAM_NOT_FOUND', 'PROFILE_DREAM_NOT_FOUND'];
    const isHardFailure = (error) => HARD_FAILURE_CODES.has(String(error?.code || ''));
    const codeError = (code, message = '') => Object.assign(new Error(message || code), { code });

    function captureGroupBase(dreamId, group) {
      const dream = findDream(readState(), dreamId);
      if (!dream) return null;
      const state = requireProfileSync().getGroupState(dream, group) || {};
      const value = requireProfileSync().groupValue(dream, group);
      const cloudStatus = typeof getCloudStatus === 'function' ? getCloudStatus(dreamId) : {};
      const valueHash = requireProfileSync().groupHash(value, group);
      const meta = dream[META_FIELD]?.groups?.[group] || {};
      rememberGroupVersion(dreamId, group, state.revision, value);
      return {
        group,
        baseGroupRevision: Number(state.revision || 0),
        baseValueHash: valueHash,
        baseDocumentRevision: Number(cloudStatus?.revision || 0),
        baseValue: cloneValue(value),
        // 本机资料已知的全部历史版本：云端版本若在其中，说明本机只是"领先"，不需要合并。
        baseHashes: [valueHash, String(meta.valueHash || ''), ...(Array.isArray(meta.ancestors) ? meta.ancestors : [])]
          .map((item) => String(item || '')).filter(Boolean)
      };
    }

    // 本组若还有未同步的旧修改，沿用最早的基线，避免把那次修改当成"云端没有的旧值"丢掉。
    function editBase(dreamId, group) {
      const fresh = captureGroupBase(dreamId, group);
      return pendingBases.get(groupKey(dreamId, group)) || fresh;
    }

    function afterGroupApplied(target, group) {
      if (group === 'personaProfile' && target.name) target.nickname = target.name;
    }

    function dropOpenConflicts(target, group, replacement = []) {
      const retained = (Array.isArray(target.profileSyncConflicts) ? target.profileSyncConflicts : [])
        .filter((item) => item?.group !== group);
      const remote = (Array.isArray(replacement) ? replacement : []).filter((item) => item?.group === group);
      if (retained.length || remote.length) target.profileSyncConflicts = [...retained, ...remote];
      else delete target.profileSyncConflicts;
    }

    function makeApplyResult(dreamId, group) {
      return (response) => {
        if (!response?.storedGroup) return false;
        // 旧后端在版本不一致时会回传"云端旧值"；此时不能写回本机，否则会冲掉本次修改。
        if (response.conflictCreated === true || response.revisionConflict === true) return true;
        if (!findDream(readState(), dreamId)) return false;
        return performUpdate((draft) => {
          const target = findDream(draft, dreamId);
          if (!target) return;
          requireProfileSync().applyStoredGroup(target, group, response.storedGroup);
          afterGroupApplied(target, group);
          dropOpenConflicts(target, group, response.conflicts);
        });
      };
    }

    // 旧后端留下的整组冲突：静默保留云端当前版本，随后再把本次修改合并上去。
    async function settleCloudConflicts(dreamId, group, conflicts, documentRevision) {
      const open = (Array.isArray(conflicts) ? conflicts : [])
        .filter((item) => item?.group === group && item.resolved !== true && item.id);
      if (!open.length || typeof resolveConflictCloud !== 'function') return null;
      const conflict = open[0];
      const selectedHash = String(conflict.selectedHash || conflict.candidateA?.hash || conflict.candidateB?.hash || '');
      if (!selectedHash) return null;
      return resolveConflictCloud({
        dreamId,
        conflictId: conflict.id,
        selectedHash,
        expectedDocumentRevision: Number(documentRevision || 0)
      });
    }

    function writeRebasedGroup(dreamId, group, latest, merged) {
      return performUpdate((draft) => {
        const target = findDream(draft, dreamId);
        if (!target) return;
        requireProfileSync().applyStoredGroup(target, group, {
          value: merged,
          revision: Number(latest.revision || 0) + 1,
          updatedAt: now(),
          valueHash: '',
          ancestors: [latest.valueHash, ...(Array.isArray(latest.ancestors) ? latest.ancestors : [])]
        });
        afterGroupApplied(target, group);
        target.updatedAt = now();
        dropOpenConflicts(target, group);
      });
    }

    // 把本机某个资料组提交到云端；基线过期时自动合并并重试，网络抖动时自动重发。
    async function pushGroup(dreamId, base) {
      const group = base.group;
      let request = {
        baseGroupRevision: Number(base.baseGroupRevision || 0),
        baseValueHash: String(base.baseValueHash || ''),
        baseDocumentRevision: Number(base.baseDocumentRevision || 0)
      };
      let baseValue = base.baseValue;
      let knownHashes = new Set(Array.isArray(base.baseHashes) && base.baseHashes.length ? base.baseHashes : [request.baseValueHash]);
      let transientLeft = 2;
      let rebased = false;
      for (let round = 0; round < 6; round += 1) {
        const dream = findDream(readState(), dreamId);
        if (!dream) throw codeError('PROFILE_DREAM_NOT_FOUND');
        const edited = cloneValue(requireProfileSync().groupValue(dream, group));
        let response;
        try {
          response = await saveGroupCloud({
            dreamId, dream, group, ...request, autoRebase: true, applyResult: makeApplyResult(dreamId, group)
          });
        } catch (error) {
          if (isHardFailure(error) || transientLeft <= 0) throw error;
          transientLeft -= 1;
          await wait(TRANSIENT_DELAY * (2 - transientLeft));
          continue;
        }
        if (response?.revisionConflict === true || response?.conflictCreated === true) {
          let latest = response.storedGroup;
          let documentRevision = Number(response.documentRevision || 0);
          if (!latest) throw codeError('PROFILE_SYNC_PENDING');
          if (response.conflictCreated === true) {
            const settled = await settleCloudConflicts(dreamId, group, response.conflicts, documentRevision);
            if (settled?.storedGroup) {
              latest = settled.storedGroup;
              documentRevision = Number(settled.documentRevision || documentRevision);
            }
          }
          const latestHash = String(latest.valueHash || '');
          const latestHashes = new Set([latestHash, ...(Array.isArray(latest.ancestors) ? latest.ancestors : [])].filter(Boolean));
          // 冲突结案后的提交：本机资料由两份候选合并而来，云端若是其中一份的后续版本，就以那一份为基线。
          const viaCandidate = !rebased && Array.isArray(base.baseCandidates)
            ? base.baseCandidates.find((item) => latestHashes.has(String(item?.hash || '')))
            : null;
          if (viaCandidate) baseValue = viaCandidate.value;
          const merged = knownHashes.has(latestHash)
            ? edited
            : mergeGroupValues(group, baseValue, edited, cloneValue(latest.value) || {});
          if (!writeRebasedGroup(dreamId, group, latest, merged)) throw codeError('PROFILE_LOCAL_SAVE_FAILED');
          request = {
            baseGroupRevision: Number(latest.revision || 0),
            baseValueHash: latestHash,
            baseDocumentRevision: documentRevision
          };
          rebased = true;
          baseValue = cloneValue(latest.value);
          knownHashes = new Set([latestHash, ...(Array.isArray(latest.ancestors) ? latest.ancestors : [])].filter(Boolean));
          continue;
        }
        if (!response?.storedGroup || response.ok === false) throw codeError('PROFILE_SYNC_PENDING');
        const applied = hasOwn(response, 'localApplied')
          ? response.localApplied
          : makeApplyResult(dreamId, group)(response);
        return applied !== false;
      }
      throw codeError('PROFILE_GROUP_REVISION_CONFLICT');
    }

    function scheduleRetry(dreamId, group) {
      const key = groupKey(dreamId, group);
      const attempts = retryAttempts.get(key) || 0;
      if (!setTimer || attempts >= RETRY_DELAYS.length || retryTimers.has(key)) return;
      retryAttempts.set(key, attempts + 1);
      retryTimers.add(key);
      const timer = setTimer(() => {
        retryTimers.delete(key);
        retryPendingGroup(dreamId, group).catch(() => undefined);
      }, RETRY_DELAYS[attempts]);
      if (timer && typeof timer.unref === 'function') timer.unref();
    }

    const retryPendingGroup = queueSave(async (dreamId, group) => {
      const key = groupKey(dreamId, group);
      const base = pendingBases.get(key);
      if (!base) return true;
      if (!findDream(readState(), dreamId)) {
        // 待提交清单按账号隔离：梦角已不在本机，说明它已被删除，这条记录不再需要。
        clearPending(key);
        retryAttempts.delete(key);
        return true;
      }
      try {
        await pushGroup(dreamId, base);
        clearPending(key);
        retryAttempts.delete(key);
        return true;
      } catch (error) {
        if (DELETED_CODES.includes(String(error?.code || ''))) {
          clearPending(key);
          retryAttempts.delete(key);
        } else if (!isHardFailure(error)) scheduleRetry(dreamId, group);
        return false;
      }
    });

    // 网络恢复、页面回到前台等时机可调用：把所有尚未同步的资料组立即再提交一次。
    async function retryPendingSaves() {
      const keys = Array.from(pendingBases.keys());
      let allSynced = true;
      for (const key of keys) {
        const [dreamId, group] = key.split('\u0000');
        retryAttempts.delete(key);
        if (!(await retryPendingGroup(dreamId, group))) allSynced = false;
      }
      return allSynced;
    }

    let lastSaveOutcome = Object.freeze({
      ok: true,
      localSaved: false,
      cloudSynced: false,
      code: 'PROFILE_SAVE_IDLE',
      dreamId: '',
      group: '',
      revision: 0
    });
    const rememberSaveOutcome = (value = {}) => {
      lastSaveOutcome = Object.freeze({
        ok: value.ok === true,
        localSaved: value.localSaved === true,
        cloudSynced: value.cloudSynced === true,
        code: String(value.code || ''),
        dreamId: String(value.dreamId || ''),
        group: String(value.group || ''),
        revision: Math.max(0, Math.floor(Number(value.revision || 0)) || 0)
      });
      return lastSaveOutcome;
    };
    const getLastSaveOutcome = () => Object.freeze({ ...lastSaveOutcome });
    const rememberRejectedSave = (dreamId, group, code) => {
      rememberSaveOutcome({ ok: false, localSaved: false, cloudSynced: false, code, dreamId, group });
      return false;
    };
    const finishSavedSync = async (dreamId, group, successMessage, bases = [], behavior = {}) => {
      let synced = false;
      let failure = null;
      const entries = (Array.isArray(bases) ? bases : [bases]).filter(Boolean);
      if (typeof saveGroupCloud === 'function' && entries.length) {
        let legacy = false;
        synced = true;
        for (const base of entries) {
          const key = groupKey(dreamId, base.group);
          try {
            if (!(await pushGroup(dreamId, base))) synced = false;
            clearPending(key);
            retryAttempts.delete(key);
          } catch (error) {
            const cloudState = typeof getCloudStatus === 'function' ? getCloudStatus(dreamId) : { status: 'legacy' };
            if (cloudState?.status === 'legacy') { legacy = true; break; }
            synced = false;
            failure = failure || error;
            // 只要修改还留在本机而云端没收到，就记住原始基线：之后的保存、改名、重试都以它为准，
            // 不会把这次修改误当成"没动过的旧值"而撤销。
            if (!DELETED_CODES.includes(String(error?.code || ''))) {
              markPending(key, base);
              if (!isHardFailure(error)) scheduleRetry(dreamId, base.group);
            }
          }
        }
        if (legacy) {
          try { synced = await syncAfterSave(successMessage); } catch (_) { synced = false; }
        } else if (synced && successMessage) toast(successMessage);
      } else {
        try { synced = await syncAfterSave(successMessage); } catch (_) { synced = false; }
      }
      const revision = Number(groupState(dreamId, group)?.revision || 0);
      if (!synced) {
        const deleted = DELETED_CODES.includes(String(failure?.code || ''));
        rememberSaveOutcome({
          ok: false,
          localSaved: true,
          cloudSynced: false,
          code: deleted ? String(failure.code) : 'PROFILE_SYNC_PENDING',
          dreamId,
          group,
          revision
        });
        if (behavior.silent !== true) {
          toast(deleted
            ? '这位梦角已被删除，资料没有保存'
            : '资料已保存在本机，但尚未同步到云端，系统会继续重试');
        }
        return false;
      }
      rememberSaveOutcome({
        ok: true,
        localSaved: true,
        cloudSynced: true,
        code: 'PROFILE_SAVE_COMPLETE',
        dreamId,
        group,
        revision
      });
      return true;
    };

    // 编辑面板基于旧版本提交时：把"面板打开后用户改动的字段"套到本机最新资料上，其余字段保持最新。
    let activeEdit = null;
    function buildEditContext(dreamId, group, options = {}) {
      if (!hasOwn(options, 'baseRevision')) return null;
      const dream = findDream(readState(), dreamId);
      if (!dream) return null;
      const state = requireProfileSync().getGroupState(dream, group);
      const baseRevision = Math.max(0, Math.floor(Number(options.baseRevision || 0)) || 0);
      if (!state) return null;
      const key = `${groupKey(dreamId, group)}\u0000${baseRevision}`;
      if (!groupHistory.has(key)) return null;
      const baseValue = groupHistory.get(key);
      const localValue = cloneValue(requireProfileSync().groupValue(dream, group));
      // 版本号相同但内容已被后台同步换过的情况也要合并，所以比较内容而不是只比较版本号。
      if (sameValue(baseValue, localValue)) return null;
      return { [group]: { baseValue, localValue } };
    }

    function touchEdited(target, group, updatedAt) {
      const context = activeEdit?.[group];
      if (context) {
        const merged = mergeGroupValues(group, context.baseValue, requireProfileSync().groupValue(target, group), context.localValue);
        requireProfileSync().applyGroupValue(target, group, merged);
        afterGroupApplied(target, group);
      }
      return requireProfileSync().touchGroup(target, group, updatedAt);
    }

    // 所有资料保存入口统一经过这里：先静默清掉历史冲突，再按上面的规则自动合并，不再拒绝保存。
    const editSetter = (group, operation) => async (dreamId = '', profile = {}, options = {}) => {
      const safeOptions = { ...(isPlain(options) ? options : {}) };
      if (findDream(readState(), dreamId)) {
        try { await settleConflicts(dreamId, null); } catch (_) {}
      }
      activeEdit = buildEditContext(dreamId, group, safeOptions);
      delete safeOptions.baseRevision;
      safeOptions.resolveConflict = true;
      try {
        return await operation(dreamId, profile, safeOptions);
      } finally {
        activeEdit = null;
      }
    };

    function groupState(dreamId = '', groupName = '') {
      const dream = findDream(readState(), dreamId);
      return dream ? requireProfileSync().getGroupState(dream, groupName) : null;
    }

    function saveAllowed(dream, groupName, options = {}) {
      if (!dream) return { ok: false, code: 'PROFILE_DREAM_NOT_FOUND' };
      const state = requireProfileSync().getGroupState(dream, groupName);
      if (!state) return { ok: false, code: 'PROFILE_GROUP_UNKNOWN' };
      if (state.hasConflict && options.resolveConflict !== true) {
        return { ok: false, code: 'PROFILE_GROUP_CONFLICT_UNRESOLVED', currentRevision: state.revision };
      }
      if (Object.prototype.hasOwnProperty.call(options, 'baseRevision')) {
        const baseRevision = Math.max(0, Math.floor(Number(options.baseRevision || 0)) || 0);
        if (baseRevision !== state.revision) {
          return { ok: false, code: 'PROFILE_GROUP_REVISION_CONFLICT', currentRevision: state.revision };
        }
      }
      return { ok: true, currentRevision: state.revision };
    }

    function notifyConflict() {
      toast('这份资料的版本已有变化，请核对最新资料后再保存');
    }

    function notifySaveRejected(permission = {}) {
      if (permission.code === 'PROFILE_DREAM_NOT_FOUND') {
        toast('找不到当前梦角，资料没有保存');
        return;
      }
      notifyConflict();
    }

    function getPersonaV2(dreamId = '') {
      const dream = findDream(readState(), dreamId);
      if (!dream) return null;
      if (!dream.characterProfile || typeof dream.characterProfile !== 'object') {
        return dream.personaProfile && typeof dream.personaProfile === 'object'
          ? normalizePersonaV2(dream.personaProfile, { now: now() })
          : null;
      }
      const character = requireMigration().resolveCharacterProfileV3(dream, { now: now() });
      return requireMigration().projectCharacterV3ToPersonaV2(character, {
        personaProfile: dream.personaProfile,
        relationship: dream.personaProfile?.relationship,
        now: character.updatedAt
      });
    }

    function getCharacterProfileV3(dreamId = '') {
      const dream = findDream(readState(), dreamId);
      return dream ? requireMigration().resolveCharacterProfileV3(dream, { now: now() }) : null;
    }

    async function setCharacterDisplayName(dreamId = '', name = '') {
      const displayName = String(name || '').trim();
      if (!displayName || displayName.length > 80) {
        toast('请填写1至80字的梦角名字');
        return rememberRejectedSave(dreamId, 'personaProfile', 'DREAM_PROFILE_NAME_INVALID');
      }
      if (!findDream(readState(), dreamId)) {
        toast('这位梦角已不存在，名字没有保存');
        return rememberRejectedSave(dreamId, 'personaProfile', 'PROFILE_DREAM_NOT_FOUND');
      }
      // 整组保存路径：只改名字这一个字段，其余字段在版本变化时自动跟随最新资料。
      const saveNameThroughGroup = async () => {
        const current = getCharacterProfileV3(dreamId);
        if (!current) {
          toast('这位梦角已不存在，名字没有保存');
          return rememberRejectedSave(dreamId, 'personaProfile', 'PROFILE_DREAM_NOT_FOUND');
        }
        const ok = await setCharacterProfileV3(dreamId, { ...current,
          basic: { ...current.basic, displayName } }, { resolveConflict: true, successMessage: '名字已保存' });
        return ok;
      };
      // 离线/旧存储，或本组还有未同步的修改时，直接走整组保存，避免云端旧资料盖回本机。
      if (typeof saveGroupCloud !== 'function' || pendingBases.has(groupKey(dreamId, 'personaProfile'))) {
        return saveNameThroughGroup();
      }
      let base = captureGroupBase(dreamId, 'personaProfile');
      const applyResult = makeApplyResult(dreamId, 'personaProfile');
      let transientLeft = 2;
      try {
        for (let attempt = 0; attempt < 5; attempt++) {
          let response;
          try {
            response = await saveGroupCloud({ dreamId, displayName, group: 'personaProfile',
              baseDocumentRevision: base.baseDocumentRevision, baseGroupRevision: base.baseGroupRevision,
              baseValueHash: base.baseValueHash, applyResult });
          } catch (error) {
            if (isHardFailure(error) || transientLeft <= 0) throw error;
            transientLeft -= 1;
            await wait(TRANSIENT_DELAY * (2 - transientLeft));
            continue;
          }
          if (response?.revisionConflict) {
            // 旧后端要求基线一致：换成它回传的最新基线后自动重试，不需要用户再点一次。
            if (!response.storedGroup) throw codeError('PROFILE_SYNC_PENDING');
            base = { group: 'personaProfile', baseDocumentRevision: Number(response.documentRevision || 0),
              baseGroupRevision: Number(response.storedGroup.revision || 0),
              baseValueHash: response.storedGroup.valueHash };
            continue;
          }
          if (!response?.storedGroup || response.ok === false) throw codeError('PROFILE_SYNC_PENDING');
          if (!findDream(readState(), dreamId)) {
            toast('这位梦角已不存在，名字没有写回本机');
            return rememberRejectedSave(dreamId, 'personaProfile', 'PROFILE_DREAM_NOT_FOUND');
          }
          const saved = hasOwn(response, 'localApplied') ? response.localApplied : applyResult(response);
          if (saved === false) throw codeError('PROFILE_LOCAL_SAVE_FAILED');
          rememberSaveOutcome({ ok: true, localSaved: true, cloudSynced: true, code: 'PROFILE_SAVE_COMPLETE',
            dreamId, group: 'personaProfile', revision: response.storedGroup.revision });
          toast('名字已保存');
          return true;
        }
        throw codeError('PROFILE_GROUP_REVISION_CONFLICT');
      } catch (error) {
        if (DELETED_CODES.includes(String(error?.code || ''))) {
          toast('这位梦角已被删除，名字没有保存');
          return rememberRejectedSave(dreamId, 'personaProfile', error.code);
        }
        if (error?.code === 'DREAM_PROFILE_NAME_INVALID') {
          toast('请填写1至80字的梦角名字');
          return rememberRejectedSave(dreamId, 'personaProfile', error.code);
        }
        // 局部改名没有成功（旧后端不支持、网络异常、版本一直在变）：改走整组保存。
        // 名字先落在本机，云端由自动合并与后台重试负责，不再要求用户重新操作。
        if (!findDream(readState(), dreamId)) {
          toast('这位梦角已不存在，名字没有保存');
          return rememberRejectedSave(dreamId, 'personaProfile', 'PROFILE_DREAM_NOT_FOUND');
        }
        return saveNameThroughGroup();
      }
    }

    async function setCharacterProfileV3(dreamId = '', profile = {}, options = {}) {
      const savedAt = now();
      const before = findDream(readState(), dreamId);
      const bases = [editBase(dreamId, 'personaProfile')];
      const permission = saveAllowed(before, 'personaProfile', options);
      if (!permission.ok) {
        notifySaveRejected(permission);
        return rememberRejectedSave(dreamId, 'personaProfile', permission.code);
      }
      const saved = performUpdate((draft) => {
        const target = findDream(draft, dreamId);
        if (!target) return;
        const current = requireMigration().resolveCharacterProfileV3(target, { now: savedAt });
        const hasIncomingTags = Boolean(profile?.personality
          && Object.prototype.hasOwnProperty.call(profile.personality, 'tags'));
        const incomingTagsChanged = hasIncomingTags
          && JSON.stringify(profile.personality.tags || []) !== JSON.stringify(current.personality.tags || []);
        const normalized = normalizeCharacterProfileV3({
          ...profile,
          basic: {
            ...profile.basic,
            displayName: String(profile.basic?.displayName || current.basic.displayName || target.name || '').trim()
          },
          media: {
            ...profile.media,
            privateAvatarRef: profile.media?.privateAvatarRef || current.media.privateAvatarRef || target.avatar || ''
          },
          compatibility: {
            legacyPersonalityTags: incomingTagsChanged
              ? []
              : (profile.compatibility?.legacyPersonalityTags || current.compatibility.legacyPersonalityTags)
          },
          updatedAt: savedAt
        }, { now: savedAt });
        target.characterProfile = normalized;
        target.personaProfile = requireMigration().projectCharacterV3ToPersonaV2(normalized, {
          personaProfile: target.personaProfile,
          relationship: target.personaProfile?.relationship,
          now: savedAt
        });
        if (normalized.basic.displayName) {
          target.name = normalized.basic.displayName;
          target.nickname = normalized.basic.displayName;
        }
        target.updatedAt = savedAt;
        touchEdited(target, 'personaProfile', savedAt);
      });
      if (!saved) {
        toast('角色资料没有保存成功，请稍后重试');
        return rememberRejectedSave(dreamId, 'personaProfile', 'PROFILE_LOCAL_SAVE_FAILED');
      }
      return await finishSavedSync(dreamId, 'personaProfile', options.successMessage || '角色资料已保存', bases);
    }

    async function setPersonaV2(dreamId = '', profile = {}, options = {}) {
      const savedAt = now();
      const normalized = normalizePersonaV2({ ...profile, updatedAt: savedAt }, { now: savedAt });
      const before = findDream(readState(), dreamId);
      const bases = [editBase(dreamId, 'personaProfile'), editBase(dreamId, 'relationshipProfile')];
      const permission = saveAllowed(before, 'personaProfile', options);
      if (!permission.ok) {
        notifySaveRejected(permission);
        return rememberRejectedSave(dreamId, 'personaProfile', permission.code);
      }
      const saved = performUpdate((draft) => {
        const target = findDream(draft, dreamId);
        if (!target) return;
        const current = requireMigration().resolveCharacterProfileV3(target, { now: savedAt });
        const character = requireMigration().applyPersonaV2ToCharacterV3(current, normalized, {
          now: savedAt,
          displayName: target.name || current.basic.displayName,
          privateAvatarRef: target.avatar || current.media.privateAvatarRef
        });
        target.characterProfile = character;
        target.personaProfile = requireMigration().projectCharacterV3ToPersonaV2(character, {
          relationship: normalized.relationship,
          now: savedAt
        });
        const relationship = requireMigration().resolveRelationshipProfileV1(target, { now: savedAt });
        target.relationshipProfile = requireMigration().normalizeRelationshipProfileV1({
          ...relationship,
          foundation: { ...relationship.foundation, freeform: normalized.relationship },
          updatedAt: savedAt
        }, { now: savedAt });
        target.updatedAt = savedAt;
        touchEdited(target, 'personaProfile', savedAt);
        touchEdited(target, 'relationshipProfile', savedAt);
      });
      if (!saved) {
        toast('人设没有保存成功，请稍后重试');
        return rememberRejectedSave(dreamId, 'personaProfile', 'PROFILE_LOCAL_SAVE_FAILED');
      }
      return await finishSavedSync(dreamId, 'personaProfile', '人设已保存', bases);
    }

    function getRelationshipProfileV1(dreamId = '') {
      const dream = findDream(readState(), dreamId);
      return dream ? requireMigration().resolveRelationshipProfileV1(dream, { now: now() }) : null;
    }

    async function setRelationshipProfileV1(dreamId = '', profile = {}, options = {}) {
      const savedAt = now();
      const before = findDream(readState(), dreamId);
      const bases = [editBase(dreamId, 'relationshipProfile')];
      const permission = saveAllowed(before, 'relationshipProfile', options);
      if (!permission.ok) {
        notifySaveRejected(permission);
        return rememberRejectedSave(dreamId, 'relationshipProfile', permission.code);
      }
      const saved = performUpdate((draft) => {
        const target = findDream(draft, dreamId);
        if (!target) return;
        const current = requireMigration().resolveRelationshipProfileV1(target, { now: savedAt });
        const normalized = normalizeRelationshipProfileV1({
          ...current,
          ...profile,
          foundation: { ...current.foundation, ...profile.foundation, updatedAt: savedAt },
          opening: current.opening,
          updatedAt: savedAt
        }, { now: savedAt });
        target.relationshipProfile = normalized;
        target.personaProfile = {
          ...(target.personaProfile && typeof target.personaProfile === 'object' ? target.personaProfile : {}),
          relationship: normalized.foundation.freeform
        };
        target.updatedAt = savedAt;
        touchEdited(target, 'relationshipProfile', savedAt);
      });
      if (!saved) {
        toast('关系资料没有保存成功，请稍后重试');
        return rememberRejectedSave(dreamId, 'relationshipProfile', 'PROFILE_LOCAL_SAVE_FAILED');
      }
      return await finishSavedSync(dreamId, 'relationshipProfile', '关系资料已保存', bases);
    }

    function getStoryOpeningV1(dreamId = '') {
      const dream = findDream(readState(), dreamId);
      if (!dream) return null;
      const character = requireMigration().resolveCharacterProfileV3(dream, { now: now() });
      return normalizeStoryOpeningV1(character.opening, { now: now() });
    }

    async function setStoryOpeningV1(dreamId = '', opening = {}, options = {}) {
      const savedAt = now();
      const normalized = normalizeStoryOpeningV1({ ...opening, updatedAt: savedAt }, { now: savedAt });
      const before = findDream(readState(), dreamId);
      const bases = [editBase(dreamId, 'personaProfile')];
      const permission = saveAllowed(before, 'personaProfile', options);
      if (!permission.ok) {
        notifySaveRejected(permission);
        return rememberRejectedSave(dreamId, 'personaProfile', permission.code);
      }
      const saved = performUpdate((draft) => {
        const target = findDream(draft, dreamId);
        if (!target) return;
        const current = requireMigration().resolveCharacterProfileV3(target, { now: savedAt });
        target.characterProfile = normalizeCharacterProfileV3({
          ...current,
          opening: normalized,
          updatedAt: savedAt
        }, { now: savedAt });
        target.personaProfile = requireMigration().projectCharacterV3ToPersonaV2(target.characterProfile, {
          personaProfile: target.personaProfile,
          relationship: target.personaProfile?.relationship,
          now: savedAt
        });
        if (target.relationshipProfile && typeof target.relationshipProfile === 'object') {
          target.relationshipProfile = { ...target.relationshipProfile };
          delete target.relationshipProfile.opening;
        }
        if (target.templateDefaults && typeof target.templateDefaults === 'object') {
          target.templateDefaults = { ...target.templateDefaults };
          delete target.templateDefaults.opening;
        }
        target.updatedAt = savedAt;
        touchEdited(target, 'personaProfile', savedAt);
      });
      if (!saved) {
        toast('故事开场没有保存成功，请稍后重试');
        return rememberRejectedSave(dreamId, 'personaProfile', 'PROFILE_LOCAL_SAVE_FAILED');
      }
      return await finishSavedSync(dreamId, 'personaProfile', '故事开场已保存', bases);
    }

    function getUserRelationProfileV1(dreamId = '') {
      const dream = findDream(readState(), dreamId);
      return dream ? requireMigration().resolveUserRelationProfileV1(dream, { now: now() }) : null;
    }

    async function setUserRelationProfileV1(dreamId = '', profile = {}, options = {}) {
      const savedAt = now();
      const normalized = normalizeUserRelationProfileV1({ ...profile, updatedAt: savedAt }, { now: savedAt });
      const before = findDream(readState(), dreamId);
      const bases = [editBase(dreamId, 'userRelationProfile')];
      const permission = saveAllowed(before, 'userRelationProfile', options);
      if (!permission.ok) {
        notifySaveRejected(permission);
        return rememberRejectedSave(dreamId, 'userRelationProfile', permission.code);
      }
      const saved = performUpdate((draft) => {
        const target = findDream(draft, dreamId);
        if (!target) return;
        target.userRelationProfile = normalized;
        target.userCall = normalized.userCall;
        target.userNickname = normalized.userCall;
        target.datingUserProfile = {
          ...(target.datingUserProfile && typeof target.datingUserProfile === 'object' ? target.datingUserProfile : {}),
          freeform: normalized.freeform
        };
        target.updatedAt = savedAt;
        touchEdited(target, 'userRelationProfile', savedAt);
      });
      if (!saved) {
        toast('相处偏好没有保存成功，请稍后重试');
        return rememberRejectedSave(dreamId, 'userRelationProfile', 'PROFILE_LOCAL_SAVE_FAILED');
      }
      return await finishSavedSync(dreamId, 'userRelationProfile', '相处偏好已保存', bases);
    }

    function getUserProfileV1(dreamId = '') {
      const dream = findDream(readState(), dreamId);
      return dream?.datingUserProfile && typeof dream.datingUserProfile === 'object'
        ? normalizeDatingUserProfileV1(dream.datingUserProfile, { now: now() })
        : null;
    }

    async function setUserProfileV1(dreamId = '', profile = {}, options = {}) {
      const savedAt = now();
      const normalized = normalizeDatingUserProfileV1({ ...profile, updatedAt: savedAt }, { now: savedAt });
      const hasUserCall = Object.prototype.hasOwnProperty.call(profile, 'userCall');
      const userCall = String(profile.userCall ?? '').trim().slice(0, 40);
      const before = findDream(readState(), dreamId);
      const bases = [editBase(dreamId, 'datingUserProfile')];
      if (options.preserveUserRelation !== true) bases.push(editBase(dreamId, 'userRelationProfile'));
      const permission = saveAllowed(before, 'datingUserProfile', options);
      if (!permission.ok) {
        notifySaveRejected(permission);
        return rememberRejectedSave(dreamId, 'datingUserProfile', permission.code);
      }
      const saved = performUpdate((draft) => {
        const target = findDream(draft, dreamId);
        if (!target) return;
        target.datingUserProfile = normalized;
        if (options.preserveUserRelation !== true) {
          const relation = requireMigration().resolveUserRelationProfileV1(target, { now: savedAt });
          target.userRelationProfile = requireMigration().normalizeUserRelationProfileV1({
            ...relation,
            userCall: hasUserCall ? userCall : relation.userCall,
            freeform: normalized.freeform,
            updatedAt: savedAt
          }, { now: savedAt });
          target.userCall = target.userRelationProfile.userCall;
          target.userNickname = target.userRelationProfile.userCall;
        }
        target.updatedAt = savedAt;
        touchEdited(target, 'datingUserProfile', savedAt);
        if (options.preserveUserRelation !== true) touchEdited(target, 'userRelationProfile', savedAt);
      });
      if (!saved) {
        toast('个人档案没有保存成功，请稍后重试');
        return rememberRejectedSave(dreamId, 'datingUserProfile', 'PROFILE_LOCAL_SAVE_FAILED');
      }
      return await finishSavedSync(dreamId, 'datingUserProfile', '个人档案已保存', bases);
    }

    function previewTargetBundle(dreamId = '') {
      const dream = findDream(readState(), dreamId);
      return dream ? requireMigration().previewTargetBundle(dream, { now: now() }) : null;
    }

    function inspectAccountUserCandidates() {
      return requireMigration().collectAccountUserCandidates(readState(), { now: now() });
    }

    function getGroupState(dreamId = '', groupName = '') {
      const state = groupState(dreamId, groupName);
      if (state) {
        const dream = findDream(readState(), dreamId);
        // 记下面板读取到的这一版内容，供之后基于旧版本提交时自动合并。
        try { rememberGroupVersion(dreamId, groupName, state.revision, requireProfileSync().groupValue(dream, groupName)); } catch (_) {}
      }
      return state;
    }

    function listConflicts(dreamId = '') {
      const dream = findDream(readState(), dreamId);
      if (!dream) return [];
      if (typeof requireProfileSync().listConflicts === 'function') {
        return Array.from(requireProfileSync().listConflicts(dream));
      }
      return Array.isArray(dream.profileSyncConflicts)
        ? dream.profileSyncConflicts.filter((item) => item?.resolved !== true)
        : [];
    }

    async function resolveConflict(dreamId = '', conflictId = '', selectedHash = '', behavior = {}) {
      const silent = behavior?.silent === true;
      const say = (message) => { if (!silent) toast(message); };
      const resolvedAt = now();
      if (!findDream(readState(), dreamId)) {
        say('找不到当前梦角，资料没有保存');
        return rememberRejectedSave(dreamId, '', 'PROFILE_DREAM_NOT_FOUND');
      }
      let outcome = null;
      const saved = performUpdate((draft) => {
        const target = findDream(draft, dreamId);
        if (!target) return;
        outcome = requireProfileSync().resolveGroupConflict(target, conflictId, selectedHash, resolvedAt);
        if (outcome?.ok) target.updatedAt = resolvedAt;
      });
      if (!saved || !outcome?.ok) {
        say('资料冲突没有处理成功，请重新打开后再试');
        return rememberRejectedSave(dreamId, outcome?.group || '', outcome?.code || 'PROFILE_CONFLICT_RESOLVE_FAILED');
      }
      if (typeof resolveConflictCloud === 'function') {
        try {
          const callResolve = () => resolveConflictCloud({
            dreamId,
            conflictId,
            selectedHash,
            expectedDocumentRevision: Number((typeof getCloudStatus === 'function' ? getCloudStatus(dreamId)?.revision : 0) || 0)
          });
          let response;
          try {
            response = await callResolve();
          } catch (error) {
            if (error?.code !== 'DREAM_PROFILE_DOCUMENT_CONFLICT' || typeof saveGroupCloud !== 'function') throw error;
            // 本机记录的文档版本过期：先提交一次本组拿到最新版本号，再结案。
            await pushGroup(dreamId, captureGroupBase(dreamId, outcome.group));
            if (!listConflicts(dreamId).some((item) => item.id === conflictId)) {
              rememberSaveOutcome({ ok: true, localSaved: true, cloudSynced: true, code: 'PROFILE_SAVE_COMPLETE', dreamId, group: outcome.group, revision: Number(groupState(dreamId, outcome.group)?.revision || 0) });
              say('资料冲突已处理');
              return true;
            }
            response = await callResolve();
          }
          if (response?.storedGroup) {
            performUpdate((draft) => {
              const target = findDream(draft, dreamId);
              if (!target) return;
              requireProfileSync().applyStoredGroup(target, response.group, response.storedGroup);
              afterGroupApplied(target, response.group);
              target.profileSyncConflicts = Array.isArray(response.conflicts) ? response.conflicts : [];
              if (!target.profileSyncConflicts.length) delete target.profileSyncConflicts;
            });
          }
          rememberSaveOutcome({ ok: true, localSaved: true, cloudSynced: true, code: 'PROFILE_SAVE_COMPLETE', dreamId, group: outcome.group, revision: Number(response?.storedGroup?.revision || 0) });
          say('资料冲突已处理');
          return true;
        } catch (_) {
          // 云端没有这条冲突或文档版本已变：改为把本机已定下的这一组直接提交，由自动合并处理。
        }
      }
      return await finishSavedSync(dreamId, outcome.group, silent ? '' : '资料冲突已处理',
        [captureGroupBase(dreamId, outcome.group)], { silent });
    }

    // 历史遗留的整组冲突不再让用户挑版本：保留当前正在使用的那一版，静默结案。
    async function settleConflicts(dreamId = '', onlyGroups = null) {
      let settled = 0;
      for (let guard = 0; guard < 12; guard += 1) {
        const dream = findDream(readState(), dreamId);
        if (!dream) break;
        const open = listConflicts(dreamId)
          .filter((item) => !Array.isArray(onlyGroups) || onlyGroups.includes(item.group));
        if (!open.length) break;
        const conflict = open[0];
        const currentHash = requireProfileSync().groupHash(requireProfileSync().groupValue(dream, conflict.group), conflict.group);
        const candidates = [conflict.candidateA, conflict.candidateB].filter(Boolean).map((item) => String(item.hash || ''));
        if (!candidates.includes(currentHash)) {
          // 当前资料已经不是任何一个候选版本（冲突之后又有新内容）：保留当前资料，只把冲突结案，
          // 绝不用旧候选把更新的内容盖回去。
          const closedAt = now();
          const closed = performUpdate((draft) => {
            const target = findDream(draft, dreamId);
            if (!target) return;
            target.profileSyncConflicts = (Array.isArray(target.profileSyncConflicts) ? target.profileSyncConflicts : [])
              .map((item) => item?.group === conflict.group && item.resolved !== true
                ? { ...item, resolved: true, resolvedAt: closedAt, selectedHash: currentHash, autoResolved: true }
                : item);
          });
          if (!closed || listConflicts(dreamId).some((item) => item.id === conflict.id)) break;
          settled += 1;
          if (typeof saveGroupCloud === 'function') {
            const previousOutcome = getLastSaveOutcome();
            try { await finishSavedSync(dreamId, conflict.group, '', [captureGroupBase(dreamId, conflict.group)], { silent: true }); } catch (_) {}
            rememberSaveOutcome(previousOutcome);
          }
          continue;
        }
        // 两份候选各自可能带着对方没有的修改：按字段合并成一份，而不是整份丢掉其中一边。
        const group = conflict.group;
        const key = groupKey(dreamId, group);
        const pair = [conflict.candidateA, conflict.candidateB].filter((item) => isPlain(item?.value));
        if (pair.length < 2) {
          const previous = getLastSaveOutcome();
          await resolveConflict(dreamId, conflict.id, currentHash, { silent: true });
          rememberSaveOutcome(previous);
          if (listConflicts(dreamId).some((item) => item.id === conflict.id)) break;
          settled += 1;
          continue;
        }
        const stampOf = (item) => Number(item?.meta?.updatedAt || 0);
        const ordered = pair.slice().sort((left, right) => (stampOf(right) - stampOf(left))
          || (String(right.hash) === currentHash ? 1 : 0) - (String(left.hash) === currentHash ? 1 : 0));
        const [newer, older] = ordered;
        const pending = pendingBases.get(key);
        const merged = finalizeMergedValue(group, isPlain(pending?.baseValue)
          ? rebaseValue(materializeGroupValue(group, pending.baseValue),
            materializeGroupValue(group, newer.value), materializeGroupValue(group, older.value))
          : unionValue(materializeGroupValue(group, newer.value), materializeGroupValue(group, older.value)));
        const mergedAt = now();
        let outcome = null;
        const applied = performUpdate((draft) => {
          const target = findDream(draft, dreamId);
          if (!target) return;
          outcome = requireProfileSync().resolveGroupConflict(target, conflict.id, currentHash, mergedAt);
          if (!outcome?.ok) return;
          requireProfileSync().applyGroupValue(target, group, merged);
          afterGroupApplied(target, group);
          target.updatedAt = mergedAt;
          requireProfileSync().touchGroup(target, group, mergedAt);
        });
        if (!applied || !outcome?.ok || listConflicts(dreamId).some((item) => item.id === conflict.id)) break;
        settled += 1;
        if (typeof saveGroupCloud === 'function') {
          const other = pair.find((item) => String(item.hash) !== currentHash) || older;
          const cloudStatus = typeof getCloudStatus === 'function' ? getCloudStatus(dreamId) : {};
          const previous = getLastSaveOutcome();
          clearPending(key);
          try {
            await finishSavedSync(dreamId, group, '', [{
              group,
              baseGroupRevision: Number(other?.meta?.revision || 0),
              baseValueHash: String(other?.hash || ''),
              baseDocumentRevision: Number(cloudStatus?.revision || 0),
              baseValue: cloneValue(other?.value),
              baseHashes: pair.map((item) => String(item.hash || '')).filter(Boolean),
              baseCandidates: pair.map((item) => ({ hash: String(item.hash || ''), value: cloneValue(item.value) }))
            }], { silent: true });
          } catch (_) {}
          rememberSaveOutcome(previous);
        } else {
          try { await syncAfterSave(''); } catch (_) {}
        }
      }
      return settled;
    }

    async function autoResolveConflicts(dreamId = '') {
      if (!findDream(readState(), dreamId)) return 0;
      try { return await settleConflicts(dreamId, null); } catch (error) { if (dependencies.debug) console.error(error); return 0; }
    }

    // 在一起时间、纪念日：与其他资料组共用同一条自动合并保存链。
    async function setDatingRelationshipV1(dreamId = '', patch = {}, options = {}) {
      const savedAt = now();
      if (!findDream(readState(), dreamId)) {
        toast('找不到当前梦角，资料没有保存');
        return rememberRejectedSave(dreamId, 'datingRelationship', 'PROFILE_DREAM_NOT_FOUND');
      }
      const bases = [editBase(dreamId, 'datingRelationship')];
      const saved = performUpdate((draft) => {
        const target = findDream(draft, dreamId);
        if (!target) return;
        if (hasOwn(patch, 'togetherSince')) target.datingTogetherSince = String(patch.togetherSince || '').trim().slice(0, 20);
        if (hasOwn(patch, 'anniversaries')) {
          target.datingAnniversaries = Array.isArray(patch.anniversaries) ? patch.anniversaries.slice(0, 100) : [];
        }
        target.updatedAt = savedAt;
        touchEdited(target, 'datingRelationship', savedAt);
      });
      if (!saved) {
        toast(options.failureMessage || '关系资料没有保存成功，请稍后重试');
        return rememberRejectedSave(dreamId, 'datingRelationship', 'PROFILE_LOCAL_SAVE_FAILED');
      }
      return await finishSavedSync(dreamId, 'datingRelationship', options.successMessage || '已保存', bases);
    }

    return Object.freeze({
      contractVersion: 'character-profile-contract-v4-x65-avatar-asset-capacity',
      storageMode: STORAGE_MODE,
      activePersonaSchemaVersion: 2,
      activeCharacterSchemaVersion: 3,
      targetCharacterSchemaVersion: 3,
      targetActivationStage: 'E2-1',
      characterProfileActivationStatus: 'active-e2-1b',
      getCharacterProfileV3,
      setCharacterProfileV3: queueSave(editSetter('personaProfile', setCharacterProfileV3)),
      setCharacterDisplayName: queueSave(async (dreamId = '', name = '') => {
        if (findDream(readState(), dreamId)) {
          try { await settleConflicts(dreamId, null); } catch (_) {}
        }
        return setCharacterDisplayName(dreamId, name);
      }),
      getPersonaV2,
      setPersonaV2: queueSave(editSetter('personaProfile', setPersonaV2)),
      getUserProfileV1,
      setUserProfileV1: queueSave(editSetter('datingUserProfile', setUserProfileV1)),
      getRelationshipProfileV1,
      setRelationshipProfileV1: queueSave(editSetter('relationshipProfile', setRelationshipProfileV1)),
      getStoryOpeningV1,
      setStoryOpeningV1: queueSave(editSetter('personaProfile', setStoryOpeningV1)),
      getUserRelationProfileV1,
      setUserRelationProfileV1: queueSave(editSetter('userRelationProfile', setUserRelationProfileV1)),
      setDatingRelationshipV1: queueSave(editSetter('datingRelationship', setDatingRelationshipV1)),
      getGroupState,
      getLastSaveOutcome,
      listConflicts,
      resolveConflict: queueSave(resolveConflict),
      autoResolveConflicts: queueSave(autoResolveConflicts),
      retryPendingSaves,
      rebaseGroupValue: (base, edited, latest) => rebaseValue(base, edited, latest),
      previewTargetBundle,
      inspectAccountUserCandidates
    });
  }

  return Object.freeze({
    STORAGE_MODE,
    normalizePersonaV2,
    normalizeDatingUserProfileV1,
    normalizeRelationshipProfileV1,
    normalizeStoryOpeningV1,
    normalizeUserRelationProfileV1,
    normalizeCharacterProfileV3,
    createDataApi
  });
});
