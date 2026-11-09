(function initCharacterProfileSync(global, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.SHEXCharacterProfileSync = api;
})(typeof window !== 'undefined' ? window : globalThis, function createCharacterProfileSync() {
  'use strict';

  const SYNC_META_VERSION = 12;
  const META_FIELD = 'profileSyncMeta';
  const CONFLICTS_FIELD = 'profileSyncConflicts';
  const MAX_CONFLICTS = 12;
  const MAX_ANCESTORS = 24;
  // Chat switches are reversible preferences, not authored profile data. They
  // auto-resolve during sync and must never lock the character editor.
  const AUTO_RESOLVED_GROUPS = Object.freeze(['instanceSettings']);
  const GROUP_FIELDS = Object.freeze({
    personaProfile: Object.freeze(['characterProfile', 'personaProfile', 'name']),
    relationshipProfile: Object.freeze(['relationshipProfile']),
    userRelationProfile: Object.freeze(['userRelationProfile']),
    datingUserProfile: Object.freeze(['datingUserProfile']),
    datingRelationship: Object.freeze(['datingTogetherSince', 'datingAnniversaries']),
    instanceSettings: Object.freeze([
      'replyMode',
      'aiOnlineMode',
      'aiLongformMode',
      'aiModelTier',
      'cardSplicing',
      'fixedOpeningHandledAt',
      'voiceMode',
      'voiceLastEnabledMode',
      'voiceHasModel',
      'voiceStatus',
      'voiceVersion',
      'voiceCreatedAt',
      'voiceProfileId'
    ])
  });
  const GROUP_NAMES = Object.freeze(Object.keys(GROUP_FIELDS));
  // Every sync group must declare how old/default/compatibility shapes are
  // normalized before conflict comparison. Adding a group without updating
  // this registry is a release-blocking contract failure.
  const GROUP_NORMALIZATION_MODES = Object.freeze({
    personaProfile: 'v2_v3_authored_semantics',
    relationshipProfile: 'v1_foundation_with_legacy_persona_fallback',
    userRelationProfile: 'v1_presence_aware_relation_with_legacy_user_fallback',
    datingUserProfile: 'legacy_account_profile_without_relation_freeform',
    datingRelationship: 'dates_and_anniversaries_v1',
    instanceSettings: 'materialized_reversible_defaults'
  });

  function validateGroupNormalizationCoverage() {
    const registered = Object.keys(GROUP_NORMALIZATION_MODES);
    return Object.freeze([
      ...GROUP_NAMES.filter((name) => !registered.includes(name)).map((name) => `missing_group_normalizer:${name}`),
      ...registered.filter((name) => !GROUP_NAMES.includes(name)).map((name) => `orphan_group_normalizer:${name}`)
    ]);
  }

  function asObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }

  function integer(value) {
    const number = Number(value || 0);
    return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
  }

  function stableValue(value) {
    if (Array.isArray(value)) return value.map((item) => stableValue(item));
    if (!value || typeof value !== 'object') return value;
    return Object.keys(value).sort().reduce((result, key) => {
      result[key] = stableValue(value[key]);
      return result;
    }, {});
  }

  function stableStringify(value) {
    return JSON.stringify(stableValue(value));
  }

  function valueHash(value) {
    const input = stableStringify(value);
    let hash = 2166136261;
    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function meaningfulText(value) {
    return String(value == null ? '' : value).trim();
  }

  function meaningfulList(value) {
    if (!Array.isArray(value)) return [];
    const seen = new Set();
    return value.reduce((result, item) => {
      const text = meaningfulText(item);
      if (!text || seen.has(text)) return result;
      seen.add(text);
      result.push(text);
      return result;
    }, []);
  }

  function pruneSemanticValue(value) {
    if (Array.isArray(value)) {
      const list = value.map((item) => pruneSemanticValue(item)).filter((item) => item !== undefined);
      return list.length ? list : undefined;
    }
    if (!value || typeof value !== 'object') {
      if (typeof value === 'string') return meaningfulText(value) || undefined;
      if (value === false || value === 0) return undefined;
      return value === null || value === undefined ? undefined : value;
    }
    const result = Object.keys(value).reduce((output, key) => {
      if (key === 'schemaVersion' || key === 'updatedAt') return output;
      const next = pruneSemanticValue(value[key]);
      if (next !== undefined) output[key] = next;
      return output;
    }, {});
    return Object.keys(result).length ? result : undefined;
  }

  // X49/X50 persona v2 and X51+ character profile v3 are two storage shapes
  // for the same authored profile. Compare their user-visible meaning instead
  // of timestamps, empty generated fields and lossless compatibility copies.
  function comparablePersonaValue(value) {
    const source = asObject(value);
    const character = asObject(source.characterProfile);
    const persona = asObject(source.personaProfile);
    const semantic = pruneSemanticValue(character) || {};
    delete semantic.compatibility;
    if (semantic.basic) {
      delete semantic.basic.genderSelfReference;
      if (!Object.keys(semantic.basic).length) delete semantic.basic;
    }
    if (semantic.identity) {
      delete semantic.identity.primaryLanguages;
      if (!Object.keys(semantic.identity).length) delete semantic.identity;
    }
    if (semantic.speech) {
      const languages = meaningfulList(semantic.speech.languages);
      // 旧资料缺少语言与当前显式默认“普通话”是同一用户语义。
      if (!languages.length || languages.length === 1 && languages[0] === '普通话') delete semantic.speech.languages;
      if (!Object.keys(semantic.speech).length) delete semantic.speech;
    }
    if (semantic.media) delete semantic.media;

    const assignText = (containerName, fieldName, ...candidates) => {
      const current = meaningfulText(asObject(semantic[containerName])[fieldName]);
      const fallback = candidates.map(meaningfulText).find(Boolean) || '';
      const selected = current || fallback;
      if (!selected) return;
      semantic[containerName] = { ...asObject(semantic[containerName]), [fieldName]: selected };
    };
    assignText('basic', 'displayName', source.name);
    assignText('basic', 'mbti', persona.mbti);
    assignText('basic', 'zodiac', persona.zodiac);
    assignText('background', 'summary', persona.background);
    assignText('personality', 'core', persona.personality);
    assignText('speech', 'freeform', persona.speechStyle);
    assignText('preferences', 'freeform', persona.preferences);
    assignText('principles', 'freeform', persona.boundaries);
    assignText('other', 'freeform', persona.freeform);

    const legacyTags = meaningfulList(asObject(character.compatibility).legacyPersonalityTags);
    const currentTags = meaningfulList(asObject(character.personality).tags);
    const personaTags = meaningfulList(persona.tags);
    const tags = legacyTags.length ? legacyTags : (personaTags.length ? personaTags : currentTags);
    if (tags.length) semantic.personality = { ...asObject(semantic.personality), tags };

    const existingDialogues = Array.isArray(character.exampleDialogues) ? character.exampleDialogues : [];
    if (!existingDialogues.length && meaningfulText(persona.exampleDialogue)) {
      semantic.exampleDialogues = [{ content: meaningfulText(persona.exampleDialogue) }];
    }
    return pruneSemanticValue(semantic) || {};
  }

  function groupHash(value, groupName) {
    if (groupName === 'personaProfile') return valueHash(comparablePersonaValue(value));
    if (groupName === 'relationshipProfile') {
      const comparable = { ...asObject(value) };
      const relationship = { ...asObject(comparable.relationshipProfile) };
      const special = asObject(relationship.specialTreatment);
      const tags = meaningfulList(special.tags);
      const freeform = meaningfulText(special.freeform);
      // Empty defaults preserve the exact hash of older foundation-only groups.
      // Presence stays in the payload so explicitly clearing authored data works.
      if (tags.length || freeform) relationship.specialTreatment = { tags, freeform };
      else delete relationship.specialTreatment;
      comparable.relationshipProfile = relationship;
      return valueHash(comparable);
    }
    if (groupName === 'datingUserProfile') {
      const comparable = { ...asObject(value) };
      if (comparable.datingUserProfile && typeof comparable.datingUserProfile === 'object') {
        const profile = { ...comparable.datingUserProfile };
        ['personalityCustom', 'careerCustom', 'hobbiesCustom', 'aboutMe'].forEach((key) => {
          if (profile[key] == null || (typeof profile[key] === 'string' && !profile[key].trim())) delete profile[key];
        });
        comparable.datingUserProfile = profile;
      }
      return valueHash(comparable);
    }
    return valueHash(value);
  }

  function normalizeAncestors(value, excludedHash = '') {
    const excluded = String(excludedHash || '');
    const seen = new Set();
    return (Array.isArray(value) ? value : []).reduce((result, item) => {
      const hash = String(item || '').trim();
      if (!hash || hash === excluded || seen.has(hash) || result.length >= MAX_ANCESTORS) return result;
      seen.add(hash);
      result.push(hash);
      return result;
    }, []);
  }

  function mergeAncestors(excludedHash, ...values) {
    return normalizeAncestors(values.flatMap((value) => Array.isArray(value) ? value : [value]), excludedHash);
  }

  function groupValue(dreamValue, groupName) {
    const dream = asObject(dreamValue);
    if (groupName === 'relationshipProfile') {
      const stored = asObject(dream.relationshipProfile);
      const foundation = asObject(stored.foundation);
      const legacyPersona = asObject(dream.personaProfile);
      const fallbackUpdatedAt = integer(asObject(asObject(asObject(dream.profileSyncMeta).groups).relationshipProfile).updatedAt);
      return {
        relationshipProfile: {
          schemaVersion: 1,
          foundation: {
            identity: String(foundation.identity || ''),
            dynamics: Array.isArray(foundation.dynamics) ? foundation.dynamics : [],
            developmentMode: String(foundation.developmentMode || ''),
            speed: String(foundation.speed || ''),
            freeform: String(foundation.freeform || legacyPersona.relationship || ''),
            updatedAt: integer(foundation.updatedAt || stored.updatedAt || fallbackUpdatedAt)
          },
          ...(Object.prototype.hasOwnProperty.call(stored, 'specialTreatment') ? {
            specialTreatment: {
              tags: meaningfulList(asObject(stored.specialTreatment).tags),
              freeform: meaningfulText(asObject(stored.specialTreatment).freeform)
            }
          } : {}),
          updatedAt: integer(foundation.updatedAt || stored.updatedAt || fallbackUpdatedAt)
        }
      };
    }
    if (groupName === 'userRelationProfile') {
      const stored = asObject(dream.userRelationProfile);
      const legacyUser = asObject(dream.datingUserProfile);
      const fallbackUpdatedAt = integer(asObject(asObject(asObject(dream.profileSyncMeta).groups).userRelationProfile).updatedAt);
      const userCall = Object.prototype.hasOwnProperty.call(stored, 'userCall')
        ? String(stored.userCall ?? '').trim().slice(0, 40)
        : String(dream.userCall || dream.userNickname || '').trim().slice(0, 40);
      return {
        userRelationProfile: {
          schemaVersion: 1,
          userCall,
          interactionTags: Array.isArray(stored.interactionTags) ? stored.interactionTags : [],
          freeform: String(stored.freeform || legacyUser.freeform || ''),
          updatedAt: integer(stored.updatedAt || fallbackUpdatedAt)
        }
      };
    }
    const fields = GROUP_FIELDS[groupName] || [];
    const result = fields.reduce((output, field) => {
      if (Object.prototype.hasOwnProperty.call(dream, field)) output[field] = dream[field];
      return output;
    }, {});
    if (groupName === 'personaProfile' && asObject(result.personaProfile)) {
      result.personaProfile = { ...result.personaProfile };
      delete result.personaProfile.relationship;
    }
    if (groupName === 'datingUserProfile' && asObject(result.datingUserProfile)) {
      result.datingUserProfile = { ...result.datingUserProfile };
      delete result.datingUserProfile.freeform;
    }
    // 旧版本不会持久化全部聊天设置，而当前运行时代码会为这些缺省字段补默认值。
    // 同步哈希必须使用相同语义，否则“未设置”和“显式保存默认值”会被误判为跨设备冲突。
    if (groupName === 'instanceSettings') {
      if (!Object.prototype.hasOwnProperty.call(result, 'aiOnlineMode')
        && Object.prototype.hasOwnProperty.call(dream, 'aiActionMode')) {
        result.aiOnlineMode = dream.aiActionMode === false;
      }
      const defaultSettings = {
        replyMode: 'library',
        aiOnlineMode: false,
        aiLongformMode: false,
        aiModelTier: 'economy',
        cardSplicing: 'off',
        fixedOpeningHandledAt: 0,
        voiceMode: 'off',
        voiceHasModel: false,
        voiceStatus: 'none',
        voiceVersion: 0,
        voiceCreatedAt: 0
      };
      Object.keys(defaultSettings).forEach((field) => {
        if (!Object.prototype.hasOwnProperty.call(result, field)) result[field] = defaultSettings[field];
      });
    }
    return result;
  }

  function groupContentUpdatedAt(dreamValue, groupName) {
    const dream = asObject(dreamValue);
    if (groupName === 'personaProfile') return integer(dream.personaProfile?.updatedAt || dream.updatedAt);
    if (groupName === 'relationshipProfile') return integer(dream.relationshipProfile?.foundation?.updatedAt
      || dream.relationshipProfile?.updatedAt
      || dream.profileSyncMeta?.groups?.relationshipProfile?.updatedAt);
    if (groupName === 'userRelationProfile') return integer(dream.userRelationProfile?.updatedAt
      || dream.profileSyncMeta?.groups?.userRelationProfile?.updatedAt);
    if (groupName === 'datingUserProfile') return integer(dream.datingUserProfile?.updatedAt || dream.updatedAt);
    if (groupName === 'datingRelationship') {
      const anniversaryAt = (Array.isArray(dream.datingAnniversaries) ? dream.datingAnniversaries : [])
        .reduce((latest, item) => Math.max(latest, integer(item?.updatedAt || item?.createdAt)), 0);
      return Math.max(anniversaryAt, integer(dream.updatedAt));
    }
    return integer(dream.updatedAt);
  }

  function rawGroupMeta(dreamValue, groupName) {
    const meta = asObject(asObject(dreamValue)[META_FIELD]);
    const entry = asObject(asObject(meta.groups)[groupName]);
    const storedHash = String(entry.valueHash || '');
    return {
      revision: integer(entry.revision),
      updatedAt: integer(entry.updatedAt),
      valueHash: storedHash,
      ancestors: normalizeAncestors(entry.ancestors, storedHash)
    };
  }

  function effectiveGroupMeta(dreamValue, groupName) {
    const raw = rawGroupMeta(dreamValue, groupName);
    const contentUpdatedAt = groupContentUpdatedAt(dreamValue, groupName);
    const contentHash = groupHash(groupValue(dreamValue, groupName), groupName);
    const legacyDirty = raw.revision > 0 && Boolean(raw.valueHash) && raw.valueHash !== contentHash;
    return {
      revision: raw.revision + (legacyDirty ? 1 : 0),
      updatedAt: Math.max(raw.updatedAt, contentUpdatedAt),
      valueHash: contentHash,
      ancestors: legacyDirty
        ? mergeAncestors(contentHash, raw.valueHash, raw.ancestors)
        : raw.ancestors,
      identityHashes: normalizeAncestors([contentHash, raw.valueHash]),
      legacyDirty
    };
  }

  function normalizedConflicts(dreamValue) {
    return (Array.isArray(asObject(dreamValue)[CONFLICTS_FIELD]) ? asObject(dreamValue)[CONFLICTS_FIELD] : [])
      .filter((item) => item && typeof item === 'object' && GROUP_NAMES.includes(item.group) && item.id)
      .filter((item) => !AUTO_RESOLVED_GROUPS.includes(item.group))
      .filter((item) => groupHash(groupValue(item.candidateA?.value, item.group), item.group)
        !== groupHash(groupValue(item.candidateB?.value, item.group), item.group))
      .slice(-MAX_CONFLICTS);
  }

  function listConflicts(dreamValue) {
    return Object.freeze(normalizedConflicts(dreamValue).filter((item) => item.resolved !== true));
  }

  function hasUnresolvedConflict(dreamValue, groupName) {
    return normalizedConflicts(dreamValue).some((item) => item.group === groupName && item.resolved !== true);
  }

  function getGroupState(dreamValue, groupName) {
    if (!GROUP_NAMES.includes(groupName)) return null;
    const meta = effectiveGroupMeta(dreamValue, groupName);
    return Object.freeze({
      group: groupName,
      revision: meta.revision,
      updatedAt: meta.updatedAt,
      hasConflict: hasUnresolvedConflict(dreamValue, groupName)
    });
  }

  function writeMeta(dream, groupName, entry) {
    const previous = asObject(dream[META_FIELD]);
    dream[META_FIELD] = {
      ...previous,
      version: SYNC_META_VERSION,
      groups: {
        ...asObject(previous.groups),
        [groupName]: {
          revision: integer(entry.revision),
          updatedAt: integer(entry.updatedAt),
          valueHash: String(entry.valueHash || groupHash(groupValue(dream, groupName), groupName)),
          ancestors: normalizeAncestors(entry.ancestors, entry.valueHash || groupHash(groupValue(dream, groupName), groupName))
        }
      }
    };
  }

  function touchGroup(dreamValue, groupName, updatedAt = Date.now(), options = {}) {
    const dream = asObject(dreamValue);
    if (!GROUP_NAMES.includes(groupName)) throw new TypeError(`未知资料同步组：${groupName}`);
    const current = rawGroupMeta(dream, groupName);
    const nextHash = groupHash(groupValue(dream, groupName), groupName);
    const next = {
      revision: current.revision + 1,
      updatedAt: integer(updatedAt) || Date.now(),
      valueHash: nextHash,
      ancestors: mergeAncestors(nextHash, current.valueHash, current.ancestors)
    };
    writeMeta(dream, groupName, next);
    if (options.clearResolvedConflict === true) {
      dream[CONFLICTS_FIELD] = normalizedConflicts(dream)
        .filter((item) => item.group !== groupName || item.resolved !== true);
    }
    return Object.freeze({ ...next });
  }

  function applyGroupValue(targetValue, groupName, value) {
    const target = asObject(targetValue);
    const source = asObject(value);
    if (groupName === 'relationshipProfile') {
      const relationship = asObject(source.relationshipProfile);
      target.relationshipProfile = {
        ...asObject(target.relationshipProfile),
        schemaVersion: 1,
        foundation: asObject(relationship.foundation),
        // Old clients do not carry this field; absence must not erase local data.
        ...(Object.prototype.hasOwnProperty.call(relationship, 'specialTreatment') ? {
          specialTreatment: {
            tags: meaningfulList(asObject(relationship.specialTreatment).tags),
            freeform: meaningfulText(asObject(relationship.specialTreatment).freeform)
          }
        } : {}),
        updatedAt: Math.max(
          integer(asObject(relationship.foundation).updatedAt || relationship.updatedAt),
          integer(asObject(target.relationshipProfile).opening?.updatedAt)
        )
      };
      target.personaProfile = { ...asObject(target.personaProfile), relationship: String(asObject(relationship.foundation).freeform || '') };
      return target;
    }
    if (groupName === 'userRelationProfile') {
      const relation = asObject(source.userRelationProfile);
      target.userRelationProfile = relation;
      const userCall = String(relation.userCall ?? '').trim().slice(0, 40);
      target.userCall = userCall;
      target.userNickname = userCall;
      target.datingUserProfile = { ...asObject(target.datingUserProfile), freeform: String(relation.freeform || '') };
      return target;
    }
    if (groupName === 'personaProfile') {
      if (Object.prototype.hasOwnProperty.call(source, 'characterProfile')) target.characterProfile = source.characterProfile;
      else delete target.characterProfile;
      if (Object.prototype.hasOwnProperty.call(source, 'name')) target.name = source.name;
      else delete target.name;
      if (Object.prototype.hasOwnProperty.call(source, 'personaProfile')) {
        const relationship = String(asObject(target.personaProfile).relationship || '');
        target.personaProfile = { ...asObject(source.personaProfile), relationship };
      } else {
        delete target.personaProfile;
      }
      return target;
    }
    if (groupName === 'datingUserProfile') {
      const freeform = String(asObject(target.datingUserProfile).freeform || '');
      if (Object.prototype.hasOwnProperty.call(source, 'datingUserProfile')) {
        target.datingUserProfile = { ...asObject(source.datingUserProfile), freeform };
      } else {
        delete target.datingUserProfile;
      }
      return target;
    }
    (GROUP_FIELDS[groupName] || []).forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(source, field)) target[field] = source[field];
      else delete target[field];
    });
    return target;
  }

  function applyStoredGroup(dreamValue, groupName, storedGroup = {}) {
    const dream = asObject(dreamValue);
    if (!GROUP_NAMES.includes(groupName)) throw new TypeError(`未知资料同步组：${groupName}`);
    applyGroupValue(dream, groupName, asObject(storedGroup).value);
    writeMeta(dream, groupName, {
      revision: integer(storedGroup.revision),
      updatedAt: integer(storedGroup.updatedAt),
      valueHash: String(storedGroup.valueHash || groupHash(groupValue(dream, groupName), groupName)),
      ancestors: storedGroup.ancestors
    });
    return dream;
  }

  function conflictRecord(groupName, currentValue, incomingValue, currentMeta, incomingMeta, selectedHash) {
    const currentHash = groupHash(currentValue, groupName);
    const incomingHash = groupHash(incomingValue, groupName);
    const ordered = currentHash <= incomingHash
      ? [{ hash: currentHash, value: currentValue, meta: currentMeta }, { hash: incomingHash, value: incomingValue, meta: incomingMeta }]
      : [{ hash: incomingHash, value: incomingValue, meta: incomingMeta }, { hash: currentHash, value: currentValue, meta: currentMeta }];
    const revision = Math.max(currentMeta.revision, incomingMeta.revision);
    return {
      id: `${groupName}:${revision}:${ordered[0].hash}:${ordered[1].hash}`,
      group: groupName,
      revision,
      detectedAt: Math.max(currentMeta.updatedAt, incomingMeta.updatedAt),
      selectedHash,
      candidateA: ordered[0],
      candidateB: ordered[1],
      resolved: false
    };
  }

  function metaDescendsFrom(descendantMeta, ancestorMeta) {
    const identities = Array.isArray(ancestorMeta.identityHashes) && ancestorMeta.identityHashes.length
      ? ancestorMeta.identityHashes
      : [ancestorMeta.valueHash];
    return identities.some((hash) => descendantMeta.ancestors.includes(hash));
  }

  function selectCandidate(currentValue, incomingValue, currentMeta, incomingMeta, groupName) {
    const currentHash = groupHash(currentValue, groupName);
    const incomingHash = groupHash(incomingValue, groupName);
    if (currentHash === incomingHash) {
      return {
        source: currentMeta.revision > incomingMeta.revision || (
          currentMeta.revision === incomingMeta.revision && currentMeta.updatedAt >= incomingMeta.updatedAt
        ) ? 'current' : 'incoming',
        conflict: false
      };
    }
    const incomingDescendsFromCurrent = metaDescendsFrom(incomingMeta, currentMeta);
    const currentDescendsFromIncoming = metaDescendsFrom(currentMeta, incomingMeta);
    if (incomingDescendsFromCurrent && !currentDescendsFromIncoming) {
      return { source: 'incoming', conflict: false };
    }
    if (currentDescendsFromIncoming && !incomingDescendsFromCurrent) {
      return { source: 'current', conflict: false };
    }
    if (currentMeta.revision > 0 || incomingMeta.revision > 0) {
      if (currentMeta.revision !== incomingMeta.revision) {
        return { source: currentMeta.revision > incomingMeta.revision ? 'current' : 'incoming', conflict: true };
      }
      if (currentMeta.updatedAt !== incomingMeta.updatedAt) {
        return { source: currentMeta.updatedAt > incomingMeta.updatedAt ? 'current' : 'incoming', conflict: true };
      }
      return { source: currentHash >= incomingHash ? 'current' : 'incoming', conflict: true };
    }
    if (currentMeta.revision === 0 && currentMeta.updatedAt !== incomingMeta.updatedAt) {
      return { source: currentMeta.updatedAt > incomingMeta.updatedAt ? 'current' : 'incoming', conflict: false };
    }
    if (currentMeta.updatedAt !== incomingMeta.updatedAt) {
      return { source: currentMeta.updatedAt > incomingMeta.updatedAt ? 'current' : 'incoming', conflict: true };
    }
    return { source: currentHash >= incomingHash ? 'current' : 'incoming', conflict: true };
  }

  function selectAutoResolvedCandidate(currentValue, incomingValue, currentMeta, incomingMeta, groupName) {
    const currentHash = groupHash(currentValue, groupName);
    const incomingHash = groupHash(incomingValue, groupName);
    if (currentHash === incomingHash) {
      return {
        source: currentMeta.revision > incomingMeta.revision || (
          currentMeta.revision === incomingMeta.revision && currentMeta.updatedAt >= incomingMeta.updatedAt
        ) ? 'current' : 'incoming',
        conflict: false
      };
    }
    const incomingDescendsFromCurrent = metaDescendsFrom(incomingMeta, currentMeta);
    const currentDescendsFromIncoming = metaDescendsFrom(currentMeta, incomingMeta);
    if (incomingDescendsFromCurrent && !currentDescendsFromIncoming) return { source: 'incoming', conflict: false };
    if (currentDescendsFromIncoming && !incomingDescendsFromCurrent) return { source: 'current', conflict: false };
    if (currentMeta.updatedAt !== incomingMeta.updatedAt) {
      return { source: currentMeta.updatedAt > incomingMeta.updatedAt ? 'current' : 'incoming', conflict: false };
    }
    if (currentMeta.revision !== incomingMeta.revision) {
      return { source: currentMeta.revision > incomingMeta.revision ? 'current' : 'incoming', conflict: false };
    }
    return { source: currentHash >= incomingHash ? 'current' : 'incoming', conflict: false };
  }

  function mergeConflictLists(currentDream, incomingDream, additions) {
    const byId = new Map();
    [...normalizedConflicts(currentDream), ...normalizedConflicts(incomingDream), ...additions].forEach((item) => {
      if (!item?.id) return;
      const previous = byId.get(item.id);
      if (!previous
        || (previous.resolved !== true && item.resolved === true)
        || (previous.resolved === true && item.resolved === true && integer(item.resolvedAt) > integer(previous.resolvedAt))) {
        byId.set(item.id, item);
      }
    });
    return Array.from(byId.values()).slice(-MAX_CONFLICTS);
  }

  function mergeDreamProfileGroups(currentValue, incomingValue, options = {}) {
    const current = asObject(currentValue);
    const incoming = asObject(incomingValue);
    const dream = { ...asObject(options.baseDream || incoming) };
    const additions = [];

    GROUP_NAMES.forEach((groupName) => {
      const currentGroup = groupValue(current, groupName);
      const incomingGroup = groupValue(incoming, groupName);
      const currentMeta = effectiveGroupMeta(current, groupName);
      const incomingMeta = effectiveGroupMeta(incoming, groupName);
      const legacyRelationshipTransition = groupName === 'relationshipProfile'
        && !current.relationshipProfile && !incoming.relationshipProfile;
      const legacyUserRelationTransition = groupName === 'userRelationProfile'
        && !current.userRelationProfile && !incoming.userRelationProfile;
      const transitionCurrentMeta = legacyRelationshipTransition
        ? { ...currentMeta, updatedAt: integer(current.personaProfile?.updatedAt || current.updatedAt) }
        : legacyUserRelationTransition
          ? { ...currentMeta, updatedAt: integer(current.datingUserProfile?.updatedAt || current.updatedAt) }
          : currentMeta;
      const transitionIncomingMeta = legacyRelationshipTransition
        ? { ...incomingMeta, updatedAt: integer(incoming.personaProfile?.updatedAt || incoming.updatedAt) }
        : legacyUserRelationTransition
          ? { ...incomingMeta, updatedAt: integer(incoming.datingUserProfile?.updatedAt || incoming.updatedAt) }
          : incomingMeta;
      const decision = AUTO_RESOLVED_GROUPS.includes(groupName) || legacyRelationshipTransition || legacyUserRelationTransition
        ? selectAutoResolvedCandidate(currentGroup, incomingGroup, transitionCurrentMeta, transitionIncomingMeta, groupName)
        : selectCandidate(currentGroup, incomingGroup, transitionCurrentMeta, transitionIncomingMeta, groupName);
      const selectedValue = decision.source === 'current' ? currentGroup : incomingGroup;
      const selectedMeta = decision.source === 'current' ? currentMeta : incomingMeta;
      const selectedHash = groupHash(selectedValue, groupName);
      applyGroupValue(dream, groupName, selectedValue);
      writeMeta(dream, groupName, selectedMeta);
      if (decision.conflict) {
        additions.push(conflictRecord(groupName, currentGroup, incomingGroup, currentMeta, incomingMeta, selectedHash));
      }
    });

    const conflicts = mergeConflictLists(current, incoming, additions);
    if (conflicts.length) dream[CONFLICTS_FIELD] = conflicts;
    else delete dream[CONFLICTS_FIELD];
    return Object.freeze({ dream, conflicts: Object.freeze(conflicts), hasConflicts: conflicts.some((item) => item.resolved !== true) });
  }

  function resolveGroupConflict(dreamValue, conflictId, selectedHash, updatedAt = Date.now()) {
    const dream = asObject(dreamValue);
    const allConflicts = normalizedConflicts(dream);
    const conflict = allConflicts.find((item) => item.id === String(conflictId || '') && item.resolved !== true);
    if (!conflict) return Object.freeze({ ok: false, code: 'PROFILE_CONFLICT_NOT_FOUND' });
    const groupConflicts = allConflicts.filter((item) => item.group === conflict.group && item.resolved !== true);
    const candidates = groupConflicts.flatMap((item) => [item.candidateA, item.candidateB].filter(Boolean));
    const candidate = candidates.find((item) => item?.hash === String(selectedHash || ''));
    if (!candidate) return Object.freeze({ ok: false, code: 'PROFILE_CONFLICT_CANDIDATE_INVALID', group: conflict.group });

    const resolutionAt = integer(updatedAt) || Date.now();
    const currentMeta = effectiveGroupMeta(dream, conflict.group);
    const directCandidateHashes = candidates.map((item) => item?.hash).filter(Boolean);
    const candidateAncestors = candidates.flatMap((item) => item?.meta?.ancestors || []);
    const conflictRevision = Math.max(
      currentMeta.revision,
      ...groupConflicts.map((item) => integer(item.revision)),
      ...candidates.map((item) => integer(item?.meta?.revision))
    );

    applyGroupValue(dream, conflict.group, candidate.value);
    writeMeta(dream, conflict.group, {
      revision: conflictRevision,
      updatedAt: resolutionAt,
      valueHash: candidate.hash,
      // Direct candidates come first: with at most 12 conflicts, every discarded
      // branch fits inside the bounded 24-hash ancestry before older ancestry.
      ancestors: mergeAncestors(
        candidate.hash,
        directCandidateHashes,
        currentMeta.valueHash,
        candidateAncestors,
        currentMeta.ancestors
      )
    });
    dream[CONFLICTS_FIELD] = allConflicts.map((item) => item.group === conflict.group && item.resolved !== true
      ? { ...item, resolved: true, resolvedAt: resolutionAt, selectedHash: candidate.hash }
      : item);
    const meta = touchGroup(dream, conflict.group, resolutionAt);
    return Object.freeze({
      ok: true,
      group: conflict.group,
      revision: meta.revision,
      updatedAt: meta.updatedAt,
      resolvedCount: groupConflicts.length
    });
  }

  return Object.freeze({
    SYNC_META_VERSION,
    META_FIELD,
    CONFLICTS_FIELD,
    AUTO_RESOLVED_GROUPS,
    GROUP_FIELDS,
    GROUP_NAMES,
    GROUP_NORMALIZATION_MODES,
    validateGroupNormalizationCoverage,
    stableStringify,
    valueHash,
    groupHash,
    groupValue,
    getGroupState,
    hasUnresolvedConflict,
    listConflicts,
    touchGroup,
    applyGroupValue,
    applyStoredGroup,
    mergeDreamProfileGroups,
    resolveGroupConflict
  });
});
