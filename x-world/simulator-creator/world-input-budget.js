'use strict';
// X103 世界侧输入预算：按「各阶段峰值」估算一个世界模板在真实 WorldRun 中每轮带给模型的世界侧字符数，
// 并据此确定模拟器附加 X能量档位。发布时写入 WorldVersion，游玩中不重算。
//
// 本文件不依赖其他模块，Node（发布检查）与浏览器（创作工作台实时显示）共用同一份逻辑。
// 计入：世界上下文、分层剧情目录、创作者导演指令、候选范围、阶段轮次、进度、权威状态核对。
// 不计入：平台固定指令、聊天历史（含开场白、历史消息 ID 列表）、当前用户消息。
// 动态计数一律取上限（与发布时的目录估算同口径）；变量取初始/最长枚举值，每个在场角色计一条关系记录。
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SHEXWorldInputBudget = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const WORLD_INPUT_BUDGET_VERSION = 'world-input-budget-v2';
  const MAX_WORLD_INPUT_CHARS = 33000;
  const MAX_CHAPTER_DIRECTORY_CHARS = 8000;
  const SURCHARGE_TIERS = Object.freeze([
    Object.freeze({ maxChars: 16000, energy: 2 }),
    Object.freeze({ maxChars: 22000, energy: 3 }),
    Object.freeze({ maxChars: 28400, energy: 4 }),
    Object.freeze({ maxChars: MAX_WORLD_INPUT_CHARS, energy: 5 }),
  ]);
  const DEFAULT_SURCHARGE_ENERGY = 2;
  const NUMBER_TYPES = ['number', 'integer', 'counter'];
  const MENTIONED_ROLE_ALLOWANCE = 2;
  // 各 section 的固定外壳（前缀、固定规则文案、JSON 结构字段），按现有 Prompt 实测取整并留余量。
  const FIXED = Object.freeze({ scope: 180, stageRound: 60, progress: 560, creator: 60, checkpoint: 90, relationshipEntry: 80 });
  // 与 story-index-projection.js 的 GUIDANCE、STORY_INDEX_PREFIX 字符数保持一致（由测试锁定）。
  const STORY_INDEX_GUIDANCE_CHARS = 180;
  const STORY_INDEX_PREFIX_CHARS = 28;
  const EVENT_STATES = ['locked', 'available', 'active', 'completed', 'skipped'];

  function chars(value) { return Array.from(String(value == null ? '' : value)).length; }
  function json(value) { return chars(JSON.stringify(value === undefined ? null : value)); }
  function list(value) { return Array.isArray(value) ? value : []; }
  function plain(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
  function ordered(items) { return list(items).slice().sort((a, b) => Number(a && a.order || 0) - Number(b && b.order || 0)); }

  function surchargeForChars(worldInputChars) {
    const n = Math.max(0, Math.ceil(Number(worldInputChars) || 0));
    for (let index = 0; index < SURCHARGE_TIERS.length; index += 1) {
      if (n <= SURCHARGE_TIERS[index].maxChars) return { tier: index + 1, energy: SURCHARGE_TIERS[index].energy, exceedsLimit: false };
    }
    return { tier: SURCHARGE_TIERS.length, energy: SURCHARGE_TIERS[SURCHARGE_TIERS.length - 1].energy, exceedsLimit: true };
  }

  // 用于估算的变量取值：枚举取最长项、数字取位数最多的边界，文本取初始值。
  function expectedValue(variable) {
    const initial = variable.initialValue;
    if (Array.isArray(variable.enumValues) && variable.enumValues.length) {
      return variable.enumValues.reduce((longest, item) => json(item) > json(longest) ? item : longest, initial);
    }
    if (NUMBER_TYPES.includes(variable.type)) {
      const candidates = [initial, variable.min, variable.max].filter(item => typeof item === 'number');
      return candidates.reduce((longest, item) => json(item) > json(longest) ? item : longest, candidates.length ? candidates[0] : 0);
    }
    if (typeof initial === 'boolean') return false;
    return String(initial == null ? '' : initial);
  }

  function pick(value, keys) { const out = {}; keys.forEach(key => { if (Object.prototype.hasOwnProperty.call(value || {}, key)) out[key] = value[key]; }); return out; }
  function budgetCounts(count) { const out = {}; if (count) EVENT_STATES.forEach(state => { out[state] = count; }); return out; }

  // 与发布检查同口径的「章节剧情目录」字符数：projectStoryIndexPayload(budget:true) 的无依赖移植。
  // 全书章节轻目录 + 本章各阶段标题/摘要 + 本章各事件标题/摘要 + 顺序与进度状态（状态计数取上限）。
  // 游玩中途的典型状态计数：事件一部分已完成、一部分待进行（保守口径则假设五种状态同时出现）。
  function typicalCounts(count) {
    if (!count) return {};
    if (count === 1) return { completed: 1 };
    return { available: Math.ceil(count / 2), completed: Math.floor(count / 2) };
  }

  function chapterDirectoryChars(template, chapter, typical) {
    const counts = typical === true ? typicalCounts : budgetCounts;
    const chapters = ordered(plain(template).chapters);
    const stages = ordered(chapter.stages);
    const longestStageId = stages.map(stage => String(stage.stageId)).sort((a, b) => chars(b) - chars(a))[0] || '';
    const payload = {
      currentPosition: { chapterId: chapter.chapterId, stageId: longestStageId },
      chapters: chapters.map(item => ({
        ...pick(item, ['chapterId', 'title', 'summary', 'order', 'metadataUnavailable']),
        positionStatus: typical === true && item.chapterId !== chapter.chapterId ? 'other' : 'current',
        stateEventCounts: counts(list(item.stages).reduce((sum, stage) => sum + list(stage.events).length, 0)),
      })),
      currentChapter: {
        ...pick(chapter, ['chapterId', 'title', 'summary', 'order']),
        stages: stages.map((stage, stageIndex) => ({
          ...pick({ chapterId: chapter.chapterId, ...stage }, ['chapterId', 'stageId', 'title', 'summary', 'order', 'mode']),
          positionStatus: typical === true && stageIndex > 0 ? 'other' : 'current',
          occurrenceRecordPresent: true, recordedOccurrence: typical === true ? 1 : Number.MAX_SAFE_INTEGER, stateEventCounts: counts(list(stage.events).length),
          events: list(stage.events).map((event, index) => ({
            ...pick(event, ['eventId', 'title', 'summary']), order: event.order == null ? index + 1 : event.order,
            ...(event.required === true ? { required: true } : {}), ...(event.enabled === false ? { enabled: false } : {}),
            ...(event.hidden === true ? { hidden: true } : {}), ...(event.random ? { random: true } : {}), state: 'completed',
          })),
        })),
      },
    };
    // {"guidance":"…", 其余} ：guidance 键值对与分隔逗号的固定字符数单独加上。
    return STORY_INDEX_PREFIX_CHARS + json(payload) + STORY_INDEX_GUIDANCE_CHARS + '"guidance":"",'.length;
  }

  // 与 public-character-profile.js 的 characterProfile 字段形状一致：运行时只带这些公开字段，其余会被丢弃。
  const PROFILE_SHAPE = Object.freeze({
    basic: { displayName: 't', gender: 't', selfReference: 't', age: 't', mbti: 't', zodiac: 't' },
    world: { worldType: 't', customWorld: 't' },
    identity: { tags: 'a', customIdentity: 't' },
    appearance: { summary: 't', details: 't' },
    background: { summary: 't' },
    personality: { tags: 'a', core: 't' },
    dailyLife: { tags: 'a', goalsAndRoutine: 't' },
    speech: { amount: 't', tones: 'a', habits: 'a', languages: 'a', needsTranslation: 'b', freeform: 't' },
    preferences: { tags: 'a', freeform: 't' },
    principles: { freeform: 't' },
    exampleDialogues: 'd',
    other: { freeform: 't' },
  });
  function projectProfile(source, shape) {
    if (!source || typeof source !== 'object' || Array.isArray(source)) return undefined;
    const out = {};
    Object.keys(shape).forEach(key => {
      const rule = shape[key], value = source[key];
      let next;
      if (rule === 't') next = typeof value === 'string' ? value.trim() : undefined;
      else if (rule === 'b') next = typeof value === 'boolean' ? value : undefined;
      else if (rule === 'a') next = Array.isArray(value) ? Array.from(new Set(value.filter(item => typeof item === 'string').map(item => item.trim()).filter(Boolean))) : undefined;
      else if (rule === 'd') next = Array.isArray(value) ? value.filter(item => item && typeof item === 'object' && !Array.isArray(item)).map(item => {
        const row = {}, content = item.content == null ? item.text : item.content;
        if (typeof item.scene === 'string') row.scene = item.scene.trim();
        if (typeof content === 'string') row.content = content.trim();
        return row;
      }) : undefined;
      else next = projectProfile(value, rule);
      if (next !== undefined && (Array.isArray(next) || typeof next !== 'object' || Object.keys(next).length > 0)) out[key] = next;
    });
    return out;
  }

  // 更贴近真实游玩的章节剧情目录字符数，只用于创作工作台显示。
  // 发布拦截与定价仍用 chapterDirectoryChars 的保守口径，保证任何进度下都不超限。
  function chapterDirectoryTypicalChars(template, chapter) {
    return chapterDirectoryChars(template, chapter, true);
  }

  function roleView(role, characterProfiles, light) {
    const exclusive = plain(role.exclusiveProfile);
    const rawProfile = exclusive.characterProfile || (Object.keys(exclusive).length ? null : plain(characterProfiles)[role.roleId]) || null;
    let profile = rawProfile ? projectProfile(rawProfile, PROFILE_SHAPE) : null;
    if (light && profile) profile = profile.basic ? { basic: pick(profile.basic, ['displayName', 'gender', 'selfReference', 'age']) } : {};
    return {
      roleId: role.roleId, sourceType: role.sourceType, displayName: role.displayName,
      ...(profile && Object.keys(profile).length ? { characterProfile: profile } : {}),
      ...(role.simulatorNotes ? { simulatorNotes: role.simulatorNotes } : {}), source: 'immutable_character_version',
    };
  }

  function measureStage(template, chapter, stage, shared, options) {
    const events = list(stage.events);
    // 运行时角色与地点范围按章节声明取，再并入阶段与事件引用到的。
    const roleIds = new Set([...list(chapter.roleIds), ...list(stage.roleIds), ...events.flatMap(event => list(event.roleIds))]);
    const scopedRoles = shared.roles.filter(role => roleIds.size ? roleIds.has(role.roleId) : true);
    const locationIds = new Set([...list(chapter.locationIds), ...list(stage.locationIds), ...events.map(event => event.locationId).filter(Boolean)]);
    const locations = list(plain(template.world).locations).filter(item => locationIds.size ? locationIds.has(item.locationId) : true);
    const routeIds = new Set(events.map(event => event.routeId).filter(Boolean));
    const routes = list(plain(template.state).routes).filter(route => routeIds.has(route.routeId));
    // 在场角色超过 3 个时，运行时只给「本阶段事件涉及的角色」和「最近对话点到名的角色」带完整资料，其余只带基础身份。
    // 这里按：事件涉及的角色完整 + 另外资料最长的 2 个角色完整（对应被点名的情况），其余轻量。
    let roleViews = scopedRoles.map(role => roleView(role, options.characterProfiles, false));
    if (scopedRoles.length > 3) {
      const relevant = new Set(events.filter(event => event.hidden !== true && event.enabled !== false).flatMap(event => list(event.roleIds)));
      if (!relevant.size) scopedRoles.slice(0, 2).forEach(role => relevant.add(role.roleId));
      scopedRoles.map((role, index) => ({ roleId: role.roleId, size: json(roleViews[index]) })).filter(item => !relevant.has(item.roleId))
        .sort((a, b) => b.size - a.size).slice(0, MENTIONED_ROLE_ALLOWANCE).forEach(item => relevant.add(item.roleId));
      roleViews = scopedRoles.map((role, index) => relevant.has(role.roleId) ? roleViews[index] : roleView(role, options.characterProfiles, true));
    }
    const { events: _events, ...stageFields } = stage;
    const context = {
      events: events.map(event => ({ ...event, conditions: event.conditions === undefined ? null : event.conditions, state: 'available', source: 'immutable_world', stateSource: 'r8_current_state' })),
      locations: locations.map(item => ({ locationId: item.locationId, name: item.name, summary: item.summary, current: true, active: true })),
      position: {
        chapter: { chapterId: chapter.chapterId, directorNotes: chapter.directorNotes, summary: chapter.summary, title: chapter.title },
        occurrence: 999, source: 'immutable_world',
        stage: { ...stageFields, entryCondition: stage.entryCondition === undefined ? null : stage.entryCondition,
          completionCondition: stage.completionCondition === undefined ? null : stage.completionCondition,
          completionConditionResult: 'not_satisfied_yet', runtimeGuidance: '字'.repeat(120) },
      },
      roles: roleViews,
      routes: routes.map(route => ({ routeId: route.routeId, title: route.title, summary: route.summary })),
      source: 'immutable_world',
      state: { allowedUserActions: [], items: shared.items.map(item => ({ itemId: item.itemId, quantity: 999 })), recentEvents: [], relationships: [],
        source: 'r8_current_state', variables: shared.stateVariables },
      world: shared.world,
    };
    const privateVariableCopies = Math.max(0, scopedRoles.length - 1) * shared.privateVariableChars;
    const scope = json({ allowedKinds: ['event_candidate', 'variable_candidate', 'chapter_transition_candidate'],
      allowedTargets: { items: shared.items.map(item => item.itemId), roles: scopedRoles.map(role => role.roleId), variables: shared.scopeVariables } }) + FIXED.scope;
    const open = events.map(event => ({ eventId: event.eventId, title: event.title }));
    const breakdown = {
      worldContext: json(context) + scopedRoles.length * FIXED.relationshipEntry + privateVariableCopies,
      storyDirectory: shared.directoryChars[chapter.chapterId],
      creatorInstructions: shared.creatorChars,
      candidateScope: scope,
      progress: json({ completedEvents: shared.chapterEventBriefs[chapter.chapterId].filter(item => !events.some(event => event.eventId === item.eventId)), currentStageOpenEvents: open, currentStageRequiredOpen: open,
        nextStage: { chapterId: chapter.chapterId, stageId: stage.stageId, title: stage.title, firstEvents: open.slice(0, 2) } }) + FIXED.progress,
      stageRound: json({ chapterTitle: chapter.title, stageTitle: stage.title, roundCompletionEventIds: events.map(event => event.eventId) }) + FIXED.stageRound,
      stateCheckpoint: shared.checkpointChars + privateVariableCopies,
    };
    const total = Object.values(breakdown).reduce((sum, value) => sum + value, 0);
    return { chapterId: chapter.chapterId, stageId: stage.stageId, chars: total, breakdown };
  }

  function measureWorldInput(templateInput, options = {}) {
    const template = plain(templateInput);
    const chapters = ordered(template.chapters);
    const world = plain(template.world), overview = plain(template.overview), director = plain(template.director), state = plain(template.state);
    const variables = list(state.variables);
    const items = list(state.items);
    const isPrivate = variable => variable.scope === 'character_private';
    const stateVariable = variable => ({ key: variable.key, scope: variable.scope || 'world_shared', source: 'r8_current_state', type: variable.type,
      value: expectedValue(variable), ...(isPrivate(variable) ? { characterId: 'x'.repeat(24) } : {}) });
    const scopeVariable = variable => ({ target: { key: variable.key, ...(isPrivate(variable) ? { characterId: '<WorldVersion roleId>' } : {}) }, type: variable.type,
      ...(Array.isArray(variable.enumValues) ? { enumValues: variable.enumValues } : {}),
      ...(typeof variable.min === 'number' ? { min: variable.min } : {}), ...(typeof variable.max === 'number' ? { max: variable.max } : {}), currentValue: expectedValue(variable) });
    const { candidatePolicy: _policy, outputContractVersion: _version, ...creator } = director;
    const checkpointLine = variable => chars(variable.key) + json(expectedValue(variable)) + 2 + (isPrivate(variable) ? 36 : 0);
    const shared = {
      roles: list(plain(template.roster).characters),
      items,
      world: { premise: world.premise, rules: list(world.rules), safetyNotes: list(world.safetyNotes), summary: overview.summary || world.summary, title: overview.title || world.title, toneTags: list(world.toneTags) },
      stateVariables: variables.map(stateVariable),
      scopeVariables: variables.filter(variable => variable.aiWritable !== false).map(scopeVariable),
      privateVariableChars: variables.filter(isPrivate).reduce((sum, variable) => sum + json(stateVariable(variable)) + 1, 0),
      creatorChars: Object.keys(creator).length ? json(creator) + FIXED.creator : 0,
      checkpointChars: FIXED.checkpoint + variables.reduce((sum, variable) => sum + checkpointLine(variable), 0) + items.reduce((sum, item) => sum + chars(item.itemId) + 20, 0),
      directoryChars: {}, chapterEventBriefs: {},
    };
    const chapterDirectories = chapters.map(chapter => {
      const directoryChars = chapterDirectoryChars(template, chapter);
      shared.directoryChars[chapter.chapterId] = directoryChars;
      shared.chapterEventBriefs[chapter.chapterId] = ordered(chapter.stages).flatMap(stage => list(stage.events).map(event => ({ eventId: event.eventId, title: event.title })));
      return { chapterId: chapter.chapterId, title: chapter.title, chars: directoryChars, typicalChars: chapterDirectoryTypicalChars(template, chapter), maxChars: MAX_CHAPTER_DIRECTORY_CHARS, exceedsLimit: directoryChars > MAX_CHAPTER_DIRECTORY_CHARS };
    });
    const stages = chapters.flatMap(chapter => ordered(chapter.stages).map(stage => measureStage(template, chapter, stage, shared, options)));
    const peak = stages.reduce((best, stage) => !best || stage.chars > best.chars ? stage : best, null);
    const worldInputChars = peak ? peak.chars : 0;
    const surcharge = surchargeForChars(worldInputChars);
    const unresolved = shared.roles.filter(role => !Object.keys(plain(role.exclusiveProfile)).length && !plain(options.characterProfiles)[role.roleId]).map(role => role.roleId);
    return {
      version: WORLD_INPUT_BUDGET_VERSION,
      worldInputChars, maxWorldInputChars: MAX_WORLD_INPUT_CHARS, exceedsLimit: surcharge.exceedsLimit,
      tier: surcharge.tier, surchargeEnergy: surcharge.energy,
      peakStage: peak ? { chapterId: peak.chapterId, stageId: peak.stageId, breakdown: peak.breakdown } : null,
      stages: stages.map(stage => ({ chapterId: stage.chapterId, stageId: stage.stageId, chars: stage.chars, breakdown: stage.breakdown })),
      chapterDirectories,
      // 引用已有角色版本、但这里拿不到其公开资料的角色：它们的资料没有计入，结果会偏低。
      unresolvedCharacterRoleIds: unresolved,
    };
  }

  // 写入 WorldVersion 的不可变定价块。
  function pricingBlockFor(measurement) {
    return Object.freeze({ budgetVersion: measurement.version, worldInputChars: measurement.worldInputChars, tier: measurement.tier, surchargeEnergy: measurement.surchargeEnergy });
  }

  // 读取某个 WorldVersion 的模拟器附加能量；没有定价块时返回 null，由调用方现算或回落到最低档。
  function surchargeEnergyOfVersion(versionHead) {
    const pricing = versionHead && versionHead.pricing;
    // 统一使用当前四档；冻结的峰值字符数不变，不改写已有 WorldVersion。
    if (typeof pricing?.worldInputChars === 'number' && Number.isFinite(pricing.worldInputChars) && pricing.worldInputChars >= 0) {
      return surchargeForChars(pricing.worldInputChars).energy;
    }
    const energy = Number(pricing && pricing.surchargeEnergy);
    return SURCHARGE_TIERS.some(tier => tier.energy === energy) ? energy : null;
  }

  return Object.freeze({ WORLD_INPUT_BUDGET_VERSION, MAX_WORLD_INPUT_CHARS, MAX_CHAPTER_DIRECTORY_CHARS, SURCHARGE_TIERS, DEFAULT_SURCHARGE_ENERGY,
    surchargeForChars, measureWorldInput, pricingBlockFor, surchargeEnergyOfVersion, chapterDirectoryChars, chapterDirectoryTypicalChars });
});
