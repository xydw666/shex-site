(function initCharacterProfileContract(global, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.SHEXCharacterProfileContract = api;
})(typeof window !== 'undefined' ? window : globalThis, function createCharacterProfileContract() {
  'use strict';

  const CONTRACT_VERSION = 'character-profile-contract-v11-x98-public-taxonomy';
  const ACTIVE_STORAGE_SCHEMA_VERSIONS = Object.freeze({
    characterProfile: 3,
    personaProfileCompatibility: 2,
    datingUserProfile: 1,
    relationshipProfile: 1,
    userRelationProfile: 1
  });
  const TARGET_PROFILE_SCHEMA_VERSIONS = Object.freeze({
    characterProfile: 3,
    relationshipProfile: 1,
    relationshipRuntime: 1,
    accountUserProfile: 1,
    userRelationProfile: 1,
    instanceSettings: 4
  });
  const TARGET_SCHEMA_ACTIVATION_STAGE = 'E2-1';
  const CHARACTER_PROFILE_ACTIVATION_STATUS = 'active-e2-1b';
  const RELATIONSHIP_PROFILE_ACTIVATION_STATUS = 'active-e2-2-lite';
  const OPENING_ACTIVATION_STATUS = 'active-fixed-first-message';
  const PROJECTION_VERSIONS = Object.freeze({
    characterAI: 3,
    datingAI: 3,
    xWorldAI: 3,
    cardTranslateAI: 3,
    calendarAI: 3,
    publicExport: 1
  });
  const PROMPT_ROUTES = Object.freeze(['character_ai', 'dating_ai', 'xworld_ai', 'card_translate_ai', 'calendar_ai']);
  const PROMPT_ROUTE_LABELS = Object.freeze({
    character_ai: '聊天',
    dating_ai: 'X约会',
    xworld_ai: '梦占',
    card_translate_ai: '卡牌翻译',
    calendar_ai: '日历计划'
  });
  const ROUTE_BUDGETS = Object.freeze({
    character_ai: Object.freeze({ maxProfileCharacters: 5200 }),
    dating_ai: Object.freeze({ maxProfileCharacters: 2400 }),
    xworld_ai: Object.freeze({ maxProfileCharacters: 1600 }),
    card_translate_ai: Object.freeze({ maxProfileCharacters: 2800 }),
    calendar_ai: Object.freeze({ maxProfileCharacters: 1800 })
  });

  const field = (path, options) => Object.freeze({
    path,
    scope: options.scope,
    owner: options.owner,
    publishable: options.publishable === true,
    promptRoutes: Object.freeze([...(options.promptRoutes || [])]),
    valueType: options.valueType || 'string',
    maxCharacters: options.maxCharacters || 0,
    maxItems: options.maxItems || 0,
    maxItemCharacters: options.maxItemCharacters || 0,
    maxTotalCharacters: options.maxTotalCharacters || 0,
    stability: options.stability || 'stable',
    notes: options.notes || ''
  });

  const CHARACTER_ROUTES = PROMPT_ROUTES;
  const CHARACTER_ONLY_ROUTE = ['character_ai'];
  const CHARACTER_CARD_ROUTES = ['character_ai', 'card_translate_ai'];
  const CHAT_DATING_ROUTES = ['character_ai', 'dating_ai'];
  const CHAT_DATING_CARD_ROUTES = ['character_ai', 'dating_ai', 'card_translate_ai'];
  const CHAT_DATING_CARD_CALENDAR_ROUTES = ['character_ai', 'dating_ai', 'card_translate_ai', 'calendar_ai'];
  const CHARACTER_CARD_CALENDAR_ROUTES = ['character_ai', 'card_translate_ai', 'calendar_ai'];
  const NO_PROMPT_ROUTES = [];
  const CHAT_RELATION_ROUTES = CHAT_DATING_ROUTES;

  const FIELD_DEFINITIONS = Object.freeze([
    field('characterProfile.basic.displayName', { scope: 'character_profile', owner: 'template_or_private_creator', publishable: true, promptRoutes: CHARACTER_ROUTES, maxCharacters: 80 }),
    field('characterProfile.basic.gender', { scope: 'character_profile', owner: 'template_or_private_creator', publishable: true, promptRoutes: CHARACTER_CARD_ROUTES, maxCharacters: 30 }),
    field('characterProfile.basic.selfReference', { scope: 'character_profile', owner: 'template_or_private_creator', publishable: true, promptRoutes: CHARACTER_CARD_ROUTES, maxCharacters: 30 }),
    field('characterProfile.basic.genderSelfReference', { scope: 'character_profile', owner: 'private_instance_owner', publishable: false, promptRoutes: [], maxCharacters: 60, notes: 'E2-1C拆分前的本地兼容字段；不再编辑、不进入AI或公开模板。' }),
    field('characterProfile.basic.age', { scope: 'character_profile', owner: 'template_or_private_creator', publishable: true, promptRoutes: CHARACTER_CARD_ROUTES, maxCharacters: 40 }),
    field('characterProfile.basic.mbti', { scope: 'character_profile', owner: 'template_or_private_creator', publishable: true, promptRoutes: ['dating_ai', 'card_translate_ai'], maxCharacters: 20, notes: '仅作弱参考，不能覆盖明确性格；不进入角色聊天。' }),
    field('characterProfile.basic.zodiac', { scope: 'character_profile', owner: 'template_or_private_creator', publishable: true, promptRoutes: ['dating_ai', 'card_translate_ai'], maxCharacters: 20, notes: '仅作弱参考，不能覆盖明确性格；不进入角色聊天。' }),
    field('characterProfile.world.worldType', { scope: 'character_profile', owner: 'template_or_private_creator', publishable: true, promptRoutes: CHARACTER_CARD_ROUTES, maxCharacters: 40 }),
    field('characterProfile.world.customWorld', { scope: 'character_profile', owner: 'template_or_private_creator', publishable: true, promptRoutes: CHARACTER_CARD_ROUTES, maxCharacters: 80 }),
    field('characterProfile.identity.tags', { scope: 'character_profile', owner: 'template_or_private_creator', publishable: true, promptRoutes: CHARACTER_CARD_CALENDAR_ROUTES, valueType: 'string_array', maxItems: 8, maxItemCharacters: 30 }),
    field('characterProfile.identity.customIdentity', { scope: 'character_profile', owner: 'template_or_private_creator', publishable: true, promptRoutes: CHARACTER_CARD_CALENDAR_ROUTES, maxCharacters: 80 }),
    field('characterProfile.identity.primaryLanguages', { scope: 'character_profile', owner: 'private_instance_owner', publishable: false, promptRoutes: [], valueType: 'string_array', maxItems: 8, maxItemCharacters: 30, notes: 'E2-1C后停止编辑和AI投影；仅保留旧数据兼容，统一改用characterProfile.speech.languages。' }),
    field('characterProfile.appearance.summary', { scope: 'character_profile', owner: 'template_or_private_creator', publishable: true, promptRoutes: ['character_ai', 'dating_ai', 'card_translate_ai'], maxCharacters: 500 }),
    field('characterProfile.appearance.details', { scope: 'character_profile', owner: 'template_or_private_creator', publishable: true, promptRoutes: ['character_ai', 'dating_ai', 'card_translate_ai'], maxCharacters: 400, notes: '用于长期稳定的随身物件、身体状态和习惯性小动作，不填写一次性剧情状态。' }),
    field('characterProfile.background.summary', { scope: 'character_profile', owner: 'template_or_private_creator', publishable: true, promptRoutes: CHARACTER_CARD_CALENDAR_ROUTES, maxCharacters: 800 }),
    field('characterProfile.personality.tags', { scope: 'character_profile', owner: 'template_or_private_creator', publishable: true, promptRoutes: CHARACTER_ROUTES, valueType: 'string_array', maxItems: 8, maxItemCharacters: 20 }),
    field('characterProfile.personality.core', { scope: 'character_profile', owner: 'template_or_private_creator', publishable: true, promptRoutes: CHARACTER_ROUTES, maxCharacters: 400 }),
    field('characterProfile.dailyLife.tags', { scope: 'character_profile', owner: 'template_or_private_creator', publishable: true, promptRoutes: ['character_ai', 'dating_ai', 'calendar_ai'], valueType: 'string_array', maxItems: 12, maxItemCharacters: 30 }),
    field('characterProfile.dailyLife.goalsAndRoutine', { scope: 'character_profile', owner: 'template_or_private_creator', publishable: true, promptRoutes: ['character_ai', 'dating_ai', 'calendar_ai'], maxCharacters: 400 }),
    field('characterProfile.speech.amount', { scope: 'character_profile', owner: 'template_or_private_creator', publishable: true, promptRoutes: CHARACTER_CARD_ROUTES, maxCharacters: 20 }),
    field('characterProfile.speech.tones', { scope: 'character_profile', owner: 'template_or_private_creator', publishable: true, promptRoutes: CHARACTER_CARD_ROUTES, valueType: 'string_array', maxItems: 3, maxItemCharacters: 20 }),
    field('characterProfile.speech.habits', { scope: 'character_profile', owner: 'template_or_private_creator', publishable: true, promptRoutes: CHARACTER_CARD_ROUTES, valueType: 'string_array', maxItems: 12, maxItemCharacters: 30 }),
    field('characterProfile.speech.languages', { scope: 'character_profile', owner: 'template_or_private_creator', publishable: true, promptRoutes: CHARACTER_CARD_ROUTES, valueType: 'string_array', maxItems: 8, maxItemCharacters: 30, notes: '字段与未来语言清单继续保留；当前界面隐藏并统一保存为普通话。' }),
    field('characterProfile.speech.needsTranslation', { scope: 'character_profile', owner: 'template_or_private_creator', publishable: true, promptRoutes: CHARACTER_CARD_ROUTES, valueType: 'boolean', notes: '随语言能力保留；当前普通话阶段界面隐藏并固定为false。' }),
    field('characterProfile.speech.freeform', { scope: 'character_profile', owner: 'template_or_private_creator', publishable: true, promptRoutes: CHARACTER_CARD_ROUTES, maxCharacters: 400 }),
    field('characterProfile.preferences.tags', { scope: 'character_profile', owner: 'template_or_private_creator', publishable: true, promptRoutes: ['character_ai', 'dating_ai', 'card_translate_ai', 'calendar_ai'], valueType: 'string_array', maxItems: 12, maxItemCharacters: 30 }),
    field('characterProfile.preferences.freeform', { scope: 'character_profile', owner: 'template_or_private_creator', publishable: true, promptRoutes: ['character_ai', 'dating_ai', 'card_translate_ai', 'calendar_ai'], maxCharacters: 400 }),
    field('characterProfile.principles.freeform', { scope: 'character_profile', owner: 'template_or_private_creator', publishable: true, promptRoutes: CHAT_DATING_CARD_ROUTES, maxCharacters: 400 }),
    field('characterProfile.exampleDialogues', { scope: 'character_profile', owner: 'template_or_private_creator', publishable: true, promptRoutes: CHARACTER_CARD_ROUTES, valueType: 'dialogue_array', maxItems: 5, maxTotalCharacters: 800, notes: '只作表达参考，不逐字照抄，也不视为已发生事实。' }),
    field('characterProfile.other.freeform', { scope: 'character_profile', owner: 'template_or_private_creator', publishable: true, promptRoutes: CHAT_DATING_CARD_CALENDAR_ROUTES, maxCharacters: 2000, notes: '与专门字段冲突时以专门字段为准；在dating_ai与calendar_ai中位于投影清单末尾，只使用结构化字段后的剩余预算。' }),
    field('characterProfile.opening.freeform', { scope: 'character_profile', owner: 'private_instance_owner', publishable: false, promptRoutes: NO_PROMPT_ROUTES, maxCharacters: 400, stability: 'legacy_only', notes: '历史兼容只读字段；不再显示、编辑、公开或进入AI提示词。旧数据原样保留，避免资料同步产生无意义冲突。' }),
    field('characterProfile.media.privateAvatarRef', { scope: 'character_profile', owner: 'private_instance_owner', publishable: false, promptRoutes: [], maxCharacters: 2048, notes: '现有dream.avatar只迁移为私人引用，不能直接公开。' }),
    field('characterProfile.compatibility.legacyPersonalityTags', { scope: 'character_profile', owner: 'private_instance_owner', publishable: false, promptRoutes: [], valueType: 'string_array', maxItems: 24, maxItemCharacters: 20, notes: '只用于无损还原旧v2标签列表；不得进入AI或公开模板，新版标签被明确修改后清空。' }),

    field('templateMetadata.publicSummary', { scope: 'template_metadata', owner: 'template_creator', publishable: true, promptRoutes: [], maxCharacters: 300 }),
    field('templateMetadata.openingText', { scope: 'template_metadata', owner: 'template_creator', publishable: true, promptRoutes: [], maxCharacters: 400, stability: 'one_time_delivery', notes: '仅供创作者发布角色时填写；领取后的空会话只插入一次作为首条TA消息，不作为人设字段或独立AI提示词。' }),
    field('templateMetadata.categoryId', { scope: 'template_metadata', owner: 'template_creator', publishable: true, promptRoutes: [], maxCharacters: 40, notes: '角色广场大类权威ID；只用于发现和展示，不进入AI人设。' }),
    field('templateMetadata.tagIds', { scope: 'template_metadata', owner: 'template_creator', publishable: true, promptRoutes: [], valueType: 'string_array', maxItems: 10, maxItemCharacters: 64, notes: '角色广场公共标签权威ID；只用于发现和展示，不进入AI人设。' }),
    field('templateMetadata.contentTypes', { scope: 'template_metadata', owner: 'template_creator', publishable: true, promptRoutes: [], valueType: 'string_array', maxItems: 2, maxItemCharacters: 20, notes: '只用于角色广场分类和筛选，不进入AI人设。' }),
    field('templateMetadata.galleryTags', { scope: 'template_metadata', owner: 'template_creator', publishable: true, promptRoutes: [], valueType: 'string_array', maxItems: 10, maxItemCharacters: 20, notes: '只用于角色广场展示和筛选，不进入AI人设。' }),
    field('templateMetadata.creatorDisplayName', { scope: 'template_metadata', owner: 'template_creator', publishable: true, promptRoutes: [], maxCharacters: 40, notes: '角色广场公开展示的作者名或笔名，不使用内部账号编号。' }),
    field('templateMetadata.avatarAssetId', { scope: 'template_metadata', owner: 'template_creator', publishable: true, promptRoutes: [], maxCharacters: 2048, notes: '保存CloudBase文件ID或可公开图片地址；只有完成资源权利确认的模板资产才能填写。' }),
    field('templateMetadata.backgroundAssetId', { scope: 'template_metadata', owner: 'template_creator', publishable: true, promptRoutes: [], valueType: 'string', maxCharacters: 2048, notes: '角色公开背景，随领取版本带走；不进入AI人设，不在广场卡片显示。' }),
    field('templateMetadata.voiceBinding', { scope: 'template_metadata', owner: 'template_creator', publishable: true, promptRoutes: [], valueType: 'voice_binding', notes: '服务端验证后的 Fish 公开音色绑定；随不可变版本锁定，领取时保持关闭，不进入任何AI提示词。' }),
    field('templateMetadata.creatorNotes', { scope: 'template_metadata', owner: 'template_creator', publishable: true, promptRoutes: [], maxCharacters: 1000 }),
    field('templateDefaults.relationship.identity', { scope: 'template_defaults', owner: 'template_creator', publishable: true, promptRoutes: [], maxCharacters: 30 }),
    field('templateDefaults.relationship.dynamics', { scope: 'template_defaults', owner: 'template_creator', publishable: true, promptRoutes: [], valueType: 'string_array', maxItems: 3, maxItemCharacters: 30 }),
    field('templateDefaults.relationship.developmentMode', { scope: 'template_defaults', owner: 'template_creator', publishable: true, promptRoutes: [], maxCharacters: 30 }),
    field('templateDefaults.relationship.speed', { scope: 'template_defaults', owner: 'template_creator', publishable: true, promptRoutes: [], maxCharacters: 30 }),
    field('templateDefaults.relationship.freeform', { scope: 'template_defaults', owner: 'template_creator', publishable: true, promptRoutes: [], maxCharacters: 600 }),
    field('templateDefaults.specialTreatment.tags', { scope: 'template_defaults', owner: 'template_creator', publishable: true, promptRoutes: [], valueType: 'string_array', maxItems: 8, maxItemCharacters: 30 }),
    field('templateDefaults.specialTreatment.freeform', { scope: 'template_defaults', owner: 'template_creator', publishable: true, promptRoutes: [], maxCharacters: 400 }),

    field('relationshipProfile.foundation.identity', { scope: 'relationship_profile', owner: 'private_relationship_owner', publishable: false, promptRoutes: CHAT_RELATION_ROUTES, maxCharacters: 30 }),
    field('relationshipProfile.foundation.dynamics', { scope: 'relationship_profile', owner: 'private_relationship_owner', publishable: false, promptRoutes: CHAT_RELATION_ROUTES, valueType: 'string_array', maxItems: 3, maxItemCharacters: 30 }),
    field('relationshipProfile.foundation.developmentMode', { scope: 'relationship_profile', owner: 'private_relationship_owner', publishable: false, promptRoutes: CHAT_DATING_ROUTES, maxCharacters: 30 }),
    field('relationshipProfile.foundation.speed', { scope: 'relationship_profile', owner: 'private_relationship_owner', publishable: false, promptRoutes: CHAT_DATING_ROUTES, maxCharacters: 30 }),
    field('relationshipProfile.foundation.freeform', { scope: 'relationship_profile', owner: 'private_relationship_owner', publishable: false, promptRoutes: CHAT_RELATION_ROUTES, maxCharacters: 600 }),
    field('relationshipProfile.specialTreatment.tags', { scope: 'relationship_profile', owner: 'private_relationship_owner', publishable: false, promptRoutes: NO_PROMPT_ROUTES, valueType: 'string_array', maxItems: 8, maxItemCharacters: 30, notes: 'E2-2精简版不建立第二份“TA只对你的不同”；继续使用现有人设字段。' }),
    field('relationshipProfile.specialTreatment.freeform', { scope: 'relationship_profile', owner: 'private_relationship_owner', publishable: false, promptRoutes: NO_PROMPT_ROUTES, maxCharacters: 400, notes: 'E2-2精简版不建立第二份“TA只对你的不同”；继续使用现有人设字段。' }),

    field('relationshipRuntime.currentStage', { scope: 'relationship_runtime', owner: 'private_relationship_runtime', publishable: false, promptRoutes: ['character_ai', 'xworld_ai', 'card_translate_ai'], maxCharacters: 40, stability: 'dynamic' }),
    field('relationshipRuntime.currentScene', { scope: 'relationship_runtime', owner: 'private_relationship_runtime', publishable: false, promptRoutes: ['character_ai'], maxCharacters: 400, stability: 'dynamic' }),
    field('relationshipRuntime.summaryRef', { scope: 'relationship_runtime', owner: 'server_runtime', publishable: false, promptRoutes: [], maxCharacters: 160, stability: 'server_managed' }),

    field('accountUserProfile.mbti', { scope: 'account_user_profile', owner: 'private_account_owner', publishable: false, promptRoutes: NO_PROMPT_ROUTES, maxCharacters: 20, notes: '保留旧数据兼容，E2-2精简版不发送给模型。' }),
    field('accountUserProfile.zodiac', { scope: 'account_user_profile', owner: 'private_account_owner', publishable: false, promptRoutes: NO_PROMPT_ROUTES, maxCharacters: 20, notes: '保留旧数据兼容，E2-2精简版不发送给模型。' }),
    field('accountUserProfile.personalityTags', { scope: 'account_user_profile', owner: 'private_account_owner', publishable: false, promptRoutes: NO_PROMPT_ROUTES, valueType: 'string_array', maxItems: 8, maxItemCharacters: 20, notes: '保留旧数据兼容，E2-2精简版不发送给模型。' }),
    field('accountUserProfile.career', { scope: 'account_user_profile', owner: 'private_account_owner', publishable: false, promptRoutes: NO_PROMPT_ROUTES, maxCharacters: 80, notes: '保留旧数据兼容，E2-2精简版不发送给模型。' }),
    field('accountUserProfile.hobbies', { scope: 'account_user_profile', owner: 'private_account_owner', publishable: false, promptRoutes: NO_PROMPT_ROUTES, valueType: 'string_array', maxItems: 12, maxItemCharacters: 30, notes: '保留旧数据兼容，E2-2精简版不发送给模型。' }),
    field('accountUserProfile.freeform', { scope: 'account_user_profile', owner: 'private_account_owner', publishable: false, promptRoutes: NO_PROMPT_ROUTES, maxCharacters: 1000, notes: '保留旧数据兼容，E2-2精简版不发送给模型。' }),

    field('userRelationProfile.userCall', { scope: 'user_relation_profile', owner: 'private_relationship_owner', publishable: false, promptRoutes: CHAT_DATING_ROUTES, maxCharacters: 40 }),
    field('userRelationProfile.interactionTags', { scope: 'user_relation_profile', owner: 'private_relationship_owner', publishable: false, promptRoutes: CHAT_DATING_ROUTES, valueType: 'string_array', maxItems: 6, maxItemCharacters: 30 }),
    field('userRelationProfile.freeform', { scope: 'user_relation_profile', owner: 'private_relationship_owner', publishable: false, promptRoutes: CHAT_DATING_ROUTES, maxCharacters: 400 }),

    field('instanceSettings.replyMode', { scope: 'instance_settings', owner: 'private_instance_owner', publishable: false, promptRoutes: [], maxCharacters: 20 }),
    field('instanceSettings.aiOnlineMode', { scope: 'instance_settings', owner: 'private_instance_owner', publishable: false, promptRoutes: [], valueType: 'boolean' }),
    field('instanceSettings.aiLongformMode', { scope: 'instance_settings', owner: 'private_instance_owner', publishable: false, promptRoutes: [], valueType: 'boolean' }),
    field('instanceSettings.aiModelTier', { scope: 'instance_settings', owner: 'private_instance_owner', publishable: false, promptRoutes: [], maxCharacters: 20 }),
    field('instanceSettings.cardSplicing', { scope: 'instance_settings', owner: 'private_instance_owner', publishable: false, promptRoutes: [], maxCharacters: 20, notes: '字卡拼接开关：off 关闭；mixed 开启后将系统与用户字卡合池拼接。旧值 system 仅作兼容并按 mixed 执行。默认 off。' }),
    field('instanceSettings.fixedOpeningHandledAt', { scope: 'instance_settings', owner: 'private_instance_owner', publishable: false, promptRoutes: [], valueType: 'number', notes: '该梦角的固定开场已插入或因已有聊天而跳过；清空聊天记录不会重置。' }),
    field('instanceSettings.voiceMode', { scope: 'instance_settings', owner: 'private_instance_owner', publishable: false, promptRoutes: [], maxCharacters: 20 }),
    field('instanceSettings.voiceProfileId', { scope: 'instance_settings', owner: 'private_instance_owner', publishable: false, promptRoutes: [], maxCharacters: 160 })
  ]);

  const PUBLIC_EXPORT_ALLOWLIST = Object.freeze(FIELD_DEFINITIONS
    .filter((item) => item.publishable)
    .map((item) => item.path));

  const legacy = (source, target, options = {}) => Object.freeze({
    source,
    target,
    strategy: options.strategy || 'copy',
    priority: options.priority || 0,
    notes: options.notes || ''
  });

  const LEGACY_FIELD_MAPPINGS = Object.freeze([
    legacy('dream.name', 'characterProfile.basic.displayName'),
    legacy('dream.avatar', 'characterProfile.media.privateAvatarRef', { strategy: 'private_reference_only', notes: '不得直接进入公开模板。' }),
    legacy('dream.personaProfile.schemaVersion', 'characterProfile.schemaVersion', { strategy: 'replace_with_current_schema' }),
    legacy('dream.personaProfile.mbti', 'characterProfile.basic.mbti'),
    legacy('dream.personaProfile.zodiac', 'characterProfile.basic.zodiac'),
    legacy('dream.personaProfile.tags', 'characterProfile.personality.tags'),
    legacy('dream.personaProfile.personality', 'characterProfile.personality.core'),
    legacy('dream.personaProfile.speechStyle', 'characterProfile.speech.freeform'),
    legacy('dream.personaProfile.background', 'characterProfile.background.summary'),
    legacy('dream.personaProfile.relationship', 'relationshipProfile.foundation.freeform'),
    legacy('dream.personaProfile.preferences', 'characterProfile.preferences.freeform'),
    legacy('dream.personaProfile.boundaries', 'characterProfile.principles.freeform'),
    legacy('dream.personaProfile.exampleDialogue', 'characterProfile.exampleDialogues', { strategy: 'single_legacy_dialogue' }),
    legacy('dream.personaProfile.freeform', 'characterProfile.other.freeform'),
    legacy('dream.personaProfile.updatedAt', 'characterProfile.updatedAt', { strategy: 'metadata' }),
    legacy('dream.datingUserProfile.mbti', 'accountUserProfile.mbti'),
    legacy('dream.datingUserProfile.zodiac', 'accountUserProfile.zodiac'),
    legacy('dream.datingUserProfile.personalityTags', 'accountUserProfile.personalityTags'),
    legacy('dream.datingUserProfile.career', 'accountUserProfile.career'),
    legacy('dream.datingUserProfile.hobbies', 'accountUserProfile.hobbies'),
    legacy('dream.datingUserProfile.freeform', 'userRelationProfile.freeform', { notes: '旧自由补充默认保留在当前关系，避免未经用户确认扩散给所有角色。' }),
    legacy('dream.datingUserProfile.updatedAt', 'userRelationProfile.updatedAt', { strategy: 'metadata' }),
    legacy('dream.userNickname', 'userRelationProfile.userCall', { strategy: 'fallback', priority: 10 }),
    legacy('dream.userCall', 'userRelationProfile.userCall', { strategy: 'preferred', priority: 20 }),
    legacy('dream.relationshipProfile.opening.freeform', 'characterProfile.opening.freeform', { strategy: 'preferred', priority: 30, notes: '旧私人开场仅无损归并到隐藏兼容字段，不再显示、公开或投影。' }),
    legacy('dream.templateDefaults.opening.freeform', 'characterProfile.opening.freeform', { strategy: 'fallback', priority: 20, notes: '旧开场仅在没有旧私人开场时归并到隐藏兼容字段；模板副本由开场合同兼容读取。' }),
    legacy('dream.replyMode', 'instanceSettings.replyMode'),
    legacy('dream.aiOnlineMode', 'instanceSettings.aiOnlineMode'),
    legacy('dream.aiActionMode', 'instanceSettings.aiOnlineMode', { strategy: 'invert_boolean', notes: '旧动作模式关闭等价于新版线上模式开启。' }),
    legacy('dream.aiLongformMode', 'instanceSettings.aiLongformMode'),
    legacy('dream.aiModelTier', 'instanceSettings.aiModelTier'),
    legacy('dream.cardSplicing', 'instanceSettings.cardSplicing'),
    legacy('dream.voiceMode', 'instanceSettings.voiceMode')
  ]);

  const PRECEDENCE_RULES = Object.freeze([
    'explicit_freeform_over_tags',
    'specialized_field_over_other_freeform',
    'explicit_personality_over_mbti_and_zodiac',
    'user_declared_relationship_foundation_over_ai_inference',
    'system_safety_over_all_user_and_creator_content'
  ]);

  function fieldByPath(path) {
    return FIELD_DEFINITIONS.find((item) => item.path === String(path || '')) || null;
  }

  function promptPathsFor(route) {
    const normalized = String(route || '');
    return FIELD_DEFINITIONS.filter((item) => item.promptRoutes.includes(normalized)).map((item) => item.path);
  }

  function validateContract() {
    const issues = [];
    const seen = new Set();
    FIELD_DEFINITIONS.forEach((item) => {
      if (seen.has(item.path)) issues.push(`duplicate_field:${item.path}`);
      seen.add(item.path);
      item.promptRoutes.forEach((route) => {
        if (!PROMPT_ROUTES.includes(route)) issues.push(`unknown_prompt_route:${item.path}:${route}`);
      });
      if (item.publishable && !['character_profile', 'template_metadata', 'template_defaults'].includes(item.scope)) {
        issues.push(`private_scope_publishable:${item.path}`);
      }
    });
    PROMPT_ROUTES.forEach((route) => {
      if (!PROMPT_ROUTE_LABELS[route]) issues.push(`missing_prompt_route_label:${route}`);
    });
    Object.keys(PROMPT_ROUTE_LABELS).forEach((route) => {
      if (!PROMPT_ROUTES.includes(route)) issues.push(`orphan_prompt_route_label:${route}`);
    });
    PUBLIC_EXPORT_ALLOWLIST.forEach((path) => {
      const definition = fieldByPath(path);
      if (!definition || !definition.publishable) issues.push(`invalid_public_allowlist:${path}`);
    });
    LEGACY_FIELD_MAPPINGS.forEach((mapping) => {
      const isMetadata = /\.(?:schemaVersion|updatedAt)$/.test(mapping.target);
      if (!isMetadata && !fieldByPath(mapping.target)) issues.push(`legacy_target_missing:${mapping.source}:${mapping.target}`);
    });
    return Object.freeze(issues);
  }

  return Object.freeze({
    CONTRACT_VERSION,
    ACTIVE_STORAGE_SCHEMA_VERSIONS,
    TARGET_PROFILE_SCHEMA_VERSIONS,
    TARGET_SCHEMA_ACTIVATION_STAGE,
    CHARACTER_PROFILE_ACTIVATION_STATUS,
    RELATIONSHIP_PROFILE_ACTIVATION_STATUS,
    OPENING_ACTIVATION_STATUS,
    PROJECTION_VERSIONS,
    PROMPT_ROUTES,
    PROMPT_ROUTE_LABELS,
    ROUTE_BUDGETS,
    FIELD_DEFINITIONS,
    PUBLIC_EXPORT_ALLOWLIST,
    LEGACY_FIELD_MAPPINGS,
    PRECEDENCE_RULES,
    fieldByPath,
    promptPathsFor,
    validateContract
  });
});
