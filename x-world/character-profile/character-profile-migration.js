(function initCharacterProfileMigration(global, factory) {
  const contract = typeof module !== 'undefined' && module.exports
    ? require('./character-profile-schema.js')
    : global?.SHEXCharacterProfileContract;
  const modelCatalog = typeof module !== 'undefined' && module.exports
    ? require('../character-ai/model-catalog.generated.js')
    : global?.SHEXCharacterAIModelCatalog;
  const api = factory(contract, modelCatalog);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.SHEXCharacterProfileMigration = api;
})(typeof window !== 'undefined' ? window : globalThis, function createCharacterProfileMigration(contract, modelCatalog) {
  'use strict';

  const ACTIVE_PERSONA_SCHEMA_VERSION = 2;
  const ACTIVE_CHARACTER_SCHEMA_VERSION = 3;
  const TARGET_CHARACTER_SCHEMA_VERSION = 3;
  const TARGET_ACTIVATION_STAGE = 'E2-1';
  const MIGRATION_VERSION = 'character-profile-migration-v9-x92-user-call-contract';
  const MODEL_IDS = new Set((modelCatalog?.models || []).map((model) => String(model.id || '')));
  const LEGACY_MODEL_ALIASES = modelCatalog?.legacyAliases || {};

  function normalizeModelId(value) {
    const requested = String(value || '').trim().toLowerCase();
    if (Object.prototype.hasOwnProperty.call(LEGACY_MODEL_ALIASES, requested)) return requested;
    return MODEL_IDS.has(requested) ? requested : 'economy';
  }

  function text(value, maxCharacters) {
    return String(value || '').trim().slice(0, maxCharacters);
  }

  function stringList(value, maxItems, maxCharacters) {
    if (!Array.isArray(value)) return [];
    return value
      .map((item) => text(item, maxCharacters))
      .filter(Boolean)
      .slice(0, maxItems);
  }

  function timestamp(value, now = Date.now()) {
    return Number(value || now) || now;
  }

  function optionalTimestamp(value) {
    const normalized = Number(value || 0);
    return Number.isFinite(normalized) && normalized > 0 ? normalized : 0;
  }

  function characters(value) {
    return Array.from(String(value ?? ''));
  }

  function targetDefinition(path) {
    return contract?.fieldByPath?.(path) || {};
  }

  function targetText(path, value) {
    const limit = Number(targetDefinition(path).maxCharacters || 0);
    const normalized = String(value ?? '').trim();
    return limit ? characters(normalized).slice(0, limit).join('') : normalized;
  }

  function targetList(path, value) {
    const definition = targetDefinition(path);
    if (!Array.isArray(value)) return [];
    const result = [];
    const seen = new Set();
    for (const item of value) {
      const normalized = characters(String(item ?? '').trim())
        .slice(0, Number(definition.maxItemCharacters || 0) || undefined)
        .join('');
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      result.push(normalized);
      if (definition.maxItems && result.length >= definition.maxItems) break;
    }
    return result;
  }

  function targetLegacyList(path, value) {
    const definition = targetDefinition(path);
    if (!Array.isArray(value)) return [];
    return value.map((item) => characters(String(item ?? '').trim())
      .slice(0, Number(definition.maxItemCharacters || 0) || undefined)
      .join(''))
      .filter(Boolean)
      .slice(0, Number(definition.maxItems || 0) || undefined);
  }

  function targetDialogues(value) {
    const definition = targetDefinition('characterProfile.exampleDialogues');
    if (!Array.isArray(value)) return [];
    const result = [];
    let used = 0;
    for (const item of value) {
      if (definition.maxItems && result.length >= definition.maxItems) break;
      const source = hasObject(item) ? item : { content: item };
      let scene = characters(String(source.scene ?? '').trim()).slice(0, 80).join('');
      let content = String(source.content ?? source.text ?? '').trim();
      const remaining = Math.max(0, Number(definition.maxTotalCharacters || 0) - used);
      if (!remaining) break;
      scene = characters(scene).slice(0, remaining).join('');
      content = characters(content).slice(0, Math.max(0, remaining - characters(scene).length)).join('');
      if (!scene && !content) continue;
      result.push({ scene, content });
      used += characters(scene).length + characters(content).length;
    }
    return result;
  }

  function valueAt(source, path) {
    return String(path || '').split('.').reduce((current, key) => hasObject(current) ? current[key] : undefined, source);
  }

  function hasPath(source, path) {
    const parts = String(path || '').split('.');
    let current = source;
    for (const part of parts) {
      if (!hasObject(current) || !Object.prototype.hasOwnProperty.call(current, part)) return false;
      current = current[part];
    }
    return true;
  }

  function normalizePersonaV2(profile = {}, options = {}) {
    const now = Number(options.now || Date.now()) || Date.now();
    return {
      schemaVersion: ACTIVE_PERSONA_SCHEMA_VERSION,
      mbti: text(profile.mbti, 20),
      zodiac: text(profile.zodiac, 20),
      tags: stringList(profile.tags, 24, 20),
      personality: text(profile.personality, 400),
      speechStyle: text(profile.speechStyle, 400),
      background: text(profile.background, 800),
      relationship: text(profile.relationship, 600),
      preferences: text(profile.preferences, 400),
      boundaries: text(profile.boundaries, 400),
      exampleDialogue: text(profile.exampleDialogue, 800),
      freeform: text(profile.freeform, 2000),
      updatedAt: timestamp(profile.updatedAt, now)
    };
  }

  function normalizeDatingUserProfileV1(profile = {}, options = {}) {
    const now = Number(options.now || Date.now()) || Date.now();
    return {
      mbti: text(profile.mbti, 8).toUpperCase(),
      zodiac: text(profile.zodiac, 20),
      personalityTags: stringList(profile.personalityTags, 24, 20),
      personalityCustom: text(profile.personalityCustom, 400),
      career: text(profile.career, 30),
      careerCustom: text(profile.careerCustom, 400),
      hobbies: stringList(profile.hobbies, 24, 20),
      hobbiesCustom: text(profile.hobbiesCustom, 400),
      aboutMe: text(profile.aboutMe, 1000),
      freeform: text(profile.freeform, 1000),
      updatedAt: timestamp(profile.updatedAt, now)
    };
  }

  function normalizeRelationshipProfileV1(profile = {}, options = {}) {
    const source = hasObject(profile) ? profile : {};
    const foundation = hasObject(source.foundation) ? source.foundation : {};
    const now = Number(options.now || Date.now()) || Date.now();
    return {
      schemaVersion: 1,
      foundation: {
        identity: targetText('relationshipProfile.foundation.identity', foundation.identity),
        dynamics: targetList('relationshipProfile.foundation.dynamics', foundation.dynamics),
        developmentMode: targetText('relationshipProfile.foundation.developmentMode', foundation.developmentMode),
        speed: targetText('relationshipProfile.foundation.speed', foundation.speed),
        freeform: targetText('relationshipProfile.foundation.freeform', foundation.freeform),
        updatedAt: timestamp(foundation.updatedAt, source.updatedAt || now)
      },
      specialTreatment: {
        tags: targetList('relationshipProfile.specialTreatment.tags', source.specialTreatment?.tags),
        freeform: targetText('relationshipProfile.specialTreatment.freeform', source.specialTreatment?.freeform)
      },
      updatedAt: Math.max(
        timestamp(source.updatedAt, now),
        timestamp(foundation.updatedAt, source.updatedAt || now)
      )
    };
  }

  function normalizeStoryOpeningV1(opening = {}, options = {}) {
    const source = hasObject(opening) ? opening : {};
    return {
      freeform: targetText('characterProfile.opening.freeform', source.freeform),
      updatedAt: optionalTimestamp(source.updatedAt)
    };
  }

  function normalizeUserRelationProfileV1(profile = {}, options = {}) {
    const source = hasObject(profile) ? profile : {};
    const now = Number(options.now || Date.now()) || Date.now();
    return {
      schemaVersion: 1,
      userCall: targetText('userRelationProfile.userCall', source.userCall),
      interactionTags: targetList('userRelationProfile.interactionTags', source.interactionTags),
      freeform: targetText('userRelationProfile.freeform', source.freeform),
      updatedAt: timestamp(source.updatedAt, now)
    };
  }

  function resolveRelationshipProfileV1(dreamValue = {}, options = {}) {
    const dream = hasObject(dreamValue) ? dreamValue : {};
    if (hasObject(dream.relationshipProfile)) {
      return normalizeRelationshipProfileV1(dream.relationshipProfile, options);
    }
    return normalizeRelationshipProfileV1({
      foundation: {
        freeform: hasObject(dream.personaProfile) ? dream.personaProfile.relationship : ''
      },
      updatedAt: dream.personaProfile?.updatedAt || dream.updatedAt
    }, options);
  }

  function resolveDreamUserCall(dreamValue = {}, fallback = '') {
    const dream = hasObject(dreamValue) ? dreamValue : {};
    const relation = hasObject(dream.userRelationProfile) ? dream.userRelationProfile : null;
    if (relation && Object.prototype.hasOwnProperty.call(relation, 'userCall')) {
      return targetText('userRelationProfile.userCall', relation.userCall);
    }
    return targetText('userRelationProfile.userCall', dream.userCall || dream.userNickname || fallback);
  }

  function resolveUserRelationProfileV1(dreamValue = {}, options = {}) {
    const dream = hasObject(dreamValue) ? dreamValue : {};
    if (hasObject(dream.userRelationProfile)) {
      return normalizeUserRelationProfileV1({
        ...dream.userRelationProfile,
        userCall: resolveDreamUserCall(dream)
      }, options);
    }
    return normalizeUserRelationProfileV1({
      userCall: resolveDreamUserCall(dream),
      freeform: hasObject(dream.datingUserProfile) ? dream.datingUserProfile.freeform : '',
      updatedAt: dream.datingUserProfile?.updatedAt || dream.updatedAt
    }, options);
  }

  function hasObject(value) {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
  }

  function normalizeCharacterProfileV3(profile = {}, options = {}) {
    const source = hasObject(profile) ? profile : {};
    const now = Number(options.now || Date.now()) || Date.now();
    const speechLanguages = targetList('characterProfile.speech.languages', source.speech?.languages);
    return {
      schemaVersion: TARGET_CHARACTER_SCHEMA_VERSION,
      basic: {
        displayName: targetText('characterProfile.basic.displayName', source.basic?.displayName),
        gender: targetText('characterProfile.basic.gender', source.basic?.gender),
        selfReference: targetText(
          'characterProfile.basic.selfReference',
          hasObject(source.basic) && Object.prototype.hasOwnProperty.call(source.basic, 'selfReference')
            ? source.basic.selfReference
            : source.basic?.genderSelfReference
        ),
        genderSelfReference: targetText('characterProfile.basic.genderSelfReference', source.basic?.genderSelfReference),
        age: targetText('characterProfile.basic.age', source.basic?.age),
        mbti: targetText('characterProfile.basic.mbti', source.basic?.mbti),
        zodiac: targetText('characterProfile.basic.zodiac', source.basic?.zodiac)
      },
      world: {
        worldType: targetText('characterProfile.world.worldType', source.world?.worldType),
        customWorld: targetText('characterProfile.world.customWorld', source.world?.customWorld)
      },
      identity: {
        tags: targetList('characterProfile.identity.tags', source.identity?.tags),
        customIdentity: targetText('characterProfile.identity.customIdentity', source.identity?.customIdentity),
        primaryLanguages: targetList('characterProfile.identity.primaryLanguages', source.identity?.primaryLanguages)
      },
      appearance: {
        summary: targetText('characterProfile.appearance.summary', source.appearance?.summary),
        details: targetText('characterProfile.appearance.details', source.appearance?.details)
      },
      background: {
        summary: targetText('characterProfile.background.summary', source.background?.summary)
      },
      personality: {
        tags: targetList('characterProfile.personality.tags', source.personality?.tags),
        core: targetText('characterProfile.personality.core', source.personality?.core)
      },
      dailyLife: {
        tags: targetList('characterProfile.dailyLife.tags', source.dailyLife?.tags),
        goalsAndRoutine: targetText('characterProfile.dailyLife.goalsAndRoutine', source.dailyLife?.goalsAndRoutine)
      },
      speech: {
        amount: targetText('characterProfile.speech.amount', source.speech?.amount),
        tones: targetList('characterProfile.speech.tones', source.speech?.tones),
        habits: targetList('characterProfile.speech.habits', source.speech?.habits),
        // 缺失语言与显式普通话语义相同；已有其他语言只作无损兼容保留。
        languages: speechLanguages.length ? speechLanguages : ['普通话'],
        needsTranslation: source.speech?.needsTranslation === true,
        freeform: targetText('characterProfile.speech.freeform', source.speech?.freeform)
      },
      preferences: {
        tags: targetList('characterProfile.preferences.tags', source.preferences?.tags),
        freeform: targetText('characterProfile.preferences.freeform', source.preferences?.freeform)
      },
      principles: {
        freeform: targetText('characterProfile.principles.freeform', source.principles?.freeform)
      },
      exampleDialogues: targetDialogues(source.exampleDialogues),
      other: {
        freeform: targetText('characterProfile.other.freeform', source.other?.freeform)
      },
      opening: {
        freeform: targetText('characterProfile.opening.freeform', source.opening?.freeform),
        updatedAt: optionalTimestamp(source.opening?.updatedAt)
      },
      media: {
        privateAvatarRef: targetText('characterProfile.media.privateAvatarRef', source.media?.privateAvatarRef)
      },
      compatibility: {
        legacyPersonalityTags: targetLegacyList(
          'characterProfile.compatibility.legacyPersonalityTags',
          source.compatibility?.legacyPersonalityTags
        )
      },
      updatedAt: timestamp(source.updatedAt, now)
    };
  }

  function migratePersonaV2ToCharacterV3(dreamValue = {}, options = {}) {
    const dream = hasObject(dreamValue) ? dreamValue : {};
    const existing = hasObject(dream.characterProfile) ? dream.characterProfile : {};
    const persona = hasObject(dream.personaProfile) ? normalizePersonaV2(dream.personaProfile, options) : {};
    const choose = (path, fallback) => hasPath(existing, path) ? valueAt(existing, path) : fallback;
    return normalizeCharacterProfileV3({
      ...existing,
      basic: {
        // Empty generated v3 fields are not an authored choice. Keep the
        // legacy dream name instead of silently turning it into a blank name.
        displayName: choose('basic.displayName', dream.name) || dream.name,
        gender: choose('basic.gender', ''),
        selfReference: choose('basic.selfReference', choose('basic.genderSelfReference', '')),
        genderSelfReference: choose('basic.genderSelfReference', ''),
        age: choose('basic.age', ''),
        mbti: choose('basic.mbti', persona.mbti),
        zodiac: choose('basic.zodiac', persona.zodiac)
      },
      world: {
        worldType: choose('world.worldType', ''),
        customWorld: choose('world.customWorld', '')
      },
      identity: {
        tags: choose('identity.tags', []),
        customIdentity: choose('identity.customIdentity', ''),
        primaryLanguages: choose('identity.primaryLanguages', [])
      },
      appearance: {
        summary: choose('appearance.summary', ''),
        details: choose('appearance.details', '')
      },
      background: { summary: choose('background.summary', persona.background) },
      personality: {
        tags: choose('personality.tags', persona.tags),
        core: choose('personality.core', persona.personality)
      },
      dailyLife: {
        tags: choose('dailyLife.tags', []),
        goalsAndRoutine: choose('dailyLife.goalsAndRoutine', '')
      },
      speech: {
        amount: choose('speech.amount', ''),
        tones: choose('speech.tones', []),
        habits: choose('speech.habits', []),
        languages: choose('speech.languages', []),
        needsTranslation: choose('speech.needsTranslation', false),
        freeform: choose('speech.freeform', persona.speechStyle)
      },
      preferences: {
        tags: choose('preferences.tags', []),
        freeform: choose('preferences.freeform', persona.preferences)
      },
      principles: { freeform: choose('principles.freeform', persona.boundaries) },
      exampleDialogues: choose('exampleDialogues', persona.exampleDialogue
        ? [{ scene: '', content: persona.exampleDialogue }]
        : []),
      other: { freeform: choose('other.freeform', persona.freeform) },
      opening: {
        freeform: choose(
          'opening.freeform',
          dream.relationshipProfile?.opening?.freeform || dream.templateDefaults?.opening?.freeform || ''
        ),
        updatedAt: choose(
          'opening.updatedAt',
          dream.relationshipProfile?.opening?.updatedAt || dream.templateDefaults?.opening?.updatedAt || 0
        )
      },
      media: { privateAvatarRef: choose('media.privateAvatarRef', dream.avatar) },
      compatibility: {
        legacyPersonalityTags: choose(
          'compatibility.legacyPersonalityTags',
          hasObject(dream.characterProfile) ? [] : (persona.tags || [])
        )
      },
      updatedAt: hasPath(existing, 'updatedAt') ? existing.updatedAt : persona.updatedAt
    }, options);
  }

  function projectCharacterV3ToPersonaV2(characterValue = {}, options = {}) {
    const normalized = normalizeCharacterProfileV3(characterValue, options);
    const dialogueText = normalized.exampleDialogues.map((item) => {
      if (item.scene === 'legacy') return item.content;
      if (!item.scene) return item.content;
      if (!item.content) return `【${item.scene}】`;
      return `【${item.scene}】${item.content}`;
    }).join('\n');
    const relationship = Object.prototype.hasOwnProperty.call(options, 'relationship')
      ? options.relationship
      : options.personaProfile?.relationship;
    return normalizePersonaV2({
      mbti: normalized.basic.mbti,
      zodiac: normalized.basic.zodiac,
      tags: normalized.compatibility.legacyPersonalityTags.length
        ? normalized.compatibility.legacyPersonalityTags
        : normalized.personality.tags,
      personality: normalized.personality.core,
      speechStyle: normalized.speech.freeform,
      background: normalized.background.summary,
      relationship,
      preferences: normalized.preferences.freeform,
      boundaries: normalized.principles.freeform,
      exampleDialogue: characters(dialogueText).slice(0, 800).join(''),
      freeform: normalized.other.freeform,
      updatedAt: normalized.updatedAt
    }, { now: normalized.updatedAt });
  }

  function applyPersonaV2ToCharacterV3(characterValue = {}, personaValue = {}, options = {}) {
    const current = normalizeCharacterProfileV3(characterValue, options);
    const persona = normalizePersonaV2(personaValue, options);
    const displayName = Object.prototype.hasOwnProperty.call(options, 'displayName')
      ? options.displayName
      : current.basic.displayName;
    const privateAvatarRef = Object.prototype.hasOwnProperty.call(options, 'privateAvatarRef')
      ? options.privateAvatarRef
      : current.media.privateAvatarRef;
    return normalizeCharacterProfileV3({
      ...current,
      basic: {
        ...current.basic,
        displayName,
        mbti: persona.mbti,
        zodiac: persona.zodiac
      },
      background: { summary: persona.background },
      personality: { tags: persona.tags, core: persona.personality },
      speech: { ...current.speech, freeform: persona.speechStyle },
      preferences: { ...current.preferences, freeform: persona.preferences },
      principles: { freeform: persona.boundaries },
      exampleDialogues: persona.exampleDialogue
        ? [{ scene: '', content: persona.exampleDialogue }]
        : [],
      other: { freeform: persona.freeform },
      media: { privateAvatarRef },
      compatibility: { legacyPersonalityTags: persona.tags },
      updatedAt: persona.updatedAt
    }, { now: persona.updatedAt });
  }

  function resolveCharacterProfileV3(dreamValue = {}, options = {}) {
    const dream = hasObject(dreamValue) ? dreamValue : {};
    if (!hasObject(dream.characterProfile)) return migratePersonaV2ToCharacterV3(dream, options);
    const storedOpening = hasObject(dream.characterProfile.opening) ? dream.characterProfile.opening : {};
    const legacyOpening = hasObject(dream.relationshipProfile?.opening)
      ? dream.relationshipProfile.opening
      : (hasObject(dream.templateDefaults?.opening) ? dream.templateDefaults.opening : {});
    const character = normalizeCharacterProfileV3({
      ...dream.characterProfile,
      opening: storedOpening.freeform ? storedOpening : legacyOpening
    }, options);
    if (!hasObject(dream.personaProfile)) return character;
    const persona = normalizePersonaV2(dream.personaProfile, options);
    if (persona.updatedAt <= character.updatedAt) return character;
    return applyPersonaV2ToCharacterV3(character, persona, {
      ...options,
      displayName: dream.name || character.basic.displayName,
      privateAvatarRef: dream.avatar || character.media.privateAvatarRef
    });
  }

  function previewTargetBundle(dreamValue = {}, options = {}) {
    const dream = hasObject(dreamValue) ? dreamValue : {};
    const now = Number(options.now || Date.now()) || Date.now();
    const persona = hasObject(dream.personaProfile) ? normalizePersonaV2(dream.personaProfile, { now }) : null;
    const userProfile = hasObject(dream.datingUserProfile)
      ? normalizeDatingUserProfileV1(dream.datingUserProfile, { now })
      : null;
    const userCall = text(dream.userCall || dream.userNickname, 40);

    return {
      mode: 'read_only_target_preview',
      persisted: false,
      activeStorage: {
        field: 'characterProfile',
        schemaVersion: ACTIVE_CHARACTER_SCHEMA_VERSION,
        compatibilityField: 'personaProfile',
        compatibilitySchemaVersion: ACTIVE_PERSONA_SCHEMA_VERSION
      },
      targetStorage: {
        field: 'characterProfile',
        schemaVersion: TARGET_CHARACTER_SCHEMA_VERSION,
        activationStage: TARGET_ACTIVATION_STAGE
      },
      characterProfileDraft: migratePersonaV2ToCharacterV3(dream, { now }),
      relationshipProfileDraft: resolveRelationshipProfileV1(dream, { now }),
      accountUserProfileCandidate: userProfile ? {
        mbti: userProfile.mbti,
        zodiac: userProfile.zodiac,
        personalityTags: [...userProfile.personalityTags],
        career: userProfile.career,
        hobbies: [...userProfile.hobbies]
      } : null,
      userRelationProfileDraft: resolveUserRelationProfileV1({
        ...dream,
        userCall,
        datingUserProfile: userProfile || dream.datingUserProfile
      }, { now }),
      instanceSettingsDraft: {
        replyMode: dream.replyMode === 'ai' ? 'ai' : 'library',
        aiOnlineMode: Object.prototype.hasOwnProperty.call(dream, 'aiOnlineMode')
          ? dream.aiOnlineMode === true
          : dream.aiActionMode === false,
        aiLongformMode: dream.aiLongformMode === true,
        aiModelTier: normalizeModelId(dream.aiModelTier),
        cardSplicing: ['system', 'mixed'].includes(dream.cardSplicing) ? dream.cardSplicing : 'off',
        fixedOpeningHandledAt: Math.max(0, Math.floor(Number(dream.fixedOpeningHandledAt || 0))),
        voiceMode: ['manual', 'auto'].includes(dream.voiceMode) ? dream.voiceMode : 'off'
      }
    };
  }

  function accountCandidateFingerprint(candidate) {
    if (!hasObject(candidate)) return '';
    return JSON.stringify({
      mbti: text(candidate.mbti, 8).toUpperCase(),
      zodiac: text(candidate.zodiac, 20),
      personalityTags: stringList(candidate.personalityTags, 24, 20),
      career: text(candidate.career, 30),
      hobbies: stringList(candidate.hobbies, 24, 20)
    });
  }

  function collectAccountUserCandidates(stateValue = {}, options = {}) {
    const state = hasObject(stateValue) ? stateValue : {};
    const candidates = (Array.isArray(state.dreams) ? state.dreams : []).map((dream) => {
      const preview = previewTargetBundle(dream, options);
      return {
        dreamId: text(dream?.id, 160),
        candidate: preview.accountUserProfileCandidate,
        fingerprint: accountCandidateFingerprint(preview.accountUserProfileCandidate)
      };
    }).filter((item) => item.candidate);
    const distinct = new Set(candidates.map((item) => item.fingerprint));
    return {
      candidates,
      canAutoPromote: candidates.length > 0 && distinct.size === 1,
      requiresUserConfirmation: distinct.size > 1
    };
  }

  function assertContractVersions() {
    if (!contract) return false;
    return contract.ACTIVE_STORAGE_SCHEMA_VERSIONS?.personaProfileCompatibility === ACTIVE_PERSONA_SCHEMA_VERSION
      && contract.ACTIVE_STORAGE_SCHEMA_VERSIONS?.characterProfile === ACTIVE_CHARACTER_SCHEMA_VERSION
      && contract.TARGET_PROFILE_SCHEMA_VERSIONS?.characterProfile === TARGET_CHARACTER_SCHEMA_VERSION
      && contract.TARGET_SCHEMA_ACTIVATION_STAGE === TARGET_ACTIVATION_STAGE;
  }

  return Object.freeze({
    MIGRATION_VERSION,
    ACTIVE_PERSONA_SCHEMA_VERSION,
    ACTIVE_CHARACTER_SCHEMA_VERSION,
    TARGET_CHARACTER_SCHEMA_VERSION,
    TARGET_ACTIVATION_STAGE,
      normalizePersonaV2,
      normalizeDatingUserProfileV1,
      normalizeRelationshipProfileV1,
      normalizeStoryOpeningV1,
      normalizeUserRelationProfileV1,
      normalizeCharacterProfileV3,
      resolveRelationshipProfileV1,
      resolveDreamUserCall,
      resolveUserRelationProfileV1,
    migratePersonaV2ToCharacterV3,
    projectCharacterV3ToPersonaV2,
    applyPersonaV2ToCharacterV3,
    resolveCharacterProfileV3,
    previewTargetBundle,
    collectAccountUserCandidates,
    accountCandidateFingerprint,
    assertContractVersions
  });
});
