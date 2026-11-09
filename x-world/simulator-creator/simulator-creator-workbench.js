(function initSimulatorCreator(root, factory) {
  const api = factory(root?.SHEXSimulatorCreatorState || (typeof require === 'function' ? require('./simulator-creator-state') : null));
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SHEXSimulatorCreator = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function buildSimulatorCreator(stateApi) {
  'use strict';

  const STEPS = Object.freeze([
    ['overview', '作品资料'], ['world', '世界与角色'], ['state', '状态与关系'],
    ['story', '剧情与循环'], ['director', 'AI导演'], ['publish', '检查与发布'],
  ]);
  const CANDIDATE_KINDS = Object.freeze([
    ['event_candidate', '事件候选', '允许 AI 根据本轮剧情提议某个当前可用事件发生或完成。系统会检查事件状态、触发方式和条件，通过后才会应用事件及其声明效果。'],
    ['variable_candidate', '变量变化候选', '允许 AI 提议修改已开启“允许 AI 修改”的变量。变量类型、范围和当前值仍由系统校验。'],
    ['chapter_transition_candidate', '章节阶段切换候选', '允许 AI 提议进入这个已发布世界中的任意章节阶段。系统会核对目标确实存在。'],
  ]);
  const EDITABLE_CANDIDATE_KINDS = new Set(['event_candidate', 'variable_candidate']);
  function editableKindsForProfile(runtimeProfile) {
    return runtimeProfile === 'ai_directed_v1'
      ? new Set(CANDIDATE_KINDS.map(([kind]) => kind)) : EDITABLE_CANDIDATE_KINDS;
  }
  function editableCandidateKinds(value, runtimeProfile) {
    const supported = editableKindsForProfile(runtimeProfile);
    return [...new Set((Array.isArray(value) ? value : []).filter(kind => supported.has(kind)))];
  }
  function nextEditableCandidateKinds(value, kind, checked, runtimeProfile) {
    if (!editableKindsForProfile(runtimeProfile).has(kind)) return null;
    const allowed = new Set(editableCandidateKinds(value, runtimeProfile));
    if (checked) allowed.add(kind); else allowed.delete(kind);
    return allowed.size ? [...allowed] : null;
  }
  const SAVE_TRACE_LIMIT = 300;
  const SAVE_TRACE_STORE_KEY = '__SHEX_WORLD_DRAFT_SAVE_TRACE_V1__';
  const TAG_PAGE_REQUEST_LIMIT = 5;
  const VARIABLE_TYPES = Object.freeze([['number', '数字'], ['string', '文本'], ['boolean', '是 / 否'], ['enum', '选项']]);
  const CONDITION_TYPES = Object.freeze([['variableCompare', '变量比较'], ['relationshipCompare', '关系比较'], ['eventState', '事件状态'], ['stageComplete', '阶段完成']]);
  const EVENT_STATE_OPTIONS = Object.freeze([['locked', '尚未开放'], ['available', '可以触发'], ['active', '进行中'], ['completed', '已完成'], ['skipped', '已跳过']]);
  const EFFECT_TYPES = Object.freeze([['variablePatch', '变量变化'], ['relationshipPatch', '关系变化'], ['chapterProgressPatch', '章节进度'], ['choicePatch', '选择记录']]);
  const RELATION_AXES = Object.freeze([
    ['familiarity', '熟悉度'], ['affinity', '好感度'], ['trust', '信任度'],
    ['tension', '紧张度'], ['attraction', '吸引力'], ['dependency', '依赖度'],
  ]);
  const RELATION_LEVELS = Object.freeze({
    familiarity: Object.freeze(['陌生', '见过', '熟悉', '很熟', '非常熟悉']),
    affinity: Object.freeze(['讨厌', '冷淡', '一般', '有好感', '很喜欢']),
    trust: Object.freeze(['戒备', '保留', '一般', '信任', '非常信任']),
    tension: Object.freeze(['放松', '自然', '有点紧张', '紧绷', '强烈对立']),
  });
  // 全部“? 说明”共用同一套浅紫小弹窗，只按 key 换标题与正文，不新增第二套样式。
  const HELP_CONFIRM_TEXT = '知道了';
  const HELP_CONTENTS = Object.freeze({
    chapter: Object.freeze({
      title: '什么是章节？',
      body: '章节是整个故事里比较大的剧情部分\n比如一个恋爱世界可以分成「第一次见面」「逐渐熟悉」「关系升温」「确认关系」几个章节\n每个章节下面还可以继续添加更具体的阶段\n世界至少需要有一个可以运行的章节，并且这个章节里至少要有一个阶段，才能正常开始',
    }),
    stage: Object.freeze({
      title: '什么是阶段？',
      body: '阶段是一个章节里更具体的场景\n比如「第一次见面」这一章，可以继续分成「在咖啡店碰见」「坐下来聊天」「一起离开」几个阶段\n每个阶段可以单独设置角色、地点、运行方式，以及这个阶段里会发生的事件\n阶段必须属于某一个章节，世界至少需要有一个可运行的阶段\n事件可以之后再添加，不是发布世界的必填内容',
    }),
    event: Object.freeze({
      title: '什么是事件？',
      body: '事件是某个阶段里可能发生的一件具体事情\n比如「第一次牵手」「发生争吵」「收到一封信」「遇到特殊角色」都可以做成事件\n事件一定属于某个阶段\n事件不是发布世界的必填内容，没有事件也可以发布\n但如果一个阶段完全没有事件，这个阶段就没有具体的剧情事件可以推进',
    }),
    loop: Object.freeze({
      title: '什么是可以重复多轮？',
      body: '适合会反复经历的场景，比如每天经营店铺、反复上课、日常约会\n选择以后，需要设置「什么时候开始下一轮」\n当条件满足时，这个阶段会重新开始新的一轮\n它不会自动进入下一个阶段，如果想离开当前阶段，需要通过剧情事件推动到下一个阶段',
    }),
    route: Object.freeze({
      title: '什么是剧情分支？',
      body: '剧情分支用来做不同的发展路线\n比如同一个世界可以有「友情线」「恋爱线」「黑化线」\n它不是地图路线，也不是章节顺序\n如果你的世界只有一条剧情，可以完全不创建剧情分支',
    }),
    variables: Object.freeze({
      title: '什么是变量？',
      body: '用来记录这个世界里会发生变化的内容\n比如金币、食物、任务进度、好感变化，或者「有没有拿到钥匙」\n你可以设置它一开始是什么状态，也可以决定之后由剧情事件改变，或让 AI 提议修改并由系统校验\n如果你的世界不需要记录这些变化，也不用为了填满内容强行添加',
    }),
    mainEvent: Object.freeze({
      title: '什么是主线事件？',
      body: '主线事件表示这件事属于主要剧情的一部分，并会被算进剧情进度\n比如「第一次见面」「找到关键线索」「确认关系」都可以设为主线事件\n勾选主线事件，不代表它会自动发生\nAI 是否能推动它，仍由事件当前状态、触发方式和系统条件决定',
    }),
    chapterDirectory: Object.freeze({
      title: '什么是章节剧情目录？',
      body: '剧情目录是玩家进入这一章后，AI 每一轮都会看到的本章总览\n包括：本章标题和摘要、本章各阶段的标题和摘要、本章各事件的标题和摘要，以及必要的编号、顺序和进度状态\n其他章节不会在这里展开，只有玩家进入那一章时才展开那一章\n每章目录不能超过 8,000 字符。目录每轮都要带给 AI，太长会挤占聊天记忆，也会让 AI 抓不住重点\n这里显示的是玩家游玩中的典型占用；发布时会按进度记录最满的情况再留一点余量来判断是否超限\n超出时请精简摘要，不需要删剧情\n摘要只写「这一段发生什么」；详细的过程、要求和细节请写进阶段的导演备注和事件的完整设置，它们只在玩家玩到那个阶段时才带给 AI，不占目录',
    }),
    worldInput: Object.freeze({
      title: '什么是世界侧用量？',
      body: '世界侧用量是玩家游玩时，每一轮都要带给 AI 的作品内容，按内容最多的那个阶段计算\n包括：世界背景和规则、导演说明、当前章节和阶段的详细内容、在场角色资料、变量，以及本章剧情目录\n不包括：聊天记录、开场白、玩家发的消息\n它决定这个模拟器每次回复在模型价格之外附加多少 X能量：16,000 以内 +2，16,001～22,000 +3，22,001～28,400 +4，28,401～33,000 +5\n所有模型都按同一套附加价；价格在发布时确定，玩家玩到哪一章都不会变，重新发布后按新版本重新计算\n超过 33,000 不能发布，因为留给聊天记忆的空间太少\n想降低用量，可以精简世界背景、世界规则和导演说明，或减少同一章里同时出现的角色',
    }),
    location: Object.freeze({
      title: '什么是地点？',
      body: '地点用来设置这个世界里主要会出现的活动场所\n比如学校、咖啡店、家、医院、森林\n章节和阶段都可以选择对应地点，AI 也会把这些地点作为当前世界环境的一部分来参考\n添加地点本身不会自动推动剧情\n如果你的世界不需要固定地点，也可以不添加',
    }),
  });
  const KNOWN_CONDITION_TYPES = new Set(CONDITION_TYPES.map(([value]) => value));
  const KNOWN_EFFECT_TYPES = new Set(EFFECT_TYPES.map(([value]) => value));
  let stageHelpStylePromise = null;

  function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
  function helpContent(key) {
    const entry = HELP_CONTENTS[String(key || '')] || HELP_CONTENTS.stage;
    return { title: entry.title, body: entry.body, confirmText: HELP_CONFIRM_TEXT };
  }
  // 所有说明入口都复用这一个按钮形态，避免出现两套说明样式。
  function helpButton(key, label = '') {
    const content = helpContent(key);
    return `<button type="button" class="shex-sim-help" data-simulator-help="${esc(key)}" aria-label="说明：${esc(content.title || label)}">?</button>`;
  }
  function sectionTitle(title, helpKey = '') {
    return `<div class="shex-sim-section-title"><h4>${esc(title)}</h4>${helpKey ? helpButton(helpKey, title) : ''}</div>`;
  }
  function stageHelpContent() { return helpContent('stage'); }
  function relationLevelLabel(axis, value) {
    const levels = RELATION_LEVELS[axis] || [];
    const numeric = Number.isFinite(Number(value)) ? Number(value) : 0;
    const index = numeric < 20 ? 0 : numeric < 40 ? 1 : numeric < 60 ? 2 : numeric < 80 ? 3 : 4;
    return levels[index] || '';
  }
  function orderedNarrativeBlocks(blocks, idKey) {
    return [...(Array.isArray(blocks) ? blocks : [])].filter(item => String(item?.payload?.[idKey] || '').trim())
      .sort((left, right) => Number(left?.payload?.order || 0) - Number(right?.payload?.order || 0)
        || String(left?.payload?.[idKey] || '').localeCompare(String(right?.payload?.[idKey] || '')));
  }
  function reconcileOpeningPosition(world = {}, chapterBlocks = []) {
    const next = clone(world) || {};
    const chapters = orderedNarrativeBlocks(chapterBlocks, 'chapterId');
    let chapter = chapters.find(item => String(item.payload.chapterId) === String(next.openingChapterId || '')) || chapters[0] || null;
    if (!chapter) {
      next.openingChapterId = '';
      next.openingStageId = '';
      return next;
    }
    const stages = orderedNarrativeBlocks(chapter.stageBlocks, 'stageId')
      .filter(item => String(item?.payload?.chapterId || '') === String(chapter.payload.chapterId));
    const stage = stages.find(item => String(item.payload.stageId) === String(next.openingStageId || '')) || stages[0] || null;
    next.openingChapterId = String(chapter.payload.chapterId || '');
    next.openingStageId = String(stage?.payload?.stageId || '');
    return next;
  }
  function ensureStageHelpStyle() {
    const documentRef = globalThis.document;
    if (!documentRef?.head) return Promise.resolve();
    if (documentRef.getElementById('shexSimulatorStageHelpStyle')) return Promise.resolve();
    if (stageHelpStylePromise) return stageHelpStylePromise;
    stageHelpStylePromise = new Promise((resolve, reject) => {
      const link = documentRef.createElement('link');
      link.id = 'shexSimulatorStageHelpStyle';
      link.rel = 'stylesheet';
      link.href = './x-world/astrology/components/astrology-pages.css?v=20261030-001746-x103-front-20';
      link.onload = () => resolve();
      link.onerror = () => { link.remove(); reject(new Error('阶段说明样式加载失败')); };
      documentRef.head.appendChild(link);
    }).catch(error => {
      stageHelpStylePromise = null;
      throw error;
    });
    return stageHelpStylePromise;
  }
  async function openSimulatorHelpDialog(key) {
    try { await ensureStageHelpStyle(); } catch (_) { /* 基础确认框仍可正常使用。 */ }
    if (typeof globalThis.openCustomCardConfirm !== 'function') return false;
    globalThis.openCustomCardConfirm(helpContent(key));
    const modal = globalThis.document?.querySelector?.('#ixCustomCardConfirm.show');
    if (!modal) return true;
    modal.classList.add('shex-astro-help-modal', 'shex-sim-help-modal');
    modal.dataset.astroTheme = 'light';
    if (typeof globalThis.MutationObserver === 'function') {
      const observer = new globalThis.MutationObserver(() => {
        if (modal.classList.contains('show')) return;
        modal.classList.remove('shex-astro-help-modal', 'shex-sim-help-modal');
        delete modal.dataset.astroTheme;
        observer.disconnect();
      });
      observer.observe(modal, { attributes: true, attributeFilter: ['class'] });
    }
    return true;
  }
  function openStageHelpDialog() { return openSimulatorHelpDialog('stage'); }
  function variableDisplayName(variable, index = 0) {
    // 内部 key 只用于引用和保存，普通创作者界面永远使用人类可读回退名。
    return String(variable?.displayName || '').trim()
      || String(variable?.description || '').trim()
      || `变量 ${index + 1}`;
  }
  function variableReferenceOptions(variables = [], config = {}) {
    return (Array.isArray(variables) ? variables : []).map((variable, index) => ({
      value: config.path !== false ? `variables.${String(variable?.key || '').trim()}` : String(variable?.key || '').trim(),
      label: variableDisplayName(variable, index),
      variable,
    })).filter(item => item.value);
  }
  function variableByReference(variables = [], reference = '') {
    const key = String(reference || '').replace(/^variables\./, '');
    return (Array.isArray(variables) ? variables : []).find(variable => String(variable?.key || '') === key) || null;
  }
  function transitionVariableType(variable, nextType) {
    const next = clone(variable) || {};
    next.type = nextType;
    delete next.min; delete next.max; delete next.enumValues;
    if (nextType === 'number') {
      if (typeof next.initialValue !== 'number' || !Number.isFinite(next.initialValue)) next.initialValue = 0;
      next.min = 0; next.max = 100;
    } else if (nextType === 'boolean') {
      if (typeof next.initialValue !== 'boolean') next.initialValue = false;
    } else if (nextType === 'enum') {
      next.enumValues = [];
      if (typeof next.initialValue !== 'string') next.initialValue = '';
    } else if (typeof next.initialValue !== 'string') next.initialValue = '';
    return next;
  }
  function transitionConditionType(condition, nextType, context = {}) {
    const next = clone(condition) || {};
    const priorOp = next.op; const priorValue = clone(next.value);
    ['path', 'edge', 'axis', 'field', 'eventId', 'stageId', 'mode', 'clauses'].forEach(key => delete next[key]);
    next.type = nextType;
    if (nextType === 'variableCompare') Object.assign(next, { path: context.firstVariablePath || '', op: priorOp || '==', value: priorValue ?? clone(context.firstVariable?.initialValue ?? '') });
    else if (nextType === 'relationshipCompare') Object.assign(next, { edge: context.firstEdge || '', axis: 'affinity', op: priorOp || '>=', value: priorValue ?? 0 });
    else if (nextType === 'eventState') Object.assign(next, { eventId: context.firstEventId || '', op: priorOp || '==', value: priorValue ?? 'completed' });
    else if (nextType === 'stageComplete') { delete next.op; delete next.value; next.stageId = context.firstStageId || ''; }
    return next;
  }
  function transitionEffectType(effect, nextType, context = {}) {
    const next = clone(effect) || {};
    const priorKey = next.key;
    const priorValue = clone(next.value);
    ['characterId', 'edge', 'patch'].forEach(key => delete next[key]);
    next.type = nextType;
    if (nextType === 'relationshipPatch') {
      delete next.key; delete next.value;
      Object.assign(next, { edge: context.firstEdge || '', patch: { axes: { affinity: 0 } } });
    } else if (nextType === 'variablePatch') {
      Object.assign(next, {
        key: priorKey || String(context.firstVariable?.key || ''),
        value: priorValue ?? clone(context.firstVariable?.initialValue ?? ''),
      });
    } else {
      Object.assign(next, { key: priorKey || '', value: priorValue ?? '' });
    }
    return next;
  }
  function transitionSimpleEffectKind(effect, nextKind) {
    const next = clone(effect) || {};
    const targetKey = next.targetKey;
    delete next.delta; delete next.value;
    next.kind = nextKind;
    if (nextKind === 'variable_delta') Object.assign(next, { targetKey: targetKey || '', delta: 0 });
    else if (nextKind === 'variable_set') Object.assign(next, { targetKey: targetKey || '', value: '' });
    else delete next.targetKey;
    return next;
  }
  function characterDraftId(value) {
    return String(value?.characterDraftRef?.draftId || value?.draftId || '').trim();
  }
  function uniqueCharacterDraftItems(items = []) {
    const byDraftId = new Map();
    for (const item of Array.isArray(items) ? items : []) {
      const draftId = characterDraftId(item);
      if (draftId && !byDraftId.has(draftId)) byDraftId.set(draftId, item);
    }
    return [...byDraftId.values()];
  }
  function independentWorldRole(role) {
    const next = clone(role);
    if (next.sourceType === 'simulator_exclusive') return next;
    const snapshot = next.characterSnapshot;
    if (!snapshot?.characterProfile || typeof snapshot.characterProfile !== 'object') throw new Error('来源角色资料尚未载入，请重新打开后再编辑；原资料不会被清空。');
    next.sourceType = 'simulator_exclusive';
    next.exclusiveProfile = { characterProfile: clone(snapshot.characterProfile), ...(snapshot.templateDefaults ? { templateDefaults: clone(snapshot.templateDefaults) } : {}) };
    next.appearanceRef = {
      ...(snapshot.templateMetadata?.avatarAssetId ? { avatarAssetId: snapshot.templateMetadata.avatarAssetId } : {}),
      ...(snapshot.templateMetadata?.backgroundAssetId ? { backgroundAssetId: snapshot.templateMetadata.backgroundAssetId } : {}),
      ...clone(next.appearanceRef || {}),
      ...(next.characterVersionRef ? { sourceCharacterVersionRef: clone(next.characterVersionRef) } : {}),
    };
    delete next.characterSnapshot;
    delete next.characterVersionRef;
    return next;
  }
  function characterDraftRole(item, options = {}) {
    return independentWorldRole({
      roleId: String(options.roleId || ''),
      sourceType: 'existing_character_draft',
      displayName: String(item?.displayName || ''),
      simulatorNotes: '',
      activeChapterIds: clone(options.activeChapterIds || []),
      tags: [],
      characterDraftRef: clone(item?.characterDraftRef || { draftId: characterDraftId(item) }),
      characterSnapshot: clone(item?.characterSnapshot),
      appearanceRef: clone(item?.appearanceRef),
    });
  }
  function mergeCharacterDraftSelection(existingRoles = [], selectedItems = [], options = {}) {
    const roles = clone(Array.isArray(existingRoles) ? existingRoles : []);
    const usedDraftIds = new Set(roles.map(characterDraftId).filter(Boolean));
    const usedRoleIds = roles.map(role => String(role?.roleId || '')).filter(Boolean);
    let addedCount = 0;
    for (const item of uniqueCharacterDraftItems(selectedItems)) {
      const draftId = characterDraftId(item);
      if (!draftId || usedDraftIds.has(draftId)) continue;
      const roleId = typeof options.createRoleId === 'function'
        ? String(options.createRoleId(usedRoleIds.slice()) || '') : '';
      roles.push(characterDraftRole(item, { roleId, activeChapterIds: options.activeChapterIds }));
      usedDraftIds.add(draftId);
      if (roleId) usedRoleIds.push(roleId);
      addedCount += 1;
    }
    return Object.freeze({ roles: Object.freeze(roles), addedCount });
  }
  function replaceCharacterDraftSource(role = {}, item = {}) {
    const next = clone(role) || {};
    const worldAvatarAssetRef = clone(next.appearanceRef?.worldAvatarAssetRef);
    next.sourceType = 'existing_character_draft';
    if (!String(next.displayName || '').trim()) next.displayName = String(item?.displayName || '');
    next.characterDraftRef = clone(item?.characterDraftRef || { draftId: characterDraftId(item) });
    next.characterSnapshot = clone(item?.characterSnapshot);
    next.appearanceRef = clone(item?.appearanceRef);
    if (worldAvatarAssetRef) next.appearanceRef = { ...(next.appearanceRef || {}), worldAvatarAssetRef };
    delete next.characterVersionRef;
    delete next.exclusiveProfile;
    return independentWorldRole(next);
  }
  function roleSourceUnavailable(role = {}) {
    return ['existing_character_draft', 'existing_character_version'].includes(role?.sourceType)
      && !(role?.characterSnapshot?.characterProfile && typeof role.characterSnapshot.characterProfile === 'object');
  }
  function publicationFailureMessage(phase, error) {
    const prefix = phase === 'publish' ? '发布' : '发布检查';
    const code = String(error?.code || '');
    if (['DRAFT_REVISION_CONFLICT', 'DRAFT_REVISION_REQUIRED'].includes(code)) return `${prefix}未完成：草稿版本已变化，请重新打开草稿、保存当前改动后再检查。`;
    if (code === 'SESSION_EXPIRED') return `${prefix}未完成：登录已过期，请重新登录后重试。`;
    if (code === 'CANDIDATE_POLICY_UNSUPPORTED') return `${prefix}未完成：AI 导演的候选变化类型与当前运行模式不匹配，请到“AI 导演”检查。`;
    if (code === 'PUBLICATION_BLOCK_LIMIT_EXCEEDED') return `${prefix}未完成：章节和阶段总数超过发布容量，请合并部分阶段或拆成两个世界。`;
    if (code === 'PUBLICATION_BLOCK_BYTE_LIMIT_EXCEEDED') return `${prefix}未完成：${String(error?.blockKey || '').startsWith('stage:') ? '有一个阶段' : String(error?.blockKey || '').startsWith('chapter:') ? '有一个章节' : '有一项内容'}体积过大，请精简该处的长文本或事件效果后再试。`;
    if (code === 'PUBLICATION_BYTE_LIMIT_EXCEEDED') return `${prefix}未完成：整个世界的发布内容体积过大，请精简长文本或拆分世界后再试。`;
    if (code === 'BEAUTIFY_REFERENCE_INVALID') return `${prefix}未完成：绑定的作品美化已失效，请重新保存美化方案后再发布。`;
    if (code === 'PUBLICATION_RECEIPT_INVALID') return `${prefix}未完成：服务器没有确认发布结果，请稍后重新打开作品查看状态；若仍未发布，请联系管理员。`;
    if (['WORLD_TEMPLATE_IDENTITY_CONFLICT', 'PUBLICATION_REQUEST_CONFLICT'].includes(code)) return `${prefix}未完成：当前草稿与发布记录不一致，请重新打开草稿后再试。`;
    if (code === 'WORLD_TAG_NOT_ACTIVE') return `${prefix}未完成：所选作品标签已停用，请到“作品资料”移除或更换标签。`;
    if (code.startsWith('WORLD_PUBLIC_MEDIA_')) return `${prefix}未完成：宣传图片尚未通过安全确认或已失效，请到“作品资料”重新上传。`;
    if (code === 'WORLD_CREATOR_NETWORK_FAILED' || /TIMEOUT|NETWORK|UNAVAILABLE/.test(code)) return `${prefix}未完成：服务连接超时或暂不可用，请确认网络后再试。`;
    return phase === 'publish' ? '发布暂时没有完成，请稍后重试' : '发布检查暂时没有完成，请稍后重试';
  }
  function publicationErrorEntry(error, phase, fallbackRequestId = '') {
    return {
      phase: String(phase || 'world_publish'),
      code: String(error?.code || 'UNKNOWN'),
      requestId: String(error?.requestId || fallbackRequestId || ''),
    };
  }
  function beautifyPublicationFailureMessage(error) {
    const reason = String(error?.message || '').replace(/\s+/g, ' ').trim().slice(0, 160);
    return reason ? `作品美化同步失败：${reason}` : '作品美化同步失败，请稍后重试';
  }
  function integerOrNull(value) { return Number.isInteger(value) ? value : null; }
  function saveTraceStore() {
    if (!Array.isArray(globalThis[SAVE_TRACE_STORE_KEY])) globalThis[SAVE_TRACE_STORE_KEY] = [];
    return globalThis[SAVE_TRACE_STORE_KEY];
  }
  function recordSaveTrace(entry = {}) {
    const normalized = {
      at: Date.now(),
      phase: String(entry.phase || ''),
      draftId: String(entry.draftId || ''),
      blockKey: String(entry.blockKey || ''),
      fieldKey: String(entry.fieldKey || ''),
      requestId: String(entry.requestId || ''),
      caller: String(entry.caller || ''),
      callerStack: String(entry.callerStack || ''),
      stateSource: String(entry.stateSource || ''),
      revisionReadSource: String(entry.revisionReadSource || ''),
      revisionWriteTarget: String(entry.revisionWriteTarget || ''),
      localRevision: integerOrNull(entry.localRevision),
      draftBaseRevision: integerOrNull(entry.draftBaseRevision),
      requestBaseRevision: integerOrNull(entry.requestBaseRevision),
      requestPayloadRevision: integerOrNull(entry.requestPayloadRevision),
      backendReturnedRevision: integerOrNull(entry.backendReturnedRevision),
      backendCurrentRevision: integerOrNull(entry.backendCurrentRevision),
      contentHash: String(entry.contentHash || ''),
      errorCode: String(entry.errorCode || ''),
      message: String(entry.message || ''),
      expectedRevision: integerOrNull(entry.expectedRevision),
    };
    const entries = saveTraceStore();
    entries.push(normalized);
    if (entries.length > SAVE_TRACE_LIMIT) entries.splice(0, entries.length - SAVE_TRACE_LIMIT);
    globalThis?.console?.info?.('[WORLD_DRAFT_SAVE_TRACE]', normalized);
    return clone(normalized);
  }
  function loadSaveDiagnostics() { return clone(saveTraceStore()); }
  function clearSaveDiagnostics() { saveTraceStore().length = 0; }
  function esc(value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function lines(value) { return Array.isArray(value) ? value.join('\n') : ''; }
  function csv(value) { return Array.isArray(value) ? value.join('，') : ''; }
  function parseList(value) {
    return [...new Set(String(value || '').split(/[\n,，]/).map(item => item.trim()).filter(Boolean))];
  }
  function parseLineList(value) {
    return String(value || '').split(/\r\n?|\n/).map(item => item.trim()).filter(Boolean);
  }
  function pathParts(path) { return String(path || '').split('.').filter(Boolean).map(part => /^\d+$/.test(part) ? Number(part) : part); }
  function getAt(sourceValue, path) {
    let value = sourceValue;
    for (const part of pathParts(path)) value = value?.[part];
    return value;
  }
  function setAt(sourceValue, path, value, remove = false) {
    const source = clone(sourceValue) || {};
    const parts = pathParts(path);
    let target = source;
    parts.forEach((part, index) => {
      if (index === parts.length - 1) {
        if (remove) {
          if (Array.isArray(target)) target.splice(Number(part), 1);
          else delete target[part];
        } else target[part] = clone(value);
        return;
      }
      const nextPart = parts[index + 1];
      if (target[part] === undefined || target[part] === null || typeof target[part] !== 'object') {
        target[part] = typeof nextPart === 'number' ? [] : {};
      }
      target = target[part];
    });
    return source;
  }
  function option(value, current, label = value) { return `<option value="${esc(value)}" ${String(current) === String(value) ? 'selected' : ''}>${esc(label)}</option>`; }
  function field(label, block, path, value, options = {}) {
    const id = `sim-${block}-${path.replace(/[^A-Za-z0-9_-]/g, '-')}`;
    const common = `data-simulator-field="${esc(`${block}.${path}`)}" data-block="${esc(block)}" data-path="${esc(path)}" ${options.valueType ? `data-value-type="${esc(options.valueType)}"` : ''} ${options.maxCodepoints ? `data-max-codepoints="${Number(options.maxCodepoints)}"` : ''}`;
    let control;
    if (options.kind === 'textarea') control = `<textarea id="${id}" ${common} rows="${options.rows || 3}" ${options.max ? `maxlength="${options.max}"` : ''}>${esc(value)}</textarea>`;
    else if (options.kind === 'select') control = `<select id="${id}" ${common}>${(options.options || []).map(item => option(item[0], value, item[1])).join('')}</select>`;
    else if (options.kind === 'checkbox') control = `<input id="${id}" type="checkbox" ${common} data-value-type="boolean" ${value === true ? 'checked' : ''}>`;
    else control = `<input id="${id}" type="${options.kind || 'text'}" ${common} value="${esc(value ?? '')}" ${options.min !== undefined ? `min="${options.min}"` : ''} ${options.max !== undefined ? `max="${options.max}"` : ''} ${options.readonly ? 'readonly' : ''} ${options.placeholder ? `placeholder="${esc(options.placeholder)}"` : ''}>`;
    const helpHint = options.helpHtml ? `<small>${options.helpHtml}</small>` : (options.help ? `<small>${esc(options.help)}</small>` : '');
    const helpKey = String(options.helpKey || '');
    if (!helpKey && !options.helpHtml) return `<label class="shex-sim-field ${options.wide ? 'wide' : ''}"><span>${esc(label)}</span>${control}${helpHint}</label>`;
    // 带说明的字段用 div 包裹：? 放在 label 之外，点说明不会误触复选框/输入控件。
    return `<div class="shex-sim-field shex-sim-field-with-help ${options.wide ? 'wide' : ''}"><span class="shex-sim-field-label"><label for="${id}">${esc(label)}</label>${helpKey ? helpButton(helpKey, label) : ''}</span>${control}${helpHint}</div>`;
  }
  function referenceOptions(value) {
    const seen = new Set();
    return (Array.isArray(value) ? value : []).map((item) => ({
      value: String(item?.value ?? item?.id ?? '').trim(),
      label: String(item?.label ?? item?.name ?? '').trim(),
    })).filter(item => item.value && item.label && !seen.has(item.value) && seen.add(item.value));
  }
  function referenceField(label, block, path, current, options = [], config = {}) {
    const normalized = referenceOptions(options);
    const known = new Set(normalized.map(item => item.value));
    const currentValues = [...new Set((config.multiple ? (Array.isArray(current) ? current : []) : [current])
      .map(value => String(value || '').trim()).filter(Boolean))];
    const unknown = currentValues.filter(value => !known.has(value));
    const help = String(config.help || '');
    if (config.multiple) {
      const items = [...normalized.map(item => ({ ...item, missing: false })), ...unknown.map((value, index) => ({
        value, label: unknown.length > 1 ? `原引用已不存在 ${index + 1}` : '原引用已不存在', missing: true,
      }))];
      return `<fieldset class="shex-sim-reference-field wide" data-simulator-reference-group="${esc(`${block}.${path}`)}"><legend>${esc(label)}</legend>
        <div class="shex-sim-reference-options">${items.map(item => `<label class="${item.missing ? 'is-missing' : ''}"><input type="checkbox" data-simulator-reference data-block="${esc(block)}" data-path="${esc(path)}" value="${esc(item.value)}" ${currentValues.includes(item.value) ? 'checked' : ''}>${esc(item.label)}</label>`).join('') || '<span class="shex-sim-reference-empty">暂无可选内容</span>'}</div>
        ${help ? `<small>${esc(help)}</small>` : ''}</fieldset>`;
    }
    const selected = currentValues[0] || '';
    const choices = [['', config.placeholder || '请选择'], ...normalized.map(item => [item.value, item.label])];
    if (unknown.length) choices.push([unknown[0], '原引用已不存在']);
    return field(label, block, path, selected, { kind: 'select', options: choices, wide: config.wide === true, help });
  }
  function toggleReferenceValue(current, value, checked) {
    const target = String(value || '').trim();
    const next = [...new Set((Array.isArray(current) ? current : []).map(item => String(item || '').trim()).filter(Boolean))];
    if (!target) return next;
    const index = next.indexOf(target);
    if (checked && index < 0) next.push(target);
    if (!checked && index >= 0) next.splice(index, 1);
    return next;
  }
  function mergeCreatedTagSelection(current, tagId, limit = 10) {
    const currentIds = [...new Set((Array.isArray(current) ? current : []).map(item => String(item || '').trim()).filter(Boolean))];
    const normalizedTagId = String(tagId || '').trim();
    if (!normalizedTagId) return Object.freeze({ tagIds: Object.freeze(currentIds), selected: false, changed: false });
    if (currentIds.includes(normalizedTagId)) return Object.freeze({ tagIds: Object.freeze(currentIds), selected: true, changed: false });
    if (currentIds.length >= limit) return Object.freeze({ tagIds: Object.freeze(currentIds), selected: false, changed: false });
    return Object.freeze({ tagIds: Object.freeze([...currentIds, normalizedTagId]), selected: true, changed: true });
  }
  function remainingTagCreateName(current, submitted) {
    return String(current || '') === String(submitted || '') ? '' : String(current || '');
  }
  async function createAndSelectTag(input = {}) {
    const currentIds = [...new Set((Array.isArray(input.currentIds) ? input.currentIds : []).map(item => String(item || '').trim()).filter(Boolean))];
    if (currentIds.length >= 10) throw new Error('最多选择 10 个标签');
    if (!input.tagStore || typeof input.tagStore.create !== 'function') throw new Error('标签服务暂时不可用');
    const result = await input.tagStore.create(String(input.displayName || '').trim());
    const tag = result?.tag;
    const tagId = String(tag?.tagId || '').trim();
    const displayName = String(tag?.displayName || '').trim();
    if (!tagId || !displayName) throw new Error('标签创建结果无效，请刷新后重试');
    return Object.freeze({ ...result, tag: Object.freeze({ ...tag, tagId, displayName }), tagIds: toggleReferenceValue(currentIds, tagId, true) });
  }
  function advancedSettingsMarkup(key, body) {
    if (!String(body || '').trim()) return '';
    const normalizedKey = String(key || 'advanced').replace(/[^A-Za-z0-9_-]/g, '-');
    return `<section class="shex-sim-advanced-settings wide" data-simulator-advanced="${esc(normalizedKey)}"><button type="button" class="shex-sim-advanced-toggle" data-simulator-advanced-toggle="${esc(normalizedKey)}" aria-expanded="false">▸ 高级设置</button><div class="shex-sim-advanced-region" data-simulator-advanced-region="${esc(normalizedKey)}" hidden>${body}</div></section>`;
  }
  function toggleAdvancedPanel(button) {
    const key = String(button?.dataset?.simulatorAdvancedToggle || '');
    if (!key) return false;
    const container = button.closest?.('[data-simulator-advanced]');
    const region = container?.querySelector?.(`[data-simulator-advanced-region="${key}"]`);
    if (!region) return false;
    const expanded = region.hidden === true;
    region.hidden = !expanded;
    button.setAttribute?.('aria-expanded', expanded ? 'true' : 'false');
    button.textContent = expanded ? '▾ 高级设置' : '▸ 高级设置';
    return expanded;
  }
  function mergeTaxonomyTags(...groups) {
    const byId = new Map();
    groups.flat().forEach((item) => {
      const tagId = String(item?.tagId || '').trim();
      const displayName = String(item?.displayName || '').trim();
      if (tagId && displayName) byId.set(tagId, { ...item, tagId, displayName });
    });
    return Array.from(byId.values());
  }
  function applyTaxonomyCatalogPage(taxonomy, tagPage) {
    if (!taxonomy || !tagPage) return taxonomy;
    const tags = Array.isArray(tagPage.tags) ? tagPage.tags : [];
    if (!taxonomy.query) taxonomy.tags = tags;
    taxonomy.knownTags = mergeTaxonomyTags(taxonomy.knownTags || [], tags);
    taxonomy.catalogComplete = tagPage.complete === true;
    if (!taxonomy.query) taxonomy.notice = tagPage.complete ? '' : '标签较多，可输入名称继续搜索';
    return taxonomy;
  }
  function canSelectTaxonomyTag(status, isCurrentlySelected) {
    return isCurrentlySelected === true || String(status || 'active').trim().toLowerCase() === 'active';
  }
  function taxonomyBodyMarkup(overview, taxonomy = {}) {
    const hiddenCategoryIds = new Set(['bg', 'bl']);
    const isVisibleCategory = value => !hiddenCategoryIds.has(String(value || '').trim().toLowerCase());
    const catalogCategories = (Array.isArray(taxonomy.categories) ? taxonomy.categories : []).map(item => ({
      categoryId: String(item?.categoryId || '').trim(), displayName: String(item?.displayName || '').trim(),
    })).filter(item => item.categoryId && item.displayName);
    const categories = catalogCategories.filter(item => isVisibleCategory(item.categoryId));
    const tags = (Array.isArray(taxonomy.tags) ? taxonomy.tags : []).map(item => ({
      tagId: String(item?.tagId || '').trim(), displayName: String(item?.displayName || '').trim(), status: String(item?.status || 'active').trim().toLowerCase(),
    })).filter(item => item.tagId && item.displayName);
    const categoryId = String(overview?.categoryId || '').trim();
    const selectedTagIds = [...new Set((Array.isArray(overview?.tagIds) ? overview.tagIds : []).map(item => String(item || '').trim()).filter(Boolean))];
    const knownCategoryIds = new Set(catalogCategories.map(item => item.categoryId));
    const knownTags = mergeTaxonomyTags(taxonomy.knownTags || [], tags);
    const knownTagsById = new Map(knownTags.map(item => [item.tagId, item]));
    const knownTagIds = new Set(knownTagsById.keys());
    const catalogComplete = taxonomy.catalogComplete !== false;
    const categoryItems = categories.map(item => ({ value: item.categoryId, label: item.displayName, missing: false }));
    if (categoryId && !knownCategoryIds.has(categoryId) && isVisibleCategory(categoryId)) categoryItems.push({ value: categoryId, label: '原分类已不存在', missing: true });
    const tagItems = tags.map(item => ({ value: item.tagId, label: item.displayName, status: 'active', missing: false }));
    selectedTagIds.filter(tagId => knownTagIds.has(tagId) && !tags.some(item => item.tagId === tagId)).forEach((tagId) => {
      const tag = knownTagsById.get(tagId);
      const status = String(tag.status || 'active').trim().toLowerCase();
      tagItems.unshift({ value: tagId, label: tag.displayName, status, missing: false });
    });
    selectedTagIds.filter(tagId => !knownTagIds.has(tagId)).forEach((tagId, index, missing) => tagItems.push({
      value: tagId,
      label: catalogComplete ? '无法识别的标签' : '原标签暂未加载',
      status: 'missing',
      missing: true,
    }));
    return `<div class="shex-sim-taxonomy-section"><fieldset class="shex-sim-taxonomy-group"><legend>大类</legend><div class="shex-sim-taxonomy-options">${categoryItems.map(item => `<label class="${item.missing ? 'is-missing' : ''}"><input type="radio" name="simulator-category" data-simulator-category value="${esc(item.value)}" ${categoryId === item.value ? 'checked' : ''}>${esc(item.label)}</label>`).join('') || '<span class="shex-sim-reference-empty">暂无可选大类</span>'}</div></fieldset>
      <fieldset class="shex-sim-taxonomy-group"><legend>标签 <small>已选 ${selectedTagIds.length}/10</small></legend><label class="shex-sim-taxonomy-search"><span aria-hidden="true">⌕</span><input type="search" data-simulator-tag-search value="${esc(taxonomy.query || '')}" placeholder="搜索已有标签" autocomplete="off"></label><div class="shex-sim-taxonomy-options shex-sim-tag-options">${tagItems.map(item => `<label class="${item.missing ? 'is-missing' : item.status !== 'active' ? 'is-inactive' : ''}"><input type="checkbox" data-simulator-tag data-tag-status="${esc(item.status || 'active')}" value="${esc(item.value)}" ${selectedTagIds.includes(item.value) ? 'checked' : ''}>${esc(item.label)}${item.status !== 'active' && item.status !== 'missing' ? ' · 已停用' : ''}</label>`).join('') || '<span class="shex-sim-reference-empty">没有找到可用标签</span>'}</div>
        <form class="shex-sim-tag-create" data-simulator-tag-create-form><input data-simulator-tag-create-name maxlength="24" value="${esc(taxonomy.createName || '')}" placeholder="没有想要的？新增标签"><button type="submit" ${taxonomy.creating ? 'disabled' : ''}>新增</button></form><small data-simulator-taxonomy-status>${esc(taxonomy.loading ? '正在读取公共分类与标签…' : taxonomy.error || taxonomy.notice || '')}</small></fieldset></div>`;
  }
  function taxonomyMarkup(overview, taxonomy = {}) {
    return `<div class="wide" data-simulator-taxonomy>${taxonomyBodyMarkup(overview, taxonomy)}</div>`;
  }
  function listField(label, block, path, value, help = '', valueType = 'list') { return field(label, block, path, lines(value), { kind: 'textarea', rows: 3, wide: true, help, valueType }); }
  function csvField(label, block, path, value, help = '') { return field(label, block, path, csv(value), { wide: true, help, valueType: 'list' }); }
  function section(title, body, subtitle = '', helpKey = '') {
    const titleMarkup = `<div class="shex-sim-card-title"><h3>${esc(title)}</h3>${helpKey ? helpButton(helpKey, title) : ''}</div>`;
    return `<section class="shex-sim-card"><header><div>${titleMarkup}${subtitle ? `<p>${esc(subtitle)}</p>` : ''}</div></header>${body}</section>`;
  }
  function removeButton(kind, index, label = '移除') { return `<button type="button" class="ghost danger" data-simulator-remove="${esc(kind)}" data-index="${index}">${esc(label)}</button>`; }
  function readonlyValue(label, value) {
    const text = Array.isArray(value) ? value.join('、') : String(value ?? '');
    return `<div class="shex-sim-readonly"><span>${esc(label)}</span><strong>${esc(text || '未填写')}</strong></div>`;
  }

  function mediaFileId(value) {
    if (typeof value === 'string') return String(value || '').trim();
    return String(value?.fileId || value?.fileID || value?.assetRef || '').trim();
  }

  function emitWorldMediaStage(logMediaStage, stage, mediaKind) {
    const entry = { stage: String(stage || ''), mediaKind: String(mediaKind || '') };
    if (typeof logMediaStage === 'function') logMediaStage(entry);
    else globalThis?.console?.info?.('[SHEX_WORLD_MEDIA]', entry);
  }

  async function persistWorldMediaSelection(options = {}) {
    const kind = options.kind === 'worldPromo' ? 'worldPromo' : 'worldBackground';
    const fileId = mediaFileId(options.fileId);
    const editor = options.editor;
    const client = options.client;
    if (!fileId || !editor?.getBlock || !editor?.setBlock || typeof client?.saveDraftBlocks !== 'function') {
      throw new Error('世界媒体保存参数不完整');
    }
    const beforeRecovery = editor.getSnapshot?.() || {};
    const overviewReadMismatch = (beforeRecovery.readConsistency?.inconsistentBlockKeys || []).includes('overview');
    const overviewAcknowledgementGap = (beforeRecovery.saveAcknowledgementGaps || []).includes('overview');
    if (overviewReadMismatch || overviewAcknowledgementGap) {
      if (typeof client?.getDraft !== 'function' || !beforeRecovery.draftId) {
        throw new Error('世界作品资料版本尚未同步，请重新打开后再试');
      }
      const authoritative = await client.getDraft({ draftId:beforeRecovery.draftId });
      editor.load(authoritative);
      const recovered = editor.getSnapshot?.() || {};
      if ((recovered.readConsistency?.inconsistentBlockKeys || []).includes('overview')) {
        throw new Error('世界作品资料仍在同步，请稍后重试');
      }
    }
    const block = editor.getBlock('overview');
    if (!block) throw new Error('世界作品资料内容块缺失');
    const overview = clone(block.payload) || {};
    const currentRef = kind === 'worldPromo'
      ? overview.coverAssetRef
      : overview.appearanceRef?.worldBackgroundAssetRef;
    const expectedKind = kind === 'worldPromo' ? 'worldPromo' : 'worldBackground';
    const alreadyBound = mediaFileId(currentRef) === fileId
      && typeof currentRef === 'object'
      && String(currentRef?.mediaKind || '') === expectedKind;
    const editorSnapshot = editor.getSnapshot?.();
    const overviewDirty = !editorSnapshot || (editorSnapshot.dirtyBlockKeys || []).includes('overview');
    if (alreadyBound && !overviewDirty) {
      emitWorldMediaStage(options.logMediaStage, 'world_media_draft_save_noop', kind);
      return { noChange: true, revision: Number(editorSnapshot.revision || 0), blockHeads: [] };
    }
    if (kind === 'worldPromo') {
      overview.coverAssetRef = { fileId, mediaKind: 'worldPromo' };
    } else {
      const appearanceRef = overview.appearanceRef && typeof overview.appearanceRef === 'object'
        ? overview.appearanceRef : {};
      overview.appearanceRef = {
        ...appearanceRef,
        worldBackgroundAssetRef: { fileId, mediaKind: 'worldBackground' }
      };
    }
    editor.setBlock('overview', 'overview', overview);
    const intent = editor.beginSave({ onlyBlockKeys: ['overview'] });
    if (!intent) throw new Error('世界媒体没有产生可保存的草稿变更');
    const saveTrace = typeof options.createSaveTrace === 'function'
      ? options.createSaveTrace('overview', kind === 'worldPromo' ? 'overview.coverAssetRef' : 'overview.appearanceRef.worldBackgroundAssetRef')
      : null;
    saveTrace?.before?.(intent.request);
    saveTrace?.request?.(intent.request);
    emitWorldMediaStage(options.logMediaStage, 'world_media_draft_save_start', kind);
    try {
      const result = await client.saveDraftBlocks(intent.request);
      saveTrace?.response?.(intent.request, result);
      if (!editor.acknowledgeSave(intent.token, result)) throw new Error('世界媒体草稿保存回执无效');
      saveTrace?.applied?.(intent.request, result);
      emitWorldMediaStage(options.logMediaStage, 'world_media_draft_save_success', kind);
      return result;
    } catch (error) {
      saveTrace?.failure?.(intent.request, error);
      editor.failSave(intent.token);
      throw error;
    }
  }


  async function uploadAndPersistWorldMedia(options = {}) {
    if (typeof options.upload !== 'function') throw new Error('图片上传服务暂时不可用');
    const uploadResult = await options.upload(options.file);
    const fileId = mediaFileId(uploadResult);
    if (!fileId) throw new Error('图片上传失败');
    const saveResult = await persistWorldMediaSelection({
      kind: options.kind,
      fileId,
      editor: options.editor,
      client: options.client,
      logMediaStage: options.logMediaStage,
    });
    return {
      fileId,
      uploadResult,
      saveResult,
      noChange: saveResult?.noChange === true,
    };
  }
  function worldMediaMarkup(label, kind, value, ui = {}) {
    const fileId = mediaFileId(value);
    const url = String(ui.mediaUrls?.[fileId] || '').trim();
    const ratio = kind === 'worldBackground' ? 'is-portrait' : 'is-landscape';
    return `<section class="shex-sim-media ${ratio}" data-simulator-media-card="${esc(kind)}">
      <header><strong>${esc(label)}</strong><small>${kind === 'worldBackground' ? '竖向 · 用于进入世界和运行背景' : '横向 · 用于广场与详情宣传'}</small></header>
      <div class="shex-sim-media-preview">${url ? `<img src="${esc(url)}" alt="${esc(label)}预览">` : `<span>${fileId ? '图片已设置' : '暂未设置'}</span>`}</div>
      <div class="shex-sim-media-actions"><label><input type="file" accept="image/jpeg,image/png,image/webp,image/avif" data-simulator-media-input="${esc(kind)}" hidden><span>${fileId ? '更换图片' : '选择图片'}</span></label>${fileId ? `<button type="button" class="ghost danger" data-simulator-clear-media="${esc(kind)}">移除</button>` : ''}</div>
    </section>`;
  }

  function overviewMarkup(overview, ui) {
    return section('作品资料', `<div class="shex-sim-form-grid">
      ${field('作品名称', 'overview', 'title', overview.title, { max: 80 })}
      ${field('内容分级', 'overview', 'contentRating', overview.contentRating || 'general', { kind: 'select', options: [['general', '大众'], ['teen', '青少年'], ['mature', '成熟内容']] })}
      ${field('简介', 'overview', 'summary', overview.summary, { kind: 'textarea', rows: 4, max: 600, wide: true })}
      <div class="shex-sim-media-grid wide">${worldMediaMarkup('世界背景', 'worldBackground', overview.appearanceRef?.worldBackgroundAssetRef, ui)}${worldMediaMarkup('宣传主题图', 'worldPromo', overview.coverAssetRef, ui)}</div>
      ${taxonomyMarkup(overview, ui?.taxonomy || {})}
      ${field('创作者说明', 'overview', 'creatorNotes', overview.creatorNotes, { kind: 'textarea', rows: 3, max: 1000, wide: true })}
    </div>`);
  }

  function locationMarkup(location, index) {
    return `<article class="shex-sim-subcard"><header><strong>地点 ${index + 1}</strong>${removeButton('location', index)}</header><div class="shex-sim-form-grid">
      ${field('名称', 'world', `locations.${index}.name`, location.name)}
      ${field('简介', 'world', `locations.${index}.summary`, location.summary, { kind: 'textarea', wide: true })}
      ${csvField('标签', 'world', `locations.${index}.tags`, location.tags)}
    </div></article>`;
  }

  function roleMediaMarkup(label, value, ui = {}) {
    const fileId = mediaFileId(value);
    if (!fileId) return '';
    const url = String(ui.mediaUrls?.[fileId] || '').trim();
    return `<div class="shex-sim-readonly" data-simulator-role-media-ref="${esc(fileId)}" data-simulator-role-media-label="${esc(label)}"><span>${esc(label)}</span>${url ? `<img src="${esc(url)}" alt="角色${esc(label)}">` : '<strong>图片已设置</strong>'}</div>`;
  }

  function roleProfileMarkup(role, index) {
    const profile = role.exclusiveProfile || role.characterSnapshot || {};
    const prefix = `characters.${index}.exclusiveProfile.`;
    const textField = (label, path, long = false) => field(label, 'roster', prefix + path, getAt(profile, path), long ? { kind: 'textarea', rows: 3, wide: true } : {});
    const list = (label, path) => listField(label, 'roster', prefix + path, getAt(profile, path), '每行一项。',
      ['characterProfile.speech.habits', 'templateDefaults.relationship.dynamics'].includes(path) ? 'lines' : 'list');
    const group = (title, content, open = false) => `<details class="shex-sim-role-profile" ${open ? 'open' : ''}><summary>${esc(title)}</summary><div class="shex-sim-form-grid">${content}</div></details>`;
    const cp = 'characterProfile.';
    const basic = [['本名','displayName'],['性别','gender'],['年龄','age'],['自称','selfReference'],['MBTI','mbti'],['星座','zodiac']].map(([label,key]) => textField(label, cp + 'basic.' + key)).join('');
    const dialogues = Array.isArray(profile.characterProfile?.exampleDialogues) ? profile.characterProfile.exampleDialogues : [];
    return `<div class="shex-sim-role-profile-editor wide" data-simulator-role-profile="${esc(role.roleId)}"><p class="shex-sim-role-copy-note">修改仅用于当前世界，不影响原单人角色；原角色后续修改也不会覆盖这份资料。本名与世界内显示名可分别设置。</p>
      ${group('基本资料与性格', basic + textField('性格', cp + 'personality.core', true) + list('性格标签', cp + 'personality.tags'), true)}
      ${group('身份、外貌与背景', textField('世界类型', cp + 'world.worldType') + textField('自定义世界', cp + 'world.customWorld') + list('身份标签', cp + 'identity.tags') + textField('身份说明', cp + 'identity.customIdentity', true) + textField('外貌概述', cp + 'appearance.summary', true) + textField('外貌细节', cp + 'appearance.details', true) + textField('背景', cp + 'background.summary', true))}
      ${group('说话方式与示例对话', textField('说话方式', cp + 'speech.freeform', true) + textField('话量', cp + 'speech.amount') + list('语气', cp + 'speech.tones') + list('说话习惯', cp + 'speech.habits') + list('使用语言', cp + 'speech.languages') + field('需要翻译', 'roster', prefix + cp + 'speech.needsTranslation', profile.characterProfile?.speech?.needsTranslation, { kind:'checkbox' }) + `<div class="wide">${dialogues.map((dialogue, i) => `<div class="shex-sim-subcard"><div class="shex-sim-form-grid">${textField('示例场景', cp + `exampleDialogues.${i}.scene`)}${field('示例对话', 'roster', prefix + cp + `exampleDialogues.${i}.content`, dialogue.content ?? dialogue.text ?? '', {kind:'textarea',rows:3,wide:true})}</div><button type="button" class="ghost danger" data-simulator-remove-dialogue="${i}" data-role-id="${esc(role.roleId)}">移除此示例</button></div>`).join('')}<button type="button" data-simulator-add-dialogue="${esc(role.roleId)}">＋ 添加示例对话</button></div>`)}
      ${group('日常、喜好与其他设定', list('日常标签', cp + 'dailyLife.tags') + textField('目标与日常', cp + 'dailyLife.goalsAndRoutine', true) + list('喜好标签', cp + 'preferences.tags') + textField('喜好说明', cp + 'preferences.freeform', true) + textField('原则与底线', cp + 'principles.freeform', true) + textField('其他设定', cp + 'other.freeform', true))}
      ${group('对用户的关系与态度', textField('关系身份', 'templateDefaults.relationship.identity') + list('相处方式', 'templateDefaults.relationship.dynamics') + textField('关系发展方式', 'templateDefaults.relationship.developmentMode') + textField('关系发展速度', 'templateDefaults.relationship.speed') + textField('关系补充', 'templateDefaults.relationship.freeform', true) + list('特殊对待标签', 'templateDefaults.specialTreatment.tags') + textField('特殊对待说明', 'templateDefaults.specialTreatment.freeform', true))}
    </div>`;
  }
  function roleMarkup(role, index, references = {}, ui = {}) {
    const profile = role.characterSnapshot?.characterProfile || role.exclusiveProfile?.characterProfile || {};
    const metadata = role.characterSnapshot?.templateMetadata || role.exclusiveProfile?.templateMetadata || {};
    const isDraft = role.sourceType === 'existing_character_draft';
    const unavailable = roleSourceUnavailable(role);
    const draftId = characterDraftId(role);
    const worldAvatarRef = role.appearanceRef?.worldAvatarAssetRef;
    const worldAvatarFileId = mediaFileId(worldAvatarRef);
    const inheritedAvatarRef = role.appearanceRef?.avatarAssetId || metadata.avatarAssetId;
    const avatarRef = worldAvatarFileId || inheritedAvatarRef;
    const avatarUrl = String(ui.mediaUrls?.[mediaFileId(avatarRef)] || '').trim();
    const fromSingle = isDraft || role.sourceType === 'existing_character_version';
    const roleType = fromSingle ? '来源角色' : '世界专属角色';
    const avatarState = worldAvatarFileId ? (avatarUrl ? '世界内头像' : '头像引用待确认')
      : inheritedAvatarRef ? (fromSingle ? '继承单人角色头像' : '导入时的角色头像') : '暂未设置';
    const avatarMarkup = `<div class="shex-sim-role-avatar wide" data-simulator-role-avatar-source="${worldAvatarFileId ? 'world' : 'inherited'}"><div class="shex-sim-role-avatar-image" ${avatarRef ? `data-simulator-role-avatar-ref="${esc(mediaFileId(avatarRef))}"` : ''}>${avatarUrl ? `<img src="${esc(avatarUrl)}" alt="${esc(role.displayName || '角色')}头像">` : '<span aria-hidden="true">◌</span>'}</div><div class="shex-sim-role-avatar-body"><strong>世界内头像</strong><small>${esc(avatarState)}</small><div class="shex-sim-role-avatar-actions"><label><input type="file" accept="image/jpeg,image/png,image/webp,image/avif,image/gif" data-simulator-role-avatar-input="${esc(role.roleId || '')}" hidden><span>${worldAvatarFileId ? '更换' : '上传世界内头像'}</span></label>${worldAvatarFileId ? `<button type="button" class="ghost" data-simulator-clear-role-avatar="${esc(role.roleId || '')}">${fromSingle ? '恢复继承' : '移除头像'}</button>` : ''}</div></div></div>`;
    const backgroundRef = metadata.backgroundAssetId || role.appearanceRef?.backgroundAssetId;
    const sourceMarkup = unavailable
      ? `<div class="shex-sim-readonly wide is-warning" data-character-draft-id="${esc(draftId)}"><span>来源</span><strong>来源角色已删除或不可用</strong><small>原角色已不可用，但当前世界内的引用和补充设定会继续保留；发布检查仍会提示你先处理。</small><div class="shex-sim-inline-actions"><button type="button" class="ghost" data-simulator-replace-role="${esc(role.roleId)}">替换来源</button></div></div>`
      : isDraft
        ? `<div class="shex-sim-readonly wide" data-character-draft-id="${esc(draftId)}"><span>来源</span><strong>我的单人角色</strong><small>修改下方资料时会保存为当前世界的独立副本，不会改动原角色。</small></div>`
        : fromSingle ? '<div class="shex-sim-readonly wide"><span>来源</span><strong>已关联发布角色</strong><small>修改资料后成为当前世界的独立副本，不影响原发布角色。</small></div>'
          : '<div class="shex-sim-readonly wide"><span>资料归属</span><strong>当前世界的独立角色</strong><small>资料只在这个世界中保存和发布。</small></div>';
    return `<article class="shex-sim-subcard ${unavailable ? 'is-source-unavailable' : ''}" ${draftId ? `data-character-draft-id="${esc(draftId)}"` : ''}><header><strong>${roleType} · ${esc(role.displayName || `未命名人物 ${index + 1}`)}</strong>${removeButton('role', index)}</header>
      <div class="shex-sim-form-grid">
        ${field('世界内显示名', 'roster', `characters.${index}.displayName`, role.displayName)}
        ${csvField('角色标签', 'roster', `characters.${index}.tags`, role.tags)}
        ${field('世界内补充设定', 'roster', `characters.${index}.simulatorNotes`, role.simulatorNotes, { kind: 'textarea', rows: 3, wide: true })}
        ${unavailable ? '' : roleProfileMarkup(role, index)}
        ${avatarMarkup}
        ${!unavailable ? roleMediaMarkup('背景图', backgroundRef, ui) : ''}
        ${sourceMarkup}
      </div>
    </article>`;
  }

  function worldMarkup(world, roster, picker, references = {}, ui = {}) {
    const locations = (world.locations || []).map(locationMarkup).join('');
    const roles = (roster.characters || []).map((role, index) => roleMarkup(role, index, references, ui)).join('');
    const joinedDraftIds = new Set((roster.characters || []).map(characterDraftId).filter(Boolean));
    const selectedDraftIds = [...new Set((picker.selectedDraftIds || picker.selectedDrafts || []).map(item => typeof item === 'string' ? item : characterDraftId(item)).filter(Boolean))];
    const replacing = Boolean(String(picker.replaceRoleId || '').trim());
    const pickerItems = uniqueCharacterDraftItems(picker.items || []);
    const selectableCount = selectedDraftIds.filter(draftId => !joinedDraftIds.has(draftId)).length;
    const resultMarkup = picker.loading && !pickerItems.length ? '<p>正在查找…</p>' : pickerItems.map((item, index) => {
      const draftId = characterDraftId(item);
      const joined = joinedDraftIds.has(draftId);
      const selected = selectedDraftIds.includes(draftId);
      const disabled = joined;
      return `<label class="shex-sim-picker-option ${joined ? 'is-joined' : selected ? 'is-selected' : ''}" data-character-draft-id="${esc(draftId)}"><input type="${replacing ? 'radio' : 'checkbox'}" name="${replacing ? 'simulator-role-replacement' : `simulator-role-${esc(draftId)}`}" value="${esc(draftId)}" data-simulator-pick-draft="${index}" data-simulator-role-selection ${selected ? 'checked' : ''} ${disabled ? 'disabled aria-label="已加入"' : ''}><span><strong>${esc(item.displayName)}</strong><small>${joined ? '已加入' : selected ? '已选择' : `最后更新 ${item.updatedAt ? esc(new Date(item.updatedAt).toLocaleDateString('zh-CN')) : '—'}`}</small></span></label>`;
    }).join('') || '<p>还没有可添加的单人角色。</p>';
    const confirmCount = replacing ? Math.min(1, selectedDraftIds.length) : selectableCount;
    const confirmLabel = replacing ? '确认替换来源' : `加入 ${confirmCount} 个角色`;
    const pickerMarkup = picker.open ? `<aside class="shex-sim-picker" data-simulator-role-picker><header><strong>${replacing ? '替换来源角色' : '添加已有角色'}</strong><button type="button" class="ghost" data-simulator-close-role-picker>关闭</button></header><p class="shex-sim-picker-source"><strong>来源：我的单人角色</strong><small>加入后成为当前世界的独立角色，可以编辑完整资料，不影响原单人角色。</small></p><form data-simulator-role-search-form><input data-simulator-role-search value="${esc(picker.query)}" placeholder="搜索我的单人角色"><button type="submit" data-simulator-role-search-submit>搜索</button></form><div class="shex-sim-picker-results">${resultMarkup}</div>${picker.hasMore ? '<button type="button" class="ghost" data-simulator-role-load-more>加载更多</button>' : ''}${picker.error ? `<p class="error">${esc(picker.error)}</p>` : ''}<footer class="shex-sim-picker-footer"><button type="button" class="primary" data-simulator-role-picker-confirm ${confirmCount ? '' : 'disabled'}>${confirmLabel}</button></footer></aside>` : '';
    return `${section('世界设定', `<div class="shex-sim-form-grid">
      ${field('世界背景', 'world', 'premise', world.premise, { kind: 'textarea', rows: 5, wide: true })}
      ${listField('世界规则', 'world', 'rules', world.rules, '每行一条规则，逗号不会分条。', 'lines')}
      ${listField('氛围标签', 'world', 'toneTags', world.toneTags)}
      ${listField('安全说明', 'world', 'safetyNotes', world.safetyNotes, '每行一条说明，逗号不会分条。', 'lines')}
    </div><div class="shex-sim-section-bar">${sectionTitle('地点', 'location')}<button type="button" data-simulator-add-location>＋ 添加地点</button></div>${locations || '<p class="shex-sim-empty">尚未添加地点。</p>'}`, '基础背景、规则与地点。')}
    ${section('角色管理', `<div class="shex-sim-section-actions"><button type="button" data-simulator-open-role-picker>添加已有角色</button></div>${pickerMarkup}${roles || '<p class="shex-sim-empty">尚未添加角色。</p>'}`, '从“我的单人角色”复制资料，或编辑文件导入的角色；所有修改仅用于当前世界。')}`;
  }

  function typedValueField(label, block, path, value, variable, options = {}) {
    if (variable?.type === 'number') return field(label, block, path, value ?? 0, { ...options, kind: 'number', valueType: 'number' });
    if (variable?.type === 'boolean') return field(label, block, path, String(value === true), { ...options, kind: 'select', options: [['false', '否'], ['true', '是']], valueType: 'boolean-select' });
    if (variable?.type === 'enum') {
      const enumValues = (Array.isArray(variable.enumValues) ? variable.enumValues : []).map(item => [String(item), String(item)]);
      if (value === undefined || value === null || value === '') enumValues.unshift(['', '请选择']);
      const known = enumValues.some(([item]) => item === String(value ?? ''));
      if (!known && value !== undefined && value !== null && value !== '') enumValues.push([String(value), '原值（已不在选项中）']);
      return field(label, block, path, value ?? '', { ...options, kind: 'select', options: enumValues });
    }
    return field(label, block, path, value ?? '', { ...options });
  }
  function variableMarkup(item, index) {
    const displayName = variableDisplayName(item, index);
    const advanced = `${item.type === 'number' ? field('最小值', 'state', `variables.${index}.min`, item.min, { kind: 'number', valueType: 'optional-number' }) : ''}
      ${item.type === 'number' ? field('最大值', 'state', `variables.${index}.max`, item.max, { kind: 'number', valueType: 'optional-number' }) : ''}
      ${item.type === 'enum' ? csvField('可选内容', 'state', `variables.${index}.enumValues`, item.enumValues) : ''}
      ${item.scope ? readonlyValue('使用范围', '已保留原有范围设置') : ''}`;
    return `<article class="shex-sim-subcard"><header><strong>${esc(displayName)}</strong>${removeButton('variable', index)}</header><div class="shex-sim-form-grid">
      ${field('变量名称 / 说明', 'state', `variables.${index}.description`, item.description, { placeholder: displayName, wide: true })}
      ${field('展示名称', 'state', `variables.${index}.displayName`, item.displayName || '', { placeholder: displayName, help: '聊天卡片上显示的名字；留空则用上面的说明' })}
      ${field('在聊天卡片中展示', 'state', `variables.${index}.public`, item.public === true, { kind: 'checkbox', help: '只有勾选的变量才会进入美化组件的数据面板' })}
      ${field('允许 AI 修改', 'state', `variables.${index}.aiWritable`, item.aiWritable === true, { kind: 'checkbox', help: '允许 AI 提议修改这个变量。AI 只能提出建议，系统会检查变量类型、范围和当前状态后决定是否应用。' })}
      ${field('类型', 'state', `variables.${index}.type`, item.type || 'string', { kind: 'select', options: VARIABLE_TYPES })}
      ${typedValueField('初始值', 'state', `variables.${index}.initialValue`, item.initialValue, item)}
      ${advanced.trim() ? advancedSettingsMarkup(`variable-${index}`, `<div class="shex-sim-form-grid">${advanced}</div>`) : ''}
    </div></article>`;
  }
  function itemMarkup(item, index, variables = []) {
    const effect = item.simpleEffect || { kind: 'none' };
    const targetVariable = variableByReference(variables, effect.targetKey);
    const advanced = `${field('使用后的变化', 'state', `items.${index}.simpleEffect.kind`, effect.kind || 'none', { kind: 'select', options: [['none', '无'], ['variable_delta', '变量增减'], ['variable_set', '变量设值']] })}
      ${effect.kind !== 'none' ? referenceField('目标变量', 'state', `items.${index}.simpleEffect.targetKey`, effect.targetKey, variableReferenceOptions(variables, { path: false })) : ''}
      ${effect.kind === 'variable_delta' ? field('增减值', 'state', `items.${index}.simpleEffect.delta`, effect.delta ?? 0, { kind: 'number', valueType: 'number' }) : ''}
      ${effect.kind === 'variable_set' ? typedValueField('设为', 'state', `items.${index}.simpleEffect.value`, effect.value, targetVariable) : ''}`;
    return `<article class="shex-sim-subcard"><header><strong>道具 ${index + 1}</strong>${removeButton('item', index)}</header><div class="shex-sim-form-grid">
      ${field('名称', 'state', `items.${index}.name`, item.name)}
      ${field('初始数量', 'state', `items.${index}.initialQuantity`, item.initialQuantity ?? 0, { kind: 'number', valueType: 'number', min: 0, max: 9999 })}
      ${field('简介', 'state', `items.${index}.summary`, item.summary, { wide: true })}
      ${advancedSettingsMarkup(`item-${index}`, `<div class="shex-sim-form-grid">${advanced}</div>`)}
    </div></article>`;
  }
  function unknownAxesMarkup(axes = {}) {
    const known = new Set(RELATION_AXES.map(([axis]) => axis));
    return Object.entries(axes).filter(([axis]) => !known.has(axis)).map(([, value]) => readonlyValue('原引用已不存在', value)).join('');
  }
  function relationshipAxisSlider(axis, label, index, value) {
    const numeric = Math.max(0, Math.min(100, Number.isFinite(Number(value)) ? Number(value) : 0));
    const level = relationLevelLabel(axis, numeric);
    const id = `sim-state-initialRelationships-${index}-axes-${axis}`;
    const path = `initialRelationships.${index}.axes.${axis}`;
    return `<label class="shex-sim-field shex-sim-relation-slider"><span class="shex-sim-relation-slider-head"><span>${esc(label)}</span><output for="${id}" data-simulator-relation-level="${esc(axis)}">${esc(level)}</output></span><input id="${id}" type="range" data-simulator-field="state.${esc(path)}" data-block="state" data-path="${esc(path)}" data-value-type="number" data-simulator-relation-slider="${esc(axis)}" min="0" max="100" step="1" value="${numeric}" aria-label="${esc(label)}" aria-valuetext="${esc(level)}"></label>`;
  }
  function relationshipMarkup(item, index, references = {}) {
    const axes = item.axes || {};
    const primaryAxes = RELATION_AXES.slice(0, 4).map(([axis, label]) => relationshipAxisSlider(axis, label, index, axes[axis] ?? 0)).join('');
    const advanced = `${RELATION_AXES.slice(4).map(([axis, label]) => field(label, 'state', `initialRelationships.${index}.axes.${axis}`, axes[axis], { kind: 'number', valueType: 'optional-number', min: 0, max: 100 })).join('')}
      ${unknownAxesMarkup(axes)}${csvField('身份标签', 'state', `initialRelationships.${index}.identityLabels`, item.identityLabels)}${field('备注', 'state', `initialRelationships.${index}.notes`, item.notes, { wide: true })}`;
    return `<article class="shex-sim-subcard"><header><strong>定向关系 ${index + 1}</strong>${removeButton('relationship', index)}</header><div class="shex-sim-form-grid">
      <div class="shex-sim-relationship-edge wide">${referenceField('人物 A', 'state', `initialRelationships.${index}.fromRoleId`, item.fromRoleId, references.roles)}<span class="shex-sim-direction" aria-hidden="true">→</span>${referenceField('人物 B', 'state', `initialRelationships.${index}.toRoleId`, item.toRoleId, references.roles)}</div>
      ${primaryAxes}
      ${advancedSettingsMarkup(`relationship-${index}`, `<div class="shex-sim-form-grid">${advanced}</div>`)}
    </div></article>`;
  }
  function routeMarkup(item, index) {
    return `<article class="shex-sim-subcard"><header><strong>剧情分支 ${index + 1}</strong>${removeButton('route', index)}</header><div class="shex-sim-form-grid">
      ${field('标题', 'state', `routes.${index}.title`, item.title)}
      ${field('摘要', 'state', `routes.${index}.summary`, item.summary, { wide: true })}
      ${advancedSettingsMarkup(`route-${index}`, `<div class="shex-sim-form-grid">${field('互斥规则', 'state', `routes.${index}.routeExclusivityGroup`, item.routeExclusivityGroup)}${field('确认文案', 'state', `routes.${index}.confirmationText`, item.confirmationText)}${field('结局方式', 'state', `routes.${index}.endingMode`, item.endingMode)}</div>`)}
    </div></article>`;
  }
  function stateMarkup(value, references = {}) {
    return `${section('变量 / 状态', `<div class="shex-sim-section-actions"><button type="button" data-simulator-add-variable>＋ 添加变量</button></div>${(value.variables || []).map(variableMarkup).join('') || '<p class="shex-sim-empty">尚未添加变量。</p>'}`, '系统是变量和状态的唯一权威。', 'variables')}
      ${section('初始定向关系', `<div class="shex-sim-section-actions"><button type="button" data-simulator-add-relationship>＋ 添加 A→B 关系</button></div>${(value.initialRelationships || []).map((item, index) => relationshipMarkup(item, index, references)).join('') || '<p class="shex-sim-empty">只保存明确添加的有向边，不生成全角色矩阵。</p>'}`)}
      ${section('剧情分支', `<div class="shex-sim-section-actions"><button type="button" data-simulator-add-route>＋ 添加剧情分支</button></div>${(value.routes || []).map(routeMarkup).join('') || '<p class="shex-sim-empty">尚未添加剧情分支。</p>'}`, '', 'route')}`;
  }

  function namedReference(reference, options = []) {
    return referenceOptions(options).find(item => item.value === String(reference || ''))?.label || '原引用已不存在';
  }
  function axisLabel(axis) { return RELATION_AXES.find(([value]) => value === axis)?.[1] || '原引用已不存在'; }
  function operatorLabel(operator) { return ({ '==': '等于', '!=': '不等于', '<': '小于', '>': '大于', '<=': '小于等于', '>=': '大于等于' })[operator] || '比较'; }
  function eventStateOptions(current) {
    const options = EVENT_STATE_OPTIONS.map(item => [...item]);
    const value = String(current || '');
    if (value && !options.some(([candidate]) => candidate === value)) options.push([value, '原状态（已不再支持）']);
    return options;
  }
  function eventStateLabel(value) { return eventStateOptions(value).find(([candidate]) => candidate === value)?.[1] || '原状态（已不再支持）'; }
  function edgeParts(edge) { const [from = '', to = ''] = String(edge || '').split('>'); return { from, to }; }
  function edgeField(block, path, edge, context = {}) {
    const parts = edgeParts(edge); const roles = context.relationshipRoles || context.roles || [];
    return `<div class="shex-sim-edge wide"><label><span>人物 A</span><select data-simulator-edge-part="from" data-block="${esc(block)}" data-path="${esc(path)}">${[['', '请选择'], ...referenceOptions(roles).map(item => [item.value, item.label]), ...(parts.from && !referenceOptions(roles).some(item => item.value === parts.from) ? [[parts.from, '原引用已不存在']] : [])].map(item => option(item[0], parts.from, item[1])).join('')}</select></label><span aria-hidden="true">→</span><label><span>人物 B</span><select data-simulator-edge-part="to" data-block="${esc(block)}" data-path="${esc(path)}">${[['', '请选择'], ...referenceOptions(roles).map(item => [item.value, item.label]), ...(parts.to && !referenceOptions(roles).some(item => item.value === parts.to) ? [[parts.to, '原引用已不存在']] : [])].map(item => option(item[0], parts.to, item[1])).join('')}</select></label></div>`;
  }
  function axisField(label, block, path, current) { return referenceField(label, block, path, current, RELATION_AXES.map(([value, text]) => ({ value, label: text }))); }
  function conditionSummary(condition, context = {}) {
    if (Array.isArray(condition?.clauses)) {
      const mode = condition.mode === 'OR' ? '任一满足' : '全部满足';
      return `<li><strong>${mode}</strong><ul>${condition.clauses.map(clause => conditionSummary(clause, context)).join('')}</ul></li>`;
    }
    if (condition?.type === 'variableCompare') return `<li>${esc(namedReference(condition.path, context.variables))} ${esc(operatorLabel(condition.op))} ${esc(condition.value)}</li>`;
    if (condition?.type === 'relationshipCompare') { const parts = edgeParts(condition.edge); return `<li>${esc(namedReference(parts.from, context.relationshipRoles))} → ${esc(namedReference(parts.to, context.relationshipRoles))} · ${esc(axisLabel(condition.axis))} ${esc(operatorLabel(condition.op))} ${esc(condition.value)}</li>`; }
    if (condition?.type === 'eventState') return `<li>${esc(namedReference(condition.eventId, context.events))} ${esc(operatorLabel(condition.op))} ${esc(eventStateLabel(condition.value))}</li>`;
    if (condition?.type === 'stageComplete') return `<li>${esc(namedReference(condition.stageId, context.stages))} 已完成</li>`;
    return '<li>有一项旧规则暂不支持编辑，原内容已保留</li>';
  }
  function readonlyConditionTree(condition, context = {}) {
    return `<div class="shex-sim-condition shex-sim-rule-summary" data-simulator-nested-condition-readonly><strong>组合条件（只读）</strong><small>这组多层规则会原样保留；本版不提供递归编辑。</small><ul>${conditionSummary(condition, context)}</ul></div>`;
  }
  function hasNestedConditionGroup(condition) {
    return Array.isArray(condition?.clauses) && condition.clauses.some(clause => Array.isArray(clause?.clauses));
  }
  function conditionLeafMarkup(condition, block, path, removeAttributes, context = {}) {
    if (Array.isArray(condition?.clauses)) return readonlyConditionTree(condition, context);
    const type = condition?.type || 'variableCompare';
    if (!KNOWN_CONDITION_TYPES.has(type)) return '<div class="shex-sim-condition shex-sim-rule-summary"><strong>旧条件（只读）</strong><small>此条件暂不支持编辑，原内容会继续保留。</small></div>';
    const remove = removeAttributes ? `<button type="button" class="ghost danger" ${removeAttributes}>移除条件</button>` : '';
    const variable = variableByReference((context.variables || []).map(item => item.variable).filter(Boolean), condition.path);
    return `<div class="shex-sim-condition"><div class="shex-sim-form-grid">
      ${field('条件类型', block, `${path}.type`, type, { kind: 'select', options: CONDITION_TYPES })}
      ${type === 'variableCompare' ? referenceField('要检查的变量', block, `${path}.path`, condition.path, context.variables) : ''}
      ${type === 'relationshipCompare' ? edgeField(block, `${path}.edge`, condition.edge, context) : ''}
      ${type === 'relationshipCompare' ? axisField('关系轴', block, `${path}.axis`, condition.axis || 'affinity') : ''}
      ${type === 'eventState' ? referenceField('事件', block, `${path}.eventId`, condition.eventId, context.events) : ''}
      ${type === 'stageComplete' ? referenceField('阶段', block, `${path}.stageId`, condition.stageId, context.stages) : ''}
      ${type !== 'stageComplete' ? field('比较方式', block, `${path}.op`, condition.op || '==', { kind: 'select', options: [['==', '等于'], ['!=', '不等于'], ['<', '小于'], ['>', '大于'], ['<=', '小于等于'], ['>=', '大于等于']] }) : ''}
      ${type === 'eventState' ? field('事件状态', block, `${path}.value`, condition.value || 'completed', { kind: 'select', options: eventStateOptions(condition.value) }) : type !== 'stageComplete' ? typedValueField('比较值', block, `${path}.value`, condition.value, variable, { valueType: variable ? undefined : 'smart' }) : ''}
    </div>${remove}</div>`;
  }
  function conditionMarkup(condition, eventIndex, context = {}, blockKey = '__stage__') {
    if (!condition) return '<p class="shex-sim-empty compact">无触发条件。</p>';
    if (hasNestedConditionGroup(condition)) return readonlyConditionTree(condition, context);
    if (Array.isArray(condition.clauses)) {
      return `<div class="shex-sim-condition-group">${field('组合方式', blockKey, `events.${eventIndex}.conditions.mode`, condition.mode || 'AND', { kind: 'select', options: [['AND', '全部满足'], ['OR', '任一满足']] })}${condition.clauses.map((clause, index) => conditionLeafMarkup(clause, blockKey, `events.${eventIndex}.conditions.clauses.${index}`, `data-simulator-remove-condition="${index}"`, context)).join('')}</div>`;
    }
    return conditionLeafMarkup(condition, blockKey, `events.${eventIndex}.conditions`, 'data-simulator-remove-condition="root"', context);
  }
  function blockConditionMarkup(condition, block, blockType, path, title, context = {}) {
    const button = `<button type="button" class="ghost" data-simulator-add-block-condition="${esc(path)}" data-block-key="${esc(block)}" data-block-type="${esc(blockType)}">＋ 添加条件</button>`;
    if (!condition) return `<div class="shex-sim-advanced wide"><h5>${esc(title)}</h5><p class="shex-sim-empty compact">未设置。</p>${button}</div>`;
    const attrs = index => `data-simulator-remove-block-condition="${esc(index)}" data-block-key="${esc(block)}" data-condition-path="${esc(path)}"`;
    const nested = hasNestedConditionGroup(condition);
    const body = nested ? readonlyConditionTree(condition, context) : Array.isArray(condition.clauses)
      ? `<div class="shex-sim-condition-group">${field('组合方式', block, `${path}.mode`, condition.mode || 'AND', { kind: 'select', options: [['AND', '全部满足'], ['OR', '任一满足']] })}${condition.clauses.map((clause, index) => conditionLeafMarkup(clause, block, `${path}.clauses.${index}`, attrs(index), context)).join('')}</div>`
      : conditionLeafMarkup(condition, block, path, attrs('root'), context);
    return `<div class="shex-sim-advanced wide"><h5>${esc(title)}</h5>${body}${nested ? '' : button}</div>`;
  }
  function relationshipEffectAxesMarkup(effect, eventIndex, effectIndex, blockKey = '__stage__') {
    const axes = effect?.patch?.axes || {};
    const usedKnown = new Set(Object.keys(axes).filter(axis => RELATION_AXES.some(([known]) => known === axis)));
    const rows = Object.entries(axes).map(([axis, value]) => {
      if (!RELATION_AXES.some(([known]) => known === axis)) return readonlyValue('原引用已不存在', value);
      const choices = RELATION_AXES.filter(([candidate]) => candidate === axis || !usedKnown.has(candidate));
      return `<div class="shex-sim-effect-axis-row" data-simulator-effect-axis-row><label class="shex-sim-field"><span>关系轴</span><select data-simulator-effect-axis data-event-index="${eventIndex}" data-effect-index="${effectIndex}" data-axis="${esc(axis)}">${choices.map(([candidate, label]) => option(candidate, axis, label)).join('')}</select></label>${field('设置为', blockKey, `events.${eventIndex}.effects.${effectIndex}.patch.axes.${axis}`, value, { kind: 'number', valueType: 'number', min: 0, max: 100 })}<button type="button" class="ghost danger" data-simulator-remove-effect-axis data-event-index="${eventIndex}" data-effect-index="${effectIndex}" data-axis="${esc(axis)}">移除此轴</button></div>`;
    }).join('');
    const add = usedKnown.size < RELATION_AXES.length ? `<button type="button" class="ghost" data-simulator-add-effect-axis data-event-index="${eventIndex}" data-effect-index="${effectIndex}">＋ 添加关系轴</button>` : '';
    return `<div class="shex-sim-effect-axes wide" data-simulator-effect-axes>${rows || '<p class="shex-sim-empty compact">尚未添加关系轴。</p>'}${add}</div>`;
  }
  function effectMarkup(effect, eventIndex, effectIndex, context = {}, blockKey = '__stage__') {
    const type = effect?.type || 'variablePatch';
    if (!KNOWN_EFFECT_TYPES.has(type)) return '<div class="shex-sim-effect shex-sim-rule-summary"><strong>旧效果（只读）</strong><small>此效果暂不支持编辑，原内容会继续保留。</small></div>';
    const variable = type === 'variablePatch' ? variableByReference((context.variables || []).map(item => item.variable).filter(Boolean), effect.key) : null;
    return `<div class="shex-sim-effect"><div class="shex-sim-form-grid">
      ${field('效果类型', blockKey, `events.${eventIndex}.effects.${effectIndex}.type`, type, { kind: 'select', options: EFFECT_TYPES })}
      ${type === 'relationshipPatch' ? edgeField(blockKey, `events.${eventIndex}.effects.${effectIndex}.edge`, effect.edge, context) : type === 'variablePatch' ? referenceField('目标变量', blockKey, `events.${eventIndex}.effects.${effectIndex}.key`, effect.key, variableReferenceOptions((context.variables || []).map(item => item.variable).filter(Boolean), { path: false })) : field(type === 'chapterProgressPatch' ? '章节进度记录' : '选择记录名称', blockKey, `events.${eventIndex}.effects.${effectIndex}.key`, effect.key || '')}
      ${type === 'relationshipPatch' ? relationshipEffectAxesMarkup(effect, eventIndex, effectIndex, blockKey) : typedValueField('写入值', blockKey, `events.${eventIndex}.effects.${effectIndex}.value`, effect.value, variable, { valueType: variable ? undefined : 'smart' })}
    </div><button type="button" class="ghost danger" data-simulator-remove-effect="${effectIndex}" data-event-index="${eventIndex}">移除效果</button></div>`;
  }
  function eventMarkup(event, index, references = {}, blockKey = '__stage__') {
    const random = event.random;
    const conditionsReadOnly = hasNestedConditionGroup(event.conditions);
    const advancedBody = `<div class="shex-sim-form-grid">
      ${field('隐藏事件', blockKey, `events.${index}.hidden`, event.hidden === true, { kind: 'checkbox' })}
      ${referenceField('所属剧情分支', blockKey, `events.${index}.routeId`, event.routeId, references.routes)}
      ${field('剧情分支入口', blockKey, `events.${index}.isRouteEntry`, event.isRouteEntry === true, { kind: 'checkbox' })}
      ${field('需要用户明确确认', blockKey, `events.${index}.requiresExplicitUserConfirmation`, event.requiresExplicitUserConfirmation === true, { kind: 'checkbox' })}
      ${field('允许身份变化', blockKey, `events.${index}.allowsIdentityChange`, event.allowsIdentityChange === true, { kind: 'checkbox' })}
      ${field('启动方式', blockKey, `events.${index}.startMode`, event.startMode || '', { kind: 'select', options: [['', '默认'], ['world_auto', '世界自动'], ['character_driven', '角色推动'], ['user_triggered', '用户触发']], valueType: 'optional-text' })}
      ${field('允许进入进行中状态', blockKey, `events.${index}.hasActiveState`, event.hasActiveState === true, { kind: 'checkbox' })}
      ${field('允许跳过', blockKey, `events.${index}.allowSkip`, event.allowSkip === true, { kind: 'checkbox' })}
      ${field('引导强度', blockKey, `events.${index}.guidanceOverride`, event.guidanceOverride || '', { kind: 'select', options: [['', '继承世界设置'], ['off', '关闭'], ['light', '轻度'], ['standard', '标准'], ['strong', '强']], valueType: 'optional-text' })}
      ${field('不进入探索候选', blockKey, `events.${index}.excludeFromExploration`, event.excludeFromExploration === true, { kind: 'checkbox' })}
      ${field('结局类型', blockKey, `events.${index}.endingKind`, event.endingKind || '', { kind: 'select', options: [['', '不是结局'], ['stage_ending', '阶段结局'], ['full_ending', '完整结局']], valueType: 'optional-text' })}
      ${field('进度权重', blockKey, `events.${index}.weight`, event.weight, { kind: 'number', valueType: 'optional-number', min: 1, max: 5 })}
      ${field('展示优先级', blockKey, `events.${index}.displayPriority`, event.displayPriority, { kind: 'number', valueType: 'optional-number', min: -100, max: 100 })}
      ${field('随机触发', blockKey, `events.${index}.random.enabled`, random?.enabled === true, { kind: 'checkbox' })}
      <p class="shex-sim-field-hint wide">开启后，这个事件可以按现有权重、冷却轮数和最大触发次数参与随机触发。</p>
      ${random?.enabled ? `${field('随机权重', blockKey, `events.${index}.random.weight`, random.weight ?? 1, { kind: 'number', valueType: 'number', min: 0.01 })}${field('冷却循环数', blockKey, `events.${index}.random.cooldownOccurrences`, random.cooldownOccurrences ?? 0, { kind: 'number', valueType: 'number', min: 0 })}${field('最多触发', blockKey, `events.${index}.random.maxTriggers`, random.maxTriggers, { kind: 'number', valueType: 'optional-number', min: 1 })}` : ''}
      <div class="shex-sim-advanced wide"><h5>触发条件</h5>${conditionMarkup(event.conditions, index, references, blockKey)}${conditionsReadOnly ? '' : `<button type="button" class="ghost" data-simulator-add-event-condition="${index}">＋ 添加条件</button>`}<h5>完成后效果</h5>${(event.effects || []).map((effect, effectIndex) => effectMarkup(effect, index, effectIndex, references, blockKey)).join('') || '<p class="shex-sim-empty compact">无状态效果。</p>'}<button type="button" class="ghost" data-simulator-add-event-effect="${index}">＋ 添加效果</button></div>
    </div>`;
    return `<article class="shex-sim-event" data-simulator-event-id="${esc(event.eventId || String(index))}" data-simulator-stage-block-key="${esc(blockKey)}"><header><div class="shex-sim-event-heading"><strong data-simulator-event-title>事件 ${index + 1} · ${esc(event.title || '未命名事件')}</strong><span class="shex-sim-story-badges" data-simulator-event-badges>${eventBadgesMarkup(event)}</span></div>${removeButton('event', index)}</header><div class="shex-sim-form-grid">
      ${field('标题', blockKey, `events.${index}.title`, event.title)}
      ${field('摘要', blockKey, `events.${index}.summary`, event.summary, { kind: 'textarea', wide: true })}
      ${field('启用', blockKey, `events.${index}.enabled`, event.enabled !== false, { kind: 'checkbox' })}
      ${field('主线事件', blockKey, `events.${index}.required`, event.required === true, { kind: 'checkbox', helpKey: 'mainEvent' })}
      ${referenceField('这个事件涉及谁', blockKey, `events.${index}.roleIds`, event.roleIds, references.roles, { multiple: true })}
      ${advancedSettingsMarkup(`event-${event.eventId || index}`, advancedBody)}
    </div></article>`;
  }
  function eventBadgesMarkup(event) {
    return `${event.required === true ? '<span class="shex-sim-story-badge">主线事件</span>' : ''}${event.random?.enabled === true ? '<span class="shex-sim-story-badge">随机触发</span>' : ''}`;
  }
  function createReferenceCatalog(chapterBlocks = [], world = {}, roster = {}, state = {}) {
    const chapters = (Array.isArray(chapterBlocks) ? chapterBlocks : []).map((item, chapterIndex) => ({
      value: String(item?.payload?.chapterId || '').trim(),
      label: String(item?.payload?.title || `未命名章节 ${chapterIndex + 1}`).trim(),
      stageBlocks: Array.isArray(item?.stageBlocks) ? item.stageBlocks : [],
    })).filter(item => item.value);
    const roles = (Array.isArray(roster?.characters) ? roster.characters : []).map((role, index) => ({
      value: String(role?.roleId || '').trim(), label: String(role?.displayName || `未命名人物 ${index + 1}`).trim(),
    })).filter(item => item.value);
    const stages = chapters.flatMap(chapter => chapter.stageBlocks.map((stage, index) => ({
      value: String(stage?.payload?.stageId || '').trim(),
      label: `${chapter.label} / ${String(stage?.payload?.title || `未命名阶段 ${index + 1}`).trim()}`,
    })).filter(item => item.value));
    const events = chapters.flatMap(chapter => chapter.stageBlocks.flatMap(stage => (stage?.payload?.events || []).map((event, index) => ({
      value: String(event?.eventId || '').trim(), label: String(event?.title || `未命名事件 ${index + 1}`).trim(),
    }))).filter(item => item.value));
    return Object.freeze({
      chapters: Object.freeze(chapters.map(({ value, label }) => Object.freeze({ value, label }))),
      stages: Object.freeze(stages), events: Object.freeze(events), roles: Object.freeze(roles),
      relationshipRoles: Object.freeze([{ value: 'user', label: '用户' }, ...roles]),
      locations: Object.freeze((Array.isArray(world?.locations) ? world.locations : []).map((location, index) => ({
        value: String(location?.locationId || '').trim(), label: String(location?.name || `未命名地点 ${index + 1}`).trim(),
      })).filter(item => item.value)),
      routes: Object.freeze((Array.isArray(state?.routes) ? state.routes : []).map((route, index) => ({
        value: String(route?.routeId || '').trim(), label: String(route?.title || `未命名剧情分支 ${index + 1}`).trim(),
      })).filter(item => item.value)),
      variables: Object.freeze(variableReferenceOptions(state?.variables || [], { path: true })),
    });
  }
  function chapterEditorMarkup(selectedChapter, references = {}) {
    const chapter = selectedChapter?.payload;
    const chapterAdvanced = chapter ? `<div class="shex-sim-form-grid">${field('隐藏章节', selectedChapter.blockKey, 'hidden', chapter.hidden === true, { kind: 'checkbox' })}${field('导演备注', selectedChapter.blockKey, 'directorNotes', chapter.directorNotes, { kind: 'textarea', wide: true })}${blockConditionMarkup(chapter.entryCondition, selectedChapter.blockKey, 'chapter', 'entryCondition', '章节进入条件', references)}</div>` : '';
    const chapterForm = chapter ? `<div class="shex-sim-section-actions"><button type="button" class="ghost danger" data-simulator-remove-current-chapter>移除当前章节</button></div><div class="shex-sim-form-grid">
      ${field('标题', selectedChapter.blockKey, 'title', chapter.title)}
      ${field('顺序', selectedChapter.blockKey, 'order', chapter.order ?? 1, { kind: 'number', valueType: 'number', min: 1 })}
      ${field('摘要', selectedChapter.blockKey, 'summary', chapter.summary, { kind: 'textarea', wide: true })}
      ${referenceField('本章出现的角色', selectedChapter.blockKey, 'roleIds', chapter.roleIds, references.roles, { multiple: true })}${referenceField('地点', selectedChapter.blockKey, 'locationIds', chapter.locationIds, references.locations, { multiple: true })}
      ${advancedSettingsMarkup('chapter-options', chapterAdvanced)}
    </div>` : '';
    return `<div data-simulator-chapter-body data-simulator-chapter-block-key="${esc(selectedChapter.blockKey)}"><p class="shex-sim-budget-line" data-simulator-chapter-directory="${esc(chapter?.chapterId || '')}" hidden></p><section class="shex-sim-node-settings" id="sim-settings-${esc(selectedChapter.blockKey)}" data-simulator-settings-region="${esc(selectedChapter.blockKey)}" hidden><h4>章节设置</h4>${chapterForm}</section><div class="shex-sim-tree-branch" data-simulator-stage-branch><div data-simulator-stage-list></div><button type="button" class="shex-sim-tree-add" data-simulator-add-stage>＋ 添加阶段</button></div></div>`;
  }
  function stageEditorMarkup(selectedStage, references = {}) {
    const stage = selectedStage?.payload;
    const stageEvents = stage?.events || [];
    const stageEventOptions = stageEvents.map((event, index) => ({ value: String(event?.eventId || ''), label: String(event?.title || `未命名事件 ${index + 1}`) })).filter(item => item.value);
    const stateVariables = (references.variables || []).map(item => item.variable).filter(Boolean);
    const stageAdvanced = stage ? `<div class="shex-sim-form-grid">${field('隐藏阶段', selectedStage.blockKey, 'hidden', stage.hidden === true, { kind: 'checkbox' })}${field('导演备注', selectedStage.blockKey, 'directorNotes', stage.directorNotes, { kind: 'textarea', wide: true })}
      ${stage.mode === 'loop' ? field('最大循环次数（留空=不限）', selectedStage.blockKey, 'repeatPolicy.maxOccurrences', stage.repeatPolicy?.maxOccurrences, { kind: 'number', valueType: 'optional-number', min: 1, max: 999 }) : ''}
      ${stage.mode === 'loop' ? referenceField('每轮重置事件', selectedStage.blockKey, 'repeatPolicy.resetEventIds', stage.repeatPolicy?.resetEventIds, stageEventOptions, { multiple: true }) : ''}
      ${stage.mode === 'loop' ? referenceField('跨轮保留变量', selectedStage.blockKey, 'repeatPolicy.carryVariableKeys', stage.repeatPolicy?.carryVariableKeys, variableReferenceOptions(stateVariables, { path: false }), { multiple: true }) : ''}
      ${blockConditionMarkup(stage.entryCondition, selectedStage.blockKey, 'stage', 'entryCondition', '阶段进入条件', references)}
      ${blockConditionMarkup(stage.completionCondition, selectedStage.blockKey, 'stage', 'completionCondition', '阶段完成条件', references)}</div>` : '';
    const stageForm = stage ? `<div data-simulator-stage-body data-simulator-stage-block-key="${esc(selectedStage.blockKey)}"><section class="shex-sim-node-settings" id="sim-settings-${esc(selectedStage.blockKey)}" data-simulator-settings-region="${esc(selectedStage.blockKey)}" hidden><h4>阶段设置</h4><div class="shex-sim-section-actions"><button type="button" class="ghost danger" data-simulator-remove-current-stage>移除当前阶段</button></div><div class="shex-sim-form-grid">
      ${field('标题', selectedStage.blockKey, 'title', stage.title)}
      ${field('顺序', selectedStage.blockKey, 'order', stage.order ?? 1, { kind: 'number', valueType: 'number', min: 1 })}
      ${field('运行模式', selectedStage.blockKey, 'mode', stage.mode || 'linear', { kind: 'select', options: [['linear', '只经历一次'], ['loop', '可以重复多轮']], helpHtml: `选择「可以重复多轮」${helpButton('loop', '可以重复多轮')}后，需要设置「什么时候开始下一轮」` })}
      ${field('摘要', selectedStage.blockKey, 'summary', stage.summary, { kind: 'textarea', wide: true })}
      ${referenceField('这个场景里的角色', selectedStage.blockKey, 'roleIds', stage.roleIds, references.roles, { multiple: true })}${referenceField('地点', selectedStage.blockKey, 'locationIds', stage.locationIds, references.locations, { multiple: true })}
      ${advancedSettingsMarkup('stage-options', stageAdvanced)}
    </div></section><div class="shex-sim-tree-branch" data-simulator-event-branch><div class="shex-sim-section-bar">${sectionTitle('当前阶段事件', 'event')}</div><div data-simulator-event-list>${(stage.events || []).map((event, index) => eventMarkup(event, index, references, selectedStage.blockKey)).join('') || '<p class="shex-sim-empty" data-simulator-empty-events>尚未添加事件，事件可以为空。</p>'}</div><button type="button" class="shex-sim-tree-add" data-simulator-add-event>＋ 添加事件</button></div></div>` : '<p class="shex-sim-empty">当前章节还没有阶段。</p>';
    return stageForm;
  }
  function chapterCardMarkup(item, index, open = false, body = '') {
    const id = `sim-chapter-${item.payload.chapterId}`;
    return `<article class="shex-sim-chapter-card" data-simulator-chapter-card="${esc(item.blockKey)}" data-simulator-chapter-tone="${index % 6}"><header><button type="button" class="shex-sim-accordion-toggle" data-simulator-select-chapter="${esc(item.payload.chapterId)}" aria-expanded="${open}" aria-controls="${esc(id)}"><span><small>第 ${index + 1} 章 · ${item.stageBlocks.length} 个阶段</small><strong>${esc(item.payload.title || '未命名章节')}</strong></span></button>${storySettingsButton(item.blockKey, '章节')}${helpButton('chapter', '章节')}</header><div id="${esc(id)}" data-simulator-chapter-host>${body}</div></article>`;
  }
  function stageCardMarkup(item, index, open = false, body = '') {
    const id = `sim-stage-${item.payload.chapterId}-${item.payload.stageId}`;
    return `<article class="shex-sim-stage-card" data-simulator-stage-card="${esc(item.blockKey)}" data-simulator-stage-block-key="${esc(item.blockKey)}"><header><button type="button" class="shex-sim-accordion-toggle" data-simulator-select-stage="${esc(item.payload.stageId)}" aria-expanded="${open}" aria-controls="${esc(id)}"><span><small>阶段 ${index + 1} · ${(item.payload.events || []).length} 个事件</small><strong>${esc(item.payload.title || '未命名阶段')}</strong><span class="shex-sim-story-badge" data-simulator-stage-mode>${item.payload.mode === 'loop' ? '可以重复多轮' : '只经历一次'}</span></span></button>${storySettingsButton(item.blockKey, '阶段')}${helpButton('stage', '阶段')}</header><div id="${esc(id)}" data-simulator-stage-host>${body}</div></article>`;
  }
  function storySettingsButton(key, label) {
    return `<button type="button" class="shex-sim-settings-button" data-simulator-settings="${esc(key)}" aria-label="${label}设置" aria-expanded="false" aria-controls="sim-settings-${esc(key)}">设置</button>`;
  }
  function storyMarkup(chapters, selectedChapterId, selectedStageId, references = {}, world = {}) {
    const selectedChapter = chapters.find(item => item.payload.chapterId === selectedChapterId) || chapters[0];
    const cards = chapters.map((item, index) => {
      if (item !== selectedChapter) return chapterCardMarkup(item, index);
      const selectedStage = item.stageBlocks.find(stage => stage.payload.stageId === selectedStageId) || item.stageBlocks[0];
      const stages = item.stageBlocks.map((stage, stageIndex) => stageCardMarkup(stage, stageIndex, stage === selectedStage, stage === selectedStage ? stageEditorMarkup(stage, references) : '')).join('');
      const body = chapterEditorMarkup(item, references).replace('<div data-simulator-stage-list></div>', `<div data-simulator-stage-list>${stages}</div>`);
      return chapterCardMarkup(item, index, true, body);
    }).join('');
    return `<div data-simulator-story>${section('开场内容（可选）', `<div class="shex-sim-form-grid">${referenceField('开场说话者', 'world', 'openingSpeakerRoleId', world.openingSpeakerRoleId, references.roles, { placeholder:'默认（旁白 / X）', wide:true, help:'默认：<scene> 是旁白，其余由 X 说出。选择已登记角色后，<scene> 仍是旁白，其余文字由这个角色用自己的名字和头像说出。请确保该角色在开场阶段出场。' })}${field('开场白', 'world', 'openingText', world.openingText, { kind:'textarea', rows:6, maxCodepoints:3000, wide:true })}</div>`, '只在真正新建世界存档时作为第一条消息显示一次。可使用 <scene>场景</scene>、（动作）和普通对话；留空不生成消息。')}
      ${section('世界剧情', `<div class="shex-sim-story-accordion" data-simulator-chapter-list>${cards}</div><button type="button" data-simulator-add-chapter>＋ 添加章节</button>`, '章节 → 阶段 → 事件。连线表示归属，具体触发仍由各项设置决定。')}</div>`;
  }
  function directorMarkup(value, runtimeProfile) {
    const allowed = new Set(editableCandidateKinds(value.candidatePolicy?.allowedKinds, runtimeProfile));
    const displayedKinds = CANDIDATE_KINDS.filter(([kind]) => editableKindsForProfile(runtimeProfile).has(kind));
    const candidateHelp = runtimeProfile === 'ai_directed_v1'
      ? '当前版本支持事件变化、变量变化和章节阶段切换。'
      : '当前版本支持事件变化和变量变化。';
    return section('AI 导演设置', `<div class="shex-sim-form-grid">
      ${field('世界整体剧情目标', 'director', 'goal', value.narrativeGoal, { kind: 'textarea', rows: 4, wide: true, help: '这段内容在整个世界范围内长期有效，不随章节或阶段自动变化。当前阶段的具体处境、目标与压力请写在阶段简介或阶段说明中。' })}
      ${field('文风与语气', 'director', 'tone', value.toneInstructions, { kind: 'textarea', rows: 3, wide: true })}
      ${listField('NPC行为规则', 'director', 'npcRules', value.npcControlRules, '每行一条规则，逗号不会分条。', 'lines')}
      ${field('剧情节奏', 'director', 'tempo', value.pacing || 'balanced', { kind: 'select', options: [['slow', '慢'], ['balanced', '均衡'], ['fast', '快']] })}
      ${listField('禁止提前透露的内容', 'director', 'spoilers', value.forbiddenReveals, '每行一项，逗号不会分条。', 'lines')}
      ${advancedSettingsMarkup('director-policy', `<fieldset class="shex-sim-candidates wide"><legend>AI 可提出的变化</legend><p>决定 AI 在剧情中可以向系统提出哪些状态变化建议。${candidateHelp}AI 只能提出建议，最终是否生效由系统校验。</p>${displayedKinds.map(([kind, label, help]) => `<div><label><input type="checkbox" data-simulator-candidate="${kind}" ${allowed.has(kind) ? 'checked' : ''}>${esc(label)}</label><br><small>${esc(help)}</small></div>`).join('')}</fieldset>`)}
    </div>`, 'AI 可以提议事件发生，或提议修改已授权的变量；系统检查后决定是否生效。');
  }
  const ISSUE_LABELS = Object.freeze({ overview: '作品资料', world: '世界与角色', state: '状态与关系', story: '剧情与循环', director: 'AI导演', publish: '检查与发布' });
  const CONTENT_SUGGESTIONS = Object.freeze({
    'overview.title': '可以补充作品名称，让读者更容易识别这个世界。',
    'world.premise': '可以补充世界背景，让运行时更容易保持设定一致。',
    'director.narrativeGoal': '可以补充世界整体剧情目标，让长期剧情方向更清楚。',
    'director.toneInstructions': '可以补充文风与语气，让输出风格更稳定。',
  });
  function publicationContentRequirements(overview = {}) {
    const missing = [];
    if (!mediaFileId(overview.coverAssetRef)) missing.push({ key: 'promo', path: 'overview.coverAssetRef', step: 'overview', target: 'worldPromo', title: '作品资料 · 宣传主题图', message: '还没有上传宣传主题图' });
    if (!String(overview.summary || '').trim()) missing.push({ key: 'summary', path: 'overview.summary', step: 'overview', target: 'overview.summary', title: '作品资料 · 简介', message: '还没有填写作品简介' });
    return missing;
  }
  function stepForIssue(issue) {
    if (['PUBLICATION_CHAPTER_ENTRY_STAGE_MISSING', 'AUTO_EVENT_LEDGER_LIMIT', 'RUNTIME_PROFILE_REQUIRED_FOR_DELTA'].includes(String(issue?.code || ''))) return 'story';
    const path = [issue?.path, issue?.blockKey].map(value => String(value || '').trim()).filter(Boolean).join(' ');
    if (path.startsWith('overview')) return 'overview';
    if (path.startsWith('world') || path.startsWith('roster')) return 'world';
    if (path.startsWith('state')) return 'state';
    if (path.startsWith('director')) return 'director';
    if (/^(chapter|stage|event|chapters|stages|events)/.test(path)) return 'story';
    return 'publish';
  }
  function publicationStoryContext(snapshot = {}) {
    const blocks = Array.isArray(snapshot?.blocks) ? snapshot.blocks.filter(block => !block?.deleted) : [];
    const chapterBlocks = orderedNarrativeBlocks(blocks.filter(block => block?.blockType === 'chapter'), 'chapterId');
    const chapters = chapterBlocks.map((chapterBlock, chapterIndex) => {
      const chapterId = String(chapterBlock?.payload?.chapterId || '');
      const stageBlocks = orderedNarrativeBlocks(blocks.filter(block => block?.blockType === 'stage'
        && String(block?.payload?.chapterId || '') === chapterId), 'stageId');
      return {
        chapterIndex,
        chapterId,
        title: String(chapterBlock?.payload?.title || `未命名章节 ${chapterIndex + 1}`).trim() || `未命名章节 ${chapterIndex + 1}`,
        stages: stageBlocks.map((stageBlock, stageIndex) => ({
          stageIndex,
          stageId: String(stageBlock?.payload?.stageId || ''),
          title: String(stageBlock?.payload?.title || `未命名阶段 ${stageIndex + 1}`).trim() || `未命名阶段 ${stageIndex + 1}`,
          events: (Array.isArray(stageBlock?.payload?.events) ? stageBlock.payload.events : []).map((event, eventIndex) => ({
            eventIndex,
            title: String(event?.title || `未命名事件 ${eventIndex + 1}`).trim() || `未命名事件 ${eventIndex + 1}`,
          })),
        })),
      };
    });
    const world = blocks.find(block => block?.blockKey === 'world')?.payload || {};
    return { chapters, world };
  }

  function storyIssueLocation(issue, snapshot) {
    const context = publicationStoryContext(snapshot);
    const match = String(issue?.path || '').match(/^chapters\[(\d+)\](?:\.stages\[(\d+)\])?(?:\.events\[(\d+)\])?/);
    const chapterIndex = match ? Number(match[1]) : -1;
    const stageIndex = match && match[2] !== undefined ? Number(match[2]) : -1;
    const eventIndex = match && match[3] !== undefined ? Number(match[3]) : -1;
    const chapter = context.chapters[chapterIndex] || null;
    const stage = chapter?.stages?.[stageIndex] || null;
    const event = stage?.events?.[eventIndex] || null;
    return { ...context, chapter, stage, event, eventIndex };
  }

  const PUBLICATION_FIELD_NAMES = Object.freeze({
    'overview.title': '作品名称', 'overview.summary': '作品简介', 'overview.creatorNotes': '创作者说明',
    'overview.tagIds': '作品标签', 'world.premise': '世界背景', 'world.openingText': '开场白', 'world.openingSpeakerRoleId': '开场说话者',
    'world.rules': '世界规则', 'world.safetyNotes': '安全说明', 'world.locations': '世界地点',
    'world.toneTags': '世界氛围标签', 'roster.characters': '角色', 'state.variables': '变量',
    'state.items': '道具', 'chapters': '章节', 'director.narrativeGoal': '整体剧情目标',
    'director.toneInstructions': '文风与语气',
  });
  const PUBLICATION_LEAF_NAMES = Object.freeze({
    title: '标题', summary: '摘要', name: '名称', displayName: '名字', description: '说明',
    tags: '标签', rules: '规则', stages: '阶段', events: '事件', key: '名称',
    repeatPolicy: '循环规则', random: '随机触发', mode: '阶段模式',
    order: '顺序', stageIds: '阶段清单', eventIds: '事件清单', roleIds: '关联角色',
    locationIds: '关联地点', routeId: '剧情分支', effects: '事件效果',
  });
  function publicationFieldLocation(issue, snapshot, story) {
    const path = String(issue?.path || '');
    if (path === '$') return '世界内容';
    if (/^chapters(?:\[|$)/.test(path)) {
      const names = [];
      if (story?.chapter) names.push(`章节「${story.chapter.title}」`);
      else if (/^chapters\[\d+\]/.test(path)) names.push(`第 ${Number(path.match(/^chapters\[(\d+)\]/)[1]) + 1} 章`);
      if (story?.stage) names.push(`阶段「${story.stage.title}」`);
      else if (/\.stages\[\d+\]/.test(path)) names.push(`第 ${Number(path.match(/\.stages\[(\d+)\]/)[1]) + 1} 个阶段`);
      if (story?.event) names.push(`事件「${story.event.title}」`);
      else if (/\.events\[\d+\]/.test(path)) names.push(`第 ${Number(path.match(/\.events\[(\d+)\]/)[1]) + 1} 个事件`);
      const leaf = path.split('.').at(-1).replace(/\[\d+\]$/, '');
      if (!names.length) return '章节';
      return `${names.join(' → ')}${['stages', 'events'].includes(leaf) ? `的${PUBLICATION_LEAF_NAMES[leaf]}` : leaf === 'title' ? '的标题' : leaf === 'summary' ? '的摘要' : PUBLICATION_LEAF_NAMES[leaf] ? `的${PUBLICATION_LEAF_NAMES[leaf]}` : ''}`;
    }
    const indexed = path.match(/^(world\.locations|world\.rules|roster\.characters|state\.variables|state\.items|state\.routes)\[(\d+)\](?:\.(\w+))?/);
    if (indexed) {
      const base = PUBLICATION_FIELD_NAMES[indexed[1]] || (indexed[1] === 'state.routes' ? '剧情分支' : '内容');
      const leaf = PUBLICATION_LEAF_NAMES[indexed[3]] || '';
      return `第 ${Number(indexed[2]) + 1} 个${base}${leaf ? `的${leaf}` : ''}`;
    }
    return PUBLICATION_FIELD_NAMES[path] || PUBLICATION_FIELD_NAMES[path.split('.').slice(0, 2).join('.')]
      || `${ISSUE_LABELS[stepForIssue(issue)]}${PUBLICATION_LEAF_NAMES[path.split('.').at(-1)] ? `的${PUBLICATION_LEAF_NAMES[path.split('.').at(-1)]}` : ''}`;
  }
  function publicationIssueValue(snapshot, path) {
    const blocks = (Array.isArray(snapshot?.blocks) ? snapshot.blocks : []).filter(block => !block?.deleted);
    if (path === 'chapters') return blocks.filter(block => block?.blockType === 'chapter').length;
    const parts = String(path || '').replace(/\[(\d+)\]/g, '.$1').split('.');
    if (parts[0] === '$') return blocks.length;
    let value;
    if (parts[0] === 'chapters') {
      const chapter = orderedNarrativeBlocks(blocks.filter(block => block?.blockType === 'chapter'), 'chapterId')[Number(parts[1])];
      value = chapter?.payload;
      parts.splice(0, 2);
      if (parts[0] === 'stages') {
        if (parts.length === 1) return blocks.filter(block => block?.blockType === 'stage' && block?.payload?.chapterId === chapter?.payload?.chapterId).length;
        const stage = orderedNarrativeBlocks(blocks.filter(block => block?.blockType === 'stage' && block?.payload?.chapterId === chapter?.payload?.chapterId), 'stageId')[Number(parts[1])];
        value = stage?.payload;
        parts.splice(0, 2);
      }
    } else {
      value = blocks.find(block => block?.blockKey === parts[0])?.payload;
      parts.shift();
    }
    for (const part of parts) value = value?.[part];
    return value;
  }
  function publicationMeasuredIssue(issue, snapshot, story) {
    const code = String(issue?.code || '');
    if (!['TEXT_INVALID', 'LIMIT_EXCEEDED'].includes(code)) return '';
    const label = publicationFieldLocation(issue, snapshot, story);
    const value = publicationIssueValue(snapshot, issue?.path);
    const maximum = Number(String(issue?.message || '').match(/超过\s*(\d+)/)?.[1]);
    const isText = code === 'TEXT_INVALID' || typeof value === 'string';
    const actual = typeof value === 'string' ? Array.from(value).length : Array.isArray(value) ? value.length : typeof value === 'number' ? value : null;
    if (code === 'TEXT_INVALID' && (!value || (typeof value === 'string' && !value.trim())) && /必填/.test(String(issue?.message || ''))) return `${label}还没有填写，请在对应位置补上内容。`;
    if (code === 'TEXT_INVALID' && value !== undefined && typeof value !== 'string') return `${label}需要填写文字，请检查这个输入项。`;
    if (!Number.isInteger(maximum) || maximum <= 0) return `${label}超过发布限制，请在对应位置精简。`;
    const unit = isText ? '字' : /规则|说明/.test(label) ? '条' : '个';
    const limit = `${label}最多 ${maximum} ${unit}`;
    if (actual === null) return `${limit}，请在对应位置检查并精简。`;
    const excess = actual - maximum;
    return excess > 0
      ? `${limit}，当前 ${actual} ${unit}；请${isText ? '删减' : '移除'}至少 ${excess} ${unit}。`
      : `${limit}，当前 ${actual} ${unit}；请重新保存后检查。`;
  }
  function publicationStoryTarget(story) {
    if (story?.event && story?.stage && story?.chapter) return { target: 'story:event', chapterId: story.chapter.chapterId, stageId: story.stage.stageId, eventIndex: story.eventIndex };
    if (story?.stage && story?.chapter) return { target: 'story:stage', chapterId: story.chapter.chapterId, stageId: story.stage.stageId };
    if (story?.chapter) return { target: 'story:chapter', chapterId: story.chapter.chapterId };
    return {};
  }
  function publicationHumanReason(issue) {
    const reason = String(issue?.message || '').trim();
    if (!/[\u3400-\u9fff]/u.test(reason) || /[A-Za-z_][A-Za-z_0-9-]{5,}/.test(reason) || reason.length > 160) return '';
    return reason.replace(/\btrue\b/g, '是').replace(/\bfalse\b/g, '否');
  }

  function publicationIssueView(issue, tone = 'blocker', snapshot = {}) {
    const code = String(issue?.code || '');
    const path = String(issue?.path || '');
    let step = stepForIssue(issue);
    let message = code === 'CONTENT_RECOMMENDED' ? (CONTENT_SUGGESTIONS[path] || '') : '';
    if (!message && tone === 'suggestion') message = publicationHumanReason(issue)
      ? `${publicationFieldLocation(issue, snapshot, null)}：${publicationHumanReason(issue)}（不影响发布）`
      : `${ISSUE_LABELS[step]}还有可继续完善的内容，这不会阻止发布。`;
    if (!message && code.startsWith('WORLD_PUBLIC_MEDIA_')) {
      step = 'overview';
      message = '宣传图片尚未通过安全确认或已经失效，请重新上传对应图片。';
    }
    if (!message && ['WORLD_IMPORTED_TAGS_INVALID', 'WORLD_TAG_NOT_ACTIVE'].includes(code)) {
      return {
        step: 'overview', section: '作品资料 · 标签',
        message: code === 'WORLD_IMPORTED_TAGS_INVALID'
          ? String(issue?.message || '导入的标签已停用或不存在，请移除后再发布')
          : '所选作品标签已停用或不存在，请到作品资料中移除或更换标签。'
      };
    }
    if (!message && code === 'CANDIDATE_POLICY_UNSUPPORTED') return {
      step: 'director', section: 'AI 导演 · 可提出的变化',
      message: '当前运行模式不支持所选的变化类型，请到“AI 导演”取消不支持的选项并保存。',
    };
    const story = step === 'story' || /^(OPENING_|STAGE_|EVENT_|REPEAT_|RANDOM_)/.test(code)
      ? storyIssueLocation(issue, snapshot) : null;
    if (!message && code === 'OPENING_CHAPTER_NOT_FOUND' && story?.chapters.length === 0) {
      return {
        step: 'story', section: '剧情与循环 · 章节', message: '还没有创建章节',
        detail: '世界至少需要 1 个章节，并在章节中添加至少 1 个阶段后才能发布',
        action: '前往添加章节', target: 'story:add-chapter',
      };
    }
    if (!message && code === 'OPENING_CHAPTER_NOT_FOUND' && story?.chapters.length) {
      return { step: 'story', section: '剧情与循环 · 开场位置', message: '已有章节，但保存的开场章节没有对应到现有章节；请打开剧情页，保存改动后重新检查。',
        action: '前往检查剧情', target: 'story:chapter', chapterId: story.chapters[0].chapterId };
    }
    if (!message && code === 'OPENING_STAGE_INVALID') {
      const openingChapterId = String(story?.world?.openingChapterId || '');
      const openingChapter = story?.chapters.find(chapter => chapter.chapterId === openingChapterId)
        || (story?.chapters.length === 1 ? story.chapters[0] : null);
      if (openingChapter && openingChapter.stages.length === 0) {
        return {
          step: 'story', section: `剧情与循环 · ${openingChapter.title}`, message: '这个章节还没有阶段',
          detail: '每个用于运行的章节至少需要一个阶段',
          action: '前往添加阶段', target: 'story:add-stage', chapterId: openingChapter.chapterId,
        };
      }
      const first = story?.chapters.find(chapter => chapter.stages.length)?.stages[0];
      const parent = story?.chapters.find(chapter => chapter.stages.includes(first));
      return first && parent
        ? { step: 'story', section: '剧情与循环 · 开场位置', message: '已有章节和阶段，但保存的开场阶段没有对应到现有阶段；请打开剧情页，保存改动后重新检查。',
          action: '前往检查阶段', target: 'story:stage', chapterId: parent.chapterId, stageId: first.stageId }
        : { step: 'story', section: '剧情与循环 · 阶段', message: '已有章节，但还没有可用的阶段；请在任一章节中添加阶段。', action: '前往添加阶段', target: 'story:add-stage', chapterId: story?.chapters[0]?.chapterId };
    }
    if (!message && code.startsWith('REPEAT_') && story?.stage) {
      return {
        step: 'story', section: `剧情与循环 · ${story.stage.title}`,
        message: code === 'REPEAT_POLICY_REQUIRED' ? `阶段「${story.stage.title}」设为“可以重复多轮”，请在阶段设置中补齐循环规则。`
          : `阶段「${story.stage.title}」的循环规则有误：${/maxOccurrences/.test(path) ? '最大循环次数应为正整数，或留空表示不限制。' : /resetEventIds/.test(path) ? '重置的事件必须属于当前阶段。' : /VariableKeys/.test(path) ? '请检查所选变量是否存在、能否重置以及是否重复选择。' : '请检查阶段设置中的循环选项。'}`,
        action: '前往检查阶段', target: 'story:stage',
        chapterId: story.chapter.chapterId, stageId: story.stage.stageId,
      };
    }
    if (!message && code.startsWith('RANDOM_') && story?.event) {
      return {
        step: 'story', section: `剧情与循环 · ${story.event.title}`,
        message: `事件「${story.event.title}」的随机触发设置有误，请检查权重、冷却轮数和最大触发次数。`,
        action: '前往检查事件', target: 'story:event',
        chapterId: story.chapter.chapterId, stageId: story.stage.stageId, eventIndex: story.eventIndex,
      };
    }
    if (!message && code === 'DANGLING_REFERENCE') {
      if (story?.event && /\.roleIds\[\d+\]$/.test(path)) {
        return {
          step: 'story', section: `剧情与循环 · ${story.event.title}`,
          message: `事件「${story.event.title}」引用了不存在的角色`,
          action: '前往检查事件', target: 'story:event',
          chapterId: story.chapter.chapterId, stageId: story.stage.stageId, eventIndex: story.eventIndex,
        };
      }
      const label = publicationFieldLocation(issue, snapshot, story);
      message = /\.stageIds$/.test(path) ? `${label}与实际阶段不一致，请打开该章节、保存改动后重新检查。`
        : /\.eventIds$/.test(path) ? `${label}与实际事件不一致，请打开该阶段、保存改动后重新检查。`
          : /\.roleIds\[\d+\]$/.test(path) ? `${label}包含已不存在的角色，请移除该角色引用或重新选择。`
            : /\.locationIds\[\d+\]$/.test(path) ? `${label}包含已不存在的地点，请移除该地点引用或重新选择。`
              : /\.routeId$/.test(path) ? `${label}引用的剧情分支已不存在，请重新选择。`
                : `${label}关联的内容已不存在，请重新选择对应内容后保存。`;
    }
    if (!message && ['ID_INVALID', 'DUPLICATE_ID', 'ORDER_INVALID', 'DUPLICATE_ORDER'].includes(code)) message = `${publicationFieldLocation(issue, snapshot, story)}${code === 'DUPLICATE_ORDER' ? '的顺序与同级内容重复，请调整顺序。' : code === 'ORDER_INVALID' ? '的顺序应为大于 0 的整数，请修改后保存。' : code === 'DUPLICATE_ID' ? '与另一项的标识重复，请删除重复项或重新创建。' : '的标识无效，请重新创建这一项。'}`;
    if (!message) message = publicationMeasuredIssue(issue, snapshot, story);
    if (!message && code.startsWith('VARIABLE_')) { step = 'state'; message = `${publicationFieldLocation(issue, snapshot, story)}：${publicationHumanReason(issue) || '类型、初始值或范围有误，请在变量设置中修改。'}`; }
    if (!message && code.startsWith('ITEM_')) { step = 'state'; message = `${publicationFieldLocation(issue, snapshot, story)}：${publicationHumanReason(issue) || '数据有误，请在道具设置中修改。'}`; }
    if (!message && code.startsWith('RELATIONSHIP_')) { step = 'state'; message = `${publicationFieldLocation(issue, snapshot, story)}：${publicationHumanReason(issue) || '请检查角色和关系数值。'}`; }
    if (!message && code.startsWith('CHARACTER_')) { step = 'world'; message = `${publicationFieldLocation(issue, snapshot, story)}：${publicationHumanReason(issue) || '角色资料或来源已失效，请重新选择对应角色。'}`; }
    if (!message && code === 'PUBLICATION_CHAPTER_ENTRY_STAGE_MISSING') message = '有章节设置了进入条件，但该章没有阶段；请给该章添加阶段，或移除进入条件。';
    if (!message && code === 'AUTO_EVENT_LEDGER_LIMIT') message = `${publicationFieldLocation(issue, snapshot, story)}的效果过多，请拆成多个事件，每次自动结算最多处理 32 条记录。`;
    if (!message && code === 'RUNTIME_PROFILE_REQUIRED_FOR_DELTA') message = `${publicationFieldLocation(issue, snapshot, story)}使用了数值增减效果，请在世界设置中选择支持该效果的运行模式。`;
    if (!message && /^(OPENING_|STAGE_|EVENT_|REPEAT_|RANDOM_)/.test(code)) {
      step = 'story';
      const label = publicationFieldLocation(issue, snapshot, story);
      if (code === 'STAGE_MODE_INVALID') message = `${label}无效，请在阶段设置中重新选择“只经历一次”或“可以重复多轮”。`;
      else if (code === 'STAGE_CHAPTER_MISMATCH' || code === 'EVENT_STAGE_MISMATCH') message = `${label}的归属与当前剧情结构不一致，请重新保存对应章节或阶段后检查。`;
      else message = `${label}未通过检查，请打开对应内容核对设置并保存后重试。`;
    }
    if (!message && ['CONTENT_RATING_INVALID', 'VISIBILITY_INVALID'].includes(code)) { step = 'overview'; message = '作品资料中的发布设置无效，请重新选择后保存。'; }
    if (!message && ['PACING_INVALID', 'CANDIDATE_POLICY_INVALID', 'AI_OUTPUT_CONTRACT_INVALID'].includes(code)) { step = 'director'; message = 'AI 导演设置存在不兼容的数据，请重新选择对应设置。'; }
    if (!message && step !== 'publish') {
      const reason = publicationHumanReason(issue);
      if (reason) message = `${publicationFieldLocation(issue, snapshot, story)}：${reason}`;
    }
    if (!message) message = step === 'publish'
      ? '草稿的核心结构或数据不完整，请重新保存后再检查。'
      : `${ISSUE_LABELS[step]}中存在结构或数据问题，请检查该步骤后重试。`;
    const location = publicationFieldLocation(issue, snapshot, story);
    return { step, section: step === 'story' && story?.chapter ? `剧情与循环 · ${story.chapter.title}` : ISSUE_LABELS[step],
      message, ...(story ? publicationStoryTarget(story) : {}),
      ...((code === 'TEXT_INVALID' || code === 'LIMIT_EXCEEDED') ? { detail: `位置：${location}` } : {}) };
  }
  function issueListMarkup(items, tone, snapshot = {}) {
    return (items || []).length ? `<div class="shex-sim-issue-list ${esc(tone)}">${items.map(item => {
      const view = publicationIssueView(item, tone, snapshot);
      const fieldPath = String(item?.path || '').replace(/\[(\d+)\]/g, '.$1');
      const fieldAttr = view.step !== 'story' && /^(overview|world|state|roster|director)\.[a-zA-Z0-9_.]+$/.test(fieldPath)
        ? ` data-simulator-issue-field="${esc(fieldPath)}"` : '';
      const targetAttrs = view.target
        ? ` data-simulator-issue-target="${esc(view.target)}" data-chapter-id="${esc(view.chapterId || '')}" data-stage-id="${esc(view.stageId || '')}" data-event-index="${Number.isInteger(view.eventIndex) ? view.eventIndex : ''}"`
        : ` data-simulator-issue-step="${esc(view.step)}"${fieldAttr}`;
      return `<article class="shex-sim-issue-card"><strong>${esc(view.section)}</strong><p>${esc(view.message)}</p>${view.detail ? `<small>${esc(view.detail)}</small>` : ''}${view.step !== 'publish' ? `<button type="button" class="link"${targetAttrs}>${esc(view.action || '前往检查')}</button>` : ''}</article>`;
    }).join('')}</div>` : '';
  }
  function requirementMarkup(items) {
    return items.length ? `<div class="shex-sim-issue-list blocker">${items.map(item => `<article class="shex-sim-issue-card" data-simulator-required="${esc(item.key)}"><strong>${esc(item.title)}</strong><p>${esc(item.message)}</p><button type="button" class="link" data-simulator-required-target="${esc(item.target)}">前往完善</button></article>`).join('')}</div>` : '';
  }
  function publishMarkup(snapshot, publication, overview = {}) {
    const check = snapshot.publicationCheck;
    const checked = check && Number(check.checkedDraftRevision) === snapshot.revision;
    const missingRequirements = publicationContentRequirements(overview);
    const contentPaths = new Set(missingRequirements.map(item => item.path));
    const structuralBlockers = checked && !check.publishable ? [...new Map((check.blockingIssues || [])
      .filter(item => !contentPaths.has(String(item?.path || '')))
      .map(item => [`${item?.code}|${item?.path}|${item?.message}`, item])).values()] : [];
    const recommendations = checked ? [...(check.reviewWarnings || []), ...(check.suggestions || [])] : [];
    const status = missingRequirements.length
      ? `<strong class="error">暂不可发布</strong>${requirementMarkup(missingRequirements)}${issueListMarkup(structuralBlockers, 'blocker', snapshot)}`
      : checked && !check.publishable
        ? `<strong class="error">暂不可发布</strong>${issueListMarkup(structuralBlockers, 'blocker', snapshot)}`
        : checked
          ? '<strong class="ok">可以发布</strong><p>发布所需内容已完整</p>'
          : '<strong class="ok">发布所需内容已完整</strong><p>保存后运行检查，确认核心结构与数据正常。</p>';
    const recommendationMarkup = recommendations.length ? `<section class="shex-sim-recommendations"><h4>可继续完善</h4><p>以下内容不会阻止发布。</p>${issueListMarkup(recommendations, 'suggestion', snapshot)}</section>` : '';
    return section('发布前检查', `<div class="shex-sim-check-summary"><p>未保存内容：<strong>${snapshot.dirtyBlockKeys.length}</strong></p></div>
      <div class="shex-sim-section-actions"><button type="button" class="primary" data-simulator-check-publish ${snapshot.dirtyBlockKeys.length || snapshot.saving || missingRequirements.length ? 'disabled' : ''}>检查并发布</button></div>
      <div data-simulator-check-result class="shex-sim-check-result">${status}${recommendationMarkup}</div>
      ${publication ? '<div class="shex-sim-publication" data-simulator-publication-result><strong>发布版本已生成</strong><small>已经生成可稳定使用的发布内容。</small></div>' : ''}`,
    '检查会区分真正阻止发布的问题与可选的完善建议。');
  }

  function createSimulatorWorkbench(options = {}) {
    if (!stateApi?.createSimulatorEditorState) throw new Error('simulator creator state dependency is required');
    const root = options.root;
    const client = options.client;
    const isAdmin = options.isAdmin;
    const hasAccess = typeof options.hasAccess === 'function' ? options.hasAccess : isAdmin;
    const offlineEnabled = options.offlineEnabled;
    if (!root || !client || typeof hasAccess !== 'function') throw new Error('simulator creator dependencies are required');
    const createRequestId = typeof options.createRequestId === 'function' ? options.createRequestId : prefix => `${prefix}_${Date.now().toString(36)}`;
    const createEntityId = typeof options.createEntityId === 'function' ? options.createEntityId : createRequestId;
    const categoryStore = options.categoryStore;
    const tagStore = options.tagStore;
    const initialCategories = categoryStore?.current?.() || {};
    const initialTags = tagStore?.current?.() || {};
    const editor = stateApi.createSimulatorEditorState({ createRequestId });
    const ui = { step: 'overview', generation: 0, loading: false, busy: '', error: '', notice: '', draftStatus: 'draft', selectedChapterId: '', selectedStageId: '', publication: null, mediaUrls: {}, mediaPending: new Set(),
      taxonomy: { categories: initialCategories.categories || [], tags: initialTags.tags || [], knownTags: initialTags.tags || [], query: '', createName: '', creating: false, loading: false, hydrated: false, catalogComplete: false, notice: '', error: '', generation: 0 },
      picker: { open: false, query: '', cursor: '', hasMore: false, items: [], selectedDraftIds: [], selectedItems: new Map(), replaceRoleId: '', loading: false, error: '', generation: 0 } };
    const lastFieldKeyByBlock = new Map();
    const saveOrdinalByBlock = new Map();
    let bound = false;
    let tagSearchTimer = null;
    let stickyHeadObserver = null;

    function allowed() { return offlineEnabled === true && hasAccess() === true; }
    function assertAllowed() { if (!allowed()) throw new Error('世界创作暂未对当前账号开放'); }
    function markIndependentPage(active) {
      root.closest?.('.shex-character-gallery')?.classList.toggle('is-world-creator-independent', active === true);
    }
    function notify(message) { if (message && typeof options.notify === 'function') options.notify(message); }
    let reimportPanel = null;
    function snapshot() { return editor.getSnapshot(); }
    function blockPayload(key, fallback) { return editor.getBlock(key)?.payload || clone(fallback); }
    function createSaveTrace(blockKeyValue, fieldKeyValue = '') {
      const blockKey = String(blockKeyValue || '');
      const ordinal = Number(saveOrdinalByBlock.get(blockKey) || 0) + 1;
      saveOrdinalByBlock.set(blockKey, ordinal);
      const fieldKey = String(fieldKeyValue || lastFieldKeyByBlock.get(blockKey) || '');
      function emit(phaseName, request = {}, result = {}, error = null, source = '') {
        const block = editor.getBlock(blockKey);
        const patch = (request?.patches || []).find(item => String(item?.blockKey || '') === blockKey) || {};
        const head = (result?.blockHeads || []).find(item => String(item?.blockKey || '') === blockKey) || {};
        return recordSaveTrace({
          phase: `${phaseName}_${ordinal}`,
          draftId: String(request?.draftId || snapshot().draftId || ''),
          blockKey,
          fieldKey,
          requestId: String(request?.requestId || error?.requestId || ''),
          caller: 'simulator-creator-workbench',
          callerStack: String(new Error('WORLD_DRAFT_SAVE_TRACE').stack || ''),
          stateSource: source,
          revisionReadSource: phaseName === 'before_save' || phaseName === 'request_payload'
            ? `createSimulatorEditorState.blocks.get(${blockKey}).revision`
            : '',
          revisionWriteTarget: phaseName === 'after_state_apply'
            ? `createSimulatorEditorState.blocks.get(${blockKey}).revision`
            : '',
          localRevision: integerOrNull(block?.revision),
          draftBaseRevision: integerOrNull(request?.baseRevision),
          requestBaseRevision: integerOrNull(patch?.baseRevision),
          requestPayloadRevision: integerOrNull(patch?.baseRevision),
          backendReturnedRevision: integerOrNull(head?.revision),
          backendCurrentRevision: integerOrNull(error?.currentRevision ?? head?.revision),
          contentHash: String(head?.contentHash || block?.contentHash || ''),
          errorCode: String(error?.code || ''),
          message: String(error?.message || ''),
          expectedRevision: integerOrNull(error?.expectedRevision ?? patch?.baseRevision),
        });
      }
      return Object.freeze({
        before: request => emit('before_save', request, {}, null, 'simulator-creator-state.blocks[blockKey].revision'),
        request: request => emit('request_payload', request, {}, null, 'simulator-creator-state.makeIntent.patch.baseRevision'),
        response: (request, result) => emit('after_response', request, result, null, 'shexWorldCreator.saveDraftBlocks.result.blockHeads'),
        applied: (request, result) => emit('after_state_apply', request, result, null, 'simulator-creator-state.acknowledgeSave.blocks[blockKey].revision'),
        failure: (request, error) => emit('after_response', request, {}, error, 'shexWorldCreator.saveDraftBlocks.failure'),
      });
    }
    function chapters() {
      const snap = snapshot();
      const chapterBlocks = orderedNarrativeBlocks(snap.blocks.filter(block => block.blockType === 'chapter' && !block.deleted), 'chapterId');
      return chapterBlocks.map(block => ({ ...block, stageBlocks: orderedNarrativeBlocks(snap.blocks.filter(stage => stage.blockType === 'stage' && !stage.deleted && stage.payload?.chapterId === block.payload?.chapterId), 'stageId') }));
    }
    function currentStageBlock() {
      const all = chapters();
      const chapter = all.find(item => item.payload.chapterId === ui.selectedChapterId) || all[0];
      return chapter?.stageBlocks.find(item => item.payload.stageId === ui.selectedStageId) || chapter?.stageBlocks[0] || null;
    }
    function normalizeSelection() {
      const all = chapters();
      const chapter = all.find(item => item.payload.chapterId === ui.selectedChapterId) || all[0];
      ui.selectedChapterId = chapter?.payload.chapterId || '';
      const stage = chapter?.stageBlocks.find(item => item.payload.stageId === ui.selectedStageId) || chapter?.stageBlocks[0];
      ui.selectedStageId = stage?.payload.stageId || '';
    }
    // UI-only caches retain raw input nodes; no expansion state enters Draft.
    const storyUi = { node: null, chapter: '', stages: new Map(), chapters: new Map(), bodies: new Map(), settings: new Set(), composing: false, pending: null, refs: '', compositionInput: null, compositionTimer: null, refreshAfterComposition: new Set() };
    function resetStoryUi() {
      clearTimeout(storyUi.compositionTimer); storyUi.compositionInput = null; storyUi.refreshAfterComposition.clear();
      storyUi.node = null; storyUi.chapter = ''; storyUi.stages.clear(); storyUi.chapters.clear(); storyUi.bodies.clear(); storyUi.settings.clear(); storyUi.composing = false; storyUi.pending = null; storyUi.refs = '';
    }
    function elementFrom(html) { const template = document.createElement('template'); template.innerHTML = html.trim(); return template.content.firstElementChild; }
    function storyReferences(all = chapters()) {
      const defaults = stateApi.createBlankCoreBlocks();
      return createReferenceCatalog(all, blockPayload('world', defaults.world), blockPayload('roster', defaults.roster), blockPayload('state', defaults.state));
    }
    function stageForTarget(target) {
      const key = target?.closest?.('[data-simulator-stage-block-key]')?.dataset.simulatorStageBlockKey;
      const block = key ? editor.getBlock(key) : null;
      return block && !block.deleted ? block : null;
    }
    function chapterForTarget(target) {
      const key = target?.closest?.('[data-simulator-chapter-card]')?.dataset.simulatorChapterCard;
      return chapters().find(item => item.blockKey === key) || null;
    }
    function nodeIdentity(node) {
      if (node.nodeType !== 1) return '';
      if (node.hasAttribute('data-simulator-settings-region')) return `settings:${node.dataset.simulatorSettingsRegion}`;
      if (node.matches('label.shex-sim-field')) { const control = node.querySelector('[data-block][data-path]'); if (control) return `label:${control.dataset.block}:${control.dataset.path}`; }
      const reference = node.matches('[data-simulator-reference]') ? node : node.matches('label') ? node.querySelector('[data-simulator-reference]') : null;
      if (reference) return `${node.tagName}:reference:${reference.dataset.block}:${reference.dataset.path}:${reference.value}`;
      if (node.hasAttribute('data-simulator-event-id')) return `event:${node.dataset.simulatorEventId}`;
      if (node.hasAttribute('data-simulator-field')) return `field:${node.dataset.block}:${node.dataset.path}`;
      if (node.hasAttribute('data-simulator-advanced')) return `advanced:${node.dataset.simulatorAdvanced}`;
      return '';
    }
    // Reconcile only a changed form region. Keep compatible controls and their raw values.
    function patchStoryNode(oldNode, nextNode, resetPaths = []) {
      if (oldNode.nodeType !== nextNode.nodeType || oldNode.nodeName !== nextNode.nodeName) { oldNode.replaceWith(nextNode); return nextNode; }
      if (oldNode.nodeType !== 1) { if (oldNode.nodeValue !== nextNode.nodeValue) oldNode.nodeValue = nextNode.nodeValue; return oldNode; }
      const advanced = oldNode.hasAttribute('data-simulator-advanced-toggle') || oldNode.hasAttribute('data-simulator-advanced-region') || oldNode.hasAttribute('data-simulator-settings-region');
      if (oldNode.matches('[data-block][data-path]') && resetPaths.some(path => oldNode.dataset.path === path || oldNode.dataset.path.startsWith(path + '.'))) { oldNode.replaceWith(nextNode); return nextNode; }
      if (oldNode.matches('input,textarea')) {
        if (oldNode.type !== nextNode.type || oldNode.dataset.valueType !== nextNode.dataset.valueType) { oldNode.replaceWith(nextNode); return nextNode; }
        if (oldNode.hasAttribute('data-simulator-reference')) { oldNode.value = nextNode.value; oldNode.checked = nextNode.checked; }
        for (const attr of nextNode.attributes) if (!['value', 'checked'].includes(attr.name)) oldNode.setAttribute(attr.name, attr.value);
        return oldNode;
      }
      const selection = oldNode.tagName === 'SELECT' ? oldNode.value : null;
      for (const attr of [...oldNode.attributes]) if (!nextNode.hasAttribute(attr.name) && !(advanced && ['hidden', 'aria-expanded'].includes(attr.name))) oldNode.removeAttribute(attr.name);
      for (const attr of nextNode.attributes) if (!(advanced && ['hidden', 'aria-expanded'].includes(attr.name))) oldNode.setAttribute(attr.name, attr.value);
      if (oldNode.hasAttribute('data-simulator-advanced-toggle')) return oldNode;
      const existing = [...oldNode.childNodes];
      const keyed = new Map(existing.map(n => [nodeIdentity(n), n]).filter(([key]) => key));
      const used = new Set();
      [...nextNode.childNodes].forEach((next, index) => {
        const key = nodeIdentity(next);
        let current = key ? keyed.get(key) : existing[index];
        if (current && (used.has(current) || (nodeIdentity(current) && nodeIdentity(current) !== key) || current.nodeName !== next.nodeName)) current = null;
        if (current) { used.add(current); current = patchStoryNode(current, next, resetPaths); }
        else current = next;
        const at = oldNode.childNodes[index];
        if (at !== current) oldNode.insertBefore(current, at || null);
      });
      for (const child of existing) if (!used.has(child) && child.parentNode === oldNode) child.remove();
      if (selection !== null && [...oldNode.options].some(option => option.value === selection)) oldNode.value = selection;
      return oldNode;
    }
    function reindexEventNodes(body, stage) {
      const events = stage.payload.events || [];
      body.querySelectorAll('[data-simulator-event-id]').forEach(card => {
        const index = events.findIndex(event => String(event.eventId) === card.dataset.simulatorEventId);
        if (index < 0) { card.remove(); return; }
        card.querySelectorAll('*').forEach(node => {
          for (const attr of [...node.attributes]) {
            if (attr.name.startsWith('data-') && /events\.\d+\./.test(attr.value)) node.setAttribute(attr.name, attr.value.replace(/events\.\d+\./g, `events.${index}.`));
          }
          for (const name of ['data-event-index', 'data-simulator-add-event-condition', 'data-simulator-add-event-effect']) if (node.hasAttribute(name)) node.setAttribute(name, String(index));
          if (node.dataset.simulatorRemove === 'event') node.dataset.index = String(index);
        });
      });
    }
    function refreshStoryForm(key, resetPaths = []) {
      if (storyUi.composing) { storyUi.refreshAfterComposition.add(key); return; }
      const all = chapters(); const refs = storyReferences(all);
      const chapter = all.find(item => item.blockKey === key);
      if (chapter && storyUi.chapters.has(key)) {
        const body = storyUi.chapters.get(key);
        const list = body.querySelector('[data-simulator-stage-list]');
        const placeholder = document.createElement('div'); placeholder.dataset.simulatorStageList = ''; list.replaceWith(placeholder);
        patchStoryNode(body, elementFrom(chapterEditorMarkup(chapter, refs)), resetPaths);
        body.querySelector('[data-simulator-stage-list]').replaceWith(list);
      }
      const stage = editor.getBlock(key); const body = storyUi.bodies.get(key);
      if (stage?.blockType === 'stage' && body) {
        reindexEventNodes(body, stage);
        patchStoryNode(body, elementFrom(stageEditorMarkup(stage, refs)), resetPaths);
      }
    }
    function syncStory() {
      if (!storyUi.node) return;
      if (storyUi.composing) return;
      scheduleBudgetRefresh();
      const all = chapters(); const refs = storyReferences(all);
      const validChapters = new Set(all.map(item => item.blockKey));
      const validStages = new Set(all.flatMap(item => item.stageBlocks.map(stage => stage.blockKey)));
      for (const key of storyUi.settings) if (!validChapters.has(key) && !validStages.has(key)) storyUi.settings.delete(key);
      for (const [key, body] of storyUi.chapters) if (!validChapters.has(key)) { body.remove(); storyUi.chapters.delete(key); storyUi.stages.delete(key); }
      for (const [key, body] of storyUi.bodies) if (!validStages.has(key)) { body.remove(); storyUi.bodies.delete(key); }
      if (!validChapters.has(storyUi.chapter)) storyUi.chapter = '';
      const refsSignature = JSON.stringify(refs);
      if (storyUi.refs && storyUi.refs !== refsSignature) {
        for (const key of storyUi.chapters.keys()) refreshStoryForm(key);
        for (const key of storyUi.bodies.keys()) refreshStoryForm(key);
      }
      storyUi.refs = refsSignature;
      const list = storyUi.node.querySelector('[data-simulator-chapter-list]');
      const oldCards = new Map([...list.children].map(node => [node.dataset.simulatorChapterCard, node]));
      all.forEach((chapter, index) => {
        let card = oldCards.get(chapter.blockKey);
        if (!card) card = elementFrom(chapterCardMarkup(chapter, index));
        card.dataset.simulatorChapterTone = String(index % 6);
        const toggle = card.querySelector('[data-simulator-select-chapter]');
        toggle.setAttribute('aria-expanded', String(chapter.blockKey === storyUi.chapter));
        toggle.querySelector('small').textContent = `第 ${index + 1} 章 · ${chapter.stageBlocks.length} 个阶段`;
        toggle.querySelector('strong').textContent = chapter.payload.title || '未命名章节';
        if (list.children[index] !== card) list.insertBefore(card, list.children[index] || null);
        if (chapter.blockKey !== storyUi.chapter) { storyUi.chapters.get(chapter.blockKey)?.remove(); return; }
        let body = storyUi.chapters.get(chapter.blockKey);
        if (!body) { body = elementFrom(chapterEditorMarkup(chapter, refs)); storyUi.chapters.set(chapter.blockKey, body); }
        const host = card.querySelector('[data-simulator-chapter-host]'); if (body.parentNode !== host) host.append(body);
        if (!storyUi.stages.has(chapter.blockKey)) storyUi.stages.set(chapter.blockKey, chapter.stageBlocks[0]?.blockKey || '');
        if (!validStages.has(storyUi.stages.get(chapter.blockKey))) storyUi.stages.set(chapter.blockKey, '');
        const stageList = body.querySelector('[data-simulator-stage-list]');
        const stageCards = new Map([...stageList.children].map(node => [node.dataset.simulatorStageCard, node]));
        chapter.stageBlocks.forEach((stage, stageIndex) => {
          let stageCard = stageCards.get(stage.blockKey);
          if (!stageCard) stageCard = elementFrom(stageCardMarkup(stage, stageIndex));
          const open = stage.blockKey === storyUi.stages.get(chapter.blockKey);
          const button = stageCard.querySelector('[data-simulator-select-stage]'); button.setAttribute('aria-expanded', String(open));
          button.querySelector('small').textContent = `阶段 ${stageIndex + 1} · ${(stage.payload.events || []).length} 个事件`;
          button.querySelector('[data-simulator-stage-mode]').textContent = stage.payload.mode === 'loop' ? '可以重复多轮' : '只经历一次';
          button.querySelector('strong').textContent = stage.payload.title || '未命名阶段';
          if (stageList.children[stageIndex] !== stageCard) stageList.insertBefore(stageCard, stageList.children[stageIndex] || null);
          if (!open) { storyUi.bodies.get(stage.blockKey)?.remove(); return; }
          let stageBody = storyUi.bodies.get(stage.blockKey);
          if (!stageBody) { stageBody = elementFrom(stageEditorMarkup(stage, refs)); storyUi.bodies.set(stage.blockKey, stageBody); }
          const stageHost = stageCard.querySelector('[data-simulator-stage-host]'); if (stageBody.parentNode !== stageHost) stageHost.append(stageBody);
          ui.selectedStageId = stage.payload.stageId;
        });
        for (const [key, node] of stageCards) if (!validStages.has(key)) node.remove();
        ui.selectedChapterId = chapter.payload.chapterId;
      });
      for (const [key, node] of oldCards) if (!validChapters.has(key)) node.remove();
      syncStorySettings();
      refreshEditorChrome();
    }
    function syncStorySettings() {
      storyUi.node?.querySelectorAll('[data-simulator-settings]').forEach(button => {
        const key = button.dataset.simulatorSettings;
        const visible = key.startsWith('chapter:') ? storyUi.chapter === key : storyUi.stages.get(storyUi.chapter) === key;
        button.setAttribute('aria-expanded', String(visible && storyUi.settings.has(key)));
      });
      storyUi.node?.querySelectorAll('[data-simulator-settings-region]').forEach(region => { region.hidden = !storyUi.settings.has(region.dataset.simulatorSettingsRegion); });
    }
    function revealStorySettings(control) {
      const region = control?.closest?.('[data-simulator-settings-region]');
      if (region) { storyUi.settings.add(region.dataset.simulatorSettingsRegion); syncStorySettings(); }
    }
    function updateEventHeading(control) {
      const card = control?.closest?.('[data-simulator-event-id]'); const stage = stageForTarget(control);
      const index = stage?.payload?.events?.findIndex(event => event.eventId === card?.dataset.simulatorEventId) ?? -1;
      if (index < 0) return;
      const event = stage.payload.events[index];
      card.querySelector('[data-simulator-event-title]').textContent = `事件 ${index + 1} · ${event.title || '未命名事件'}`;
      card.querySelector('[data-simulator-event-badges]').innerHTML = eventBadgesMarkup(event);
    }
    function mountStory(panel) {
      if (!storyUi.node) {
        const all = chapters();
        storyUi.node = elementFrom(storyMarkup(all, ui.selectedChapterId, ui.selectedStageId, storyReferences(all), blockPayload('world', {})));
        const chapter = all.find(item => item.payload.chapterId === ui.selectedChapterId) || all[0];
        storyUi.chapter = chapter?.blockKey || '';
        storyUi.node.querySelectorAll('[data-simulator-chapter-body]').forEach(node => storyUi.chapters.set(node.dataset.simulatorChapterBlockKey, node));
        storyUi.node.querySelectorAll('[data-simulator-stage-body]').forEach(node => { storyUi.bodies.set(node.dataset.simulatorStageBlockKey, node); storyUi.stages.set(storyUi.chapter, node.dataset.simulatorStageBlockKey); });
      }
      if (storyUi.node.parentNode !== panel) panel.replaceChildren(storyUi.node);
      syncStory();
    }
    function reconcileStoryOpening() {
      const current = blockPayload('world', stateApi.createBlankCoreBlocks().world);
      const next = reconcileOpeningPosition(current, chapters());
      if (current.openingChapterId !== next.openingChapterId || current.openingStageId !== next.openingStageId) editor.setBlock('world', 'world', next);
    }
    function focusStoryField(blockKey, path = 'title') {
      const input = [...(storyUi.node?.querySelectorAll('[data-simulator-field]') || [])].find(node => node.dataset.block === blockKey && node.dataset.path === path);
      revealStorySettings(input);
      input?.scrollIntoView?.({ block: 'center', behavior: 'smooth' }); input?.focus?.({ preventScroll: true });
    }
    function refreshEditorChrome() {
      updateSaveStatus();
      const head = root.querySelector('.shex-sim-head'); const snap = snapshot();
      const title = head?.querySelector('h2'); if (title) title.textContent = blockPayload('overview', {}).title || '未命名世界';
      const version = head?.querySelector('p'); if (version) version.textContent = `${ui.draftStatus === 'published' ? '已发布' : ui.draftStatus === 'unpublished' ? '已下架' : '草稿'} · 第${Number(snap.revision || 1)}版`;
      const actions = root.querySelector('.shex-sim-toolbar-actions');
      const attribute = ui.draftStatus === 'published' ? 'data-simulator-unpublish' : ui.draftStatus === 'draft' ? 'data-simulator-delete-draft' : '';
      const management = actions?.querySelector('[data-simulator-unpublish],[data-simulator-delete-draft]');
      if (management && (!attribute || !management.hasAttribute(attribute))) management.remove();
      if (actions && attribute && !actions.querySelector(`[${attribute}]`)) {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'danger'; button.setAttribute(attribute, '');
        button.textContent = ui.draftStatus === 'published' ? '下架模拟器' : '删除草稿'; actions.append(button);
      }
      const unpublish = actions?.querySelector('[data-simulator-unpublish]'); if (unpublish) unpublish.disabled = !!(ui.busy || snap.dirtyBlockKeys.length);
      let error = root.querySelector('.shex-sim-global-error');
      if (!ui.error) error?.remove();
      else { if (!error) { error = document.createElement('p'); error.className = 'shex-sim-global-error'; root.querySelector('[data-simulator-step-panel]')?.before(error); } error.textContent = ui.error; }
    }
    function refreshStoryTarget(target) {
      const key = stageForTarget(target)?.blockKey || target.dataset.blockKey;
      const eventCard = target.closest('[data-simulator-event-id]');
      const index = eventCard ? editor.getBlock(key)?.payload?.events?.findIndex(item => item.eventId === eventCard.dataset.simulatorEventId) : -1;
      const paths = target.dataset.conditionPath ? [target.dataset.conditionPath] : target.dataset.simulatorAddBlockCondition ? [target.dataset.simulatorAddBlockCondition] : [];
      if (index >= 0) {
        if (target.matches('[data-simulator-add-event-condition],[data-simulator-remove-condition]')) paths.push(`events.${index}.conditions`);
        if (target.matches('[data-simulator-add-event-effect],[data-simulator-remove-effect],[data-simulator-add-effect-axis],[data-simulator-remove-effect-axis]')) paths.push(`events.${index}.effects`);
      }
      refreshStoryForm(key, paths); syncStory();
    }
    function onCompositionStart(event) { storyUi.composing = true; storyUi.compositionInput = event.target; clearTimeout(storyUi.compositionTimer); }
    function onCompositionEnd() {
      const generation = ui.generation;
      storyUi.compositionTimer = setTimeout(() => {
        if (generation !== ui.generation) return;
        const input = storyUi.compositionInput; storyUi.compositionInput = null; storyUi.composing = false;
        if (input?.isConnected) onInput({ type: 'input', target: input });
        for (const key of storyUi.refreshAfterComposition) refreshStoryForm(key);
        storyUi.refreshAfterComposition.clear();
        syncStory();
        const pending = storyUi.pending; storyUi.pending = null; pending?.();
      }, 0);
    }

    function statusText() {
      const snap = snapshot();
      if (ui.busy === 'save') return '正在保存…';
      if (snap.dirtyBlockKeys.length) return `${snap.dirtyBlockKeys.length} 个内容块未保存`;
      return snap.draftId ? '草稿已保存' : '';
    }
    function renderLanding() {
      root.innerHTML = `<section class="shex-sim-workbench" data-simulator-workbench><header class="shex-sim-head is-compact"><button type="button" class="shex-sim-back" data-simulator-close aria-label="返回我的作品">‹</button><div><h2>创建世界</h2><p>正在准备世界草稿…</p></div></header>
        <p class="shex-sim-empty">${ui.loading ? '正在读取世界草稿…' : ui.busy === 'create' ? '正在创建空白世界…' : '准备世界编辑器…'}</p>
        ${ui.error ? `<p class="shex-sim-global-error">${esc(ui.error)}</p>` : ''}</section>`;
    }
    function renderEditor() {
      if (ui.step === 'story' && storyUi.node?.isConnected) { syncStory(); return; }
      storyUi.node?.remove();
      normalizeSelection();
      const defaults = stateApi.createBlankCoreBlocks();
      const chapterBlocks = chapters();
      const currentWorld = blockPayload('world', defaults.world);
      const reconciledWorld = reconcileOpeningPosition(currentWorld, chapterBlocks);
      if (String(currentWorld.openingChapterId || '') !== String(reconciledWorld.openingChapterId || '')
        || String(currentWorld.openingStageId || '') !== String(reconciledWorld.openingStageId || '')) {
        editor.setBlock('world', 'world', reconciledWorld);
      }
      const snap = snapshot();
      const world = blockPayload('world', defaults.world);
      const roster = blockPayload('roster', defaults.roster);
      const state = blockPayload('state', defaults.state);
      const references = createReferenceCatalog(chapterBlocks, world, roster, state);
      const body = ui.step === 'overview' ? overviewMarkup(blockPayload('overview', defaults.overview), ui)
        : ui.step === 'world' ? worldMarkup(world, roster, ui.picker, references, ui)
          : ui.step === 'state' ? stateMarkup(state, references)
            : ui.step === 'story' ? ''
              : ui.step === 'director' ? directorMarkup(blockPayload('director', defaults.director), blockPayload('world', defaults.world).runtimeProfile)
                : publishMarkup(snap, ui.publication, blockPayload('overview', defaults.overview));
      root.innerHTML = `<section class="shex-sim-workbench" data-simulator-workbench data-simulator-editor data-simulator-draft-id="${esc(snap.draftId)}"><header class="shex-sim-head is-compact"><button type="button" class="shex-sim-back" data-simulator-library aria-label="返回我的作品">‹</button><div><h2>${esc(blockPayload('overview', defaults.overview).title || '未命名世界')}</h2><p>${ui.draftStatus === 'published' ? '已发布' : ui.draftStatus === 'unpublished' ? '已下架' : '草稿'} · 第${Number(snap.revision || 1)}版</p></div></header>
        <nav class="shex-sim-steps" aria-label="世界编辑步骤">${STEPS.map(([key, label]) => `<button type="button" data-simulator-step="${key}" class="${ui.step === key ? 'active' : ''}">${esc(label)}</button>`).join('')}</nav>
        <div class="shex-sim-toolbar"><span data-simulator-save-status>${esc(statusText())}</span><div class="shex-sim-toolbar-actions"><button type="button" class="primary" data-simulator-save ${!snap.dirtyBlockKeys.length || snap.saving ? 'disabled' : ''}>保存</button><button type="button" data-simulator-reimport ${ui.busy || snap.saving ? 'disabled' : ''}>再次导入</button>${ui.draftStatus === 'published' ? `<button type="button" class="danger" data-simulator-unpublish ${ui.busy || snap.dirtyBlockKeys.length ? 'disabled' : ''}>下架模拟器</button>` : ui.draftStatus === 'draft' ? '<button type="button" class="danger" data-simulator-delete-draft>删除草稿</button>' : ''}</div></div>
        <div class="shex-sim-budget" data-simulator-world-budget hidden></div>
        ${ui.error ? `<p class="shex-sim-global-error">${esc(ui.error)}</p>` : ''}
        <main class="shex-sim-step-panel" data-simulator-step-panel>${body}</main>
      </section>`;
      if (ui.step === 'story') mountStory(root.querySelector('[data-simulator-step-panel]'));
      scheduleBudgetRefresh();
      syncStickyOffsets();
      void hydrateMediaPreviews();
      if (ui.step === 'overview') void hydrateTaxonomy();
    }

    function syncStickyOffsets() {
      const workbench = root.querySelector?.('[data-simulator-workbench]');
      const head = workbench?.querySelector?.('.shex-sim-head.is-compact');
      if (!workbench || !head) return;
      stickyHeadObserver?.disconnect?.();
      stickyHeadObserver = null;
      const sync = () => {
        if (!head.isConnected) return;
        workbench.style.setProperty('--sim-sticky-head-height', `${Math.ceil(head.getBoundingClientRect().height)}px`);
      };
      sync();
      globalThis.requestAnimationFrame?.(sync);
      if (typeof globalThis.ResizeObserver === 'function') {
        stickyHeadObserver = new globalThis.ResizeObserver(sync);
        stickyHeadObserver.observe(head);
      }
    }

    function focusPublicationTarget(target) {
      const control = target === 'worldPromo'
        ? root.querySelector?.('[data-simulator-media-card="worldPromo"] .shex-sim-media-actions label')
        : root.querySelector?.(`[data-simulator-field="${target}"]`);
      const anchor = target === 'worldPromo' ? root.querySelector?.('[data-simulator-media-card="worldPromo"]') : control;
      anchor?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
      if (control && !control.hasAttribute('tabindex') && typeof control.focus === 'function') control.setAttribute('tabindex', '-1');
      control?.focus?.({ preventScroll: true });
    }

    function focusStoryIssueTarget(target, details = {}) {
      const selector = target === 'story:add-chapter' ? '[data-simulator-add-chapter]'
        : target === 'story:add-stage' ? '[data-simulator-add-stage]'
          : target === 'story:event' && Number.isInteger(details.eventIndex)
            ? `[data-simulator-field="stage:${details.chapterId}:${details.stageId}.events.${details.eventIndex}.title"]`
            : details.chapterId && details.stageId
              ? `[data-simulator-field="stage:${details.chapterId}:${details.stageId}.title"]`
              : '[data-simulator-add-chapter]';
      const control = root.querySelector?.(selector);
      revealStorySettings(control);
      control?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
      if (control && !control.hasAttribute('tabindex') && typeof control.focus === 'function') control.setAttribute('tabindex', '-1');
      control?.focus?.({ preventScroll: true });
    }

    function renderTaxonomyDom() {
      const host = root.querySelector?.('[data-simulator-taxonomy]');
      if (!host) return;
      const activeElement = globalThis.document?.activeElement;
      const activeSelector = activeElement?.matches?.('[data-simulator-tag-search]') ? '[data-simulator-tag-search]'
        : activeElement?.matches?.('[data-simulator-tag-create-name]') ? '[data-simulator-tag-create-name]' : '';
      const selectionStart = activeSelector ? activeElement.selectionStart : null;
      const selectionEnd = activeSelector ? activeElement.selectionEnd : null;
      host.innerHTML = taxonomyBodyMarkup(blockPayload('overview', stateApi.createBlankCoreBlocks().overview), ui.taxonomy);
      if (activeSelector) {
        const nextControl = host.querySelector?.(activeSelector);
        nextControl?.focus?.();
        if (Number.isInteger(selectionStart) && Number.isInteger(selectionEnd)) nextControl?.setSelectionRange?.(selectionStart, selectionEnd);
      }
    }
    async function loadTagPages(query, generation) {
      if (!tagStore || typeof tagStore.list !== 'function') return { tags: ui.taxonomy.tags, complete: true };
      let cursor = '';
      let result = null;
      let tags = [];
      let pageCount = 0;
      let complete = false;
      const seenCursors = new Set();
      while (pageCount < TAG_PAGE_REQUEST_LIMIT) {
        result = await tagStore.list({ query, cursor, limit: 100 });
        if (generation !== ui.taxonomy.generation || result?.stale) return null;
        pageCount += 1;
        tags = mergeTaxonomyTags(tags, result?.tags || []);
        const nextCursor = String(result?.nextCursor || '').trim();
        if (result?.hasMore !== true || !nextCursor) { complete = true; break; }
        if (seenCursors.has(nextCursor)) break;
        seenCursors.add(nextCursor);
        cursor = nextCursor;
      }
      return { tags, complete };
    }
    async function hydrateTaxonomy() {
      if (ui.taxonomy.loading) return;
      const generation = ++ui.taxonomy.generation;
      ui.taxonomy.loading = true; ui.taxonomy.error = '';
      renderTaxonomyDom();
      try {
        const selectedIds = blockPayload('overview', stateApi.createBlankCoreBlocks().overview).tagIds || [];
        const [categoryResult, tagPage, selectedTags] = await Promise.all([
          typeof categoryStore?.refresh === 'function' ? categoryStore.refresh() : Promise.resolve(categoryStore?.current?.() || {}),
          ui.taxonomy.hydrated ? Promise.resolve({ tags: ui.taxonomy.tags, complete: ui.taxonomy.catalogComplete }) : loadTagPages('', generation),
          typeof tagStore?.resolve === 'function' ? Promise.resolve(tagStore.resolve(selectedIds)).catch(() => []) : Promise.resolve([]),
        ]);
        if (generation !== ui.taxonomy.generation) return;
        ui.taxonomy.categories = Array.isArray(categoryResult?.categories) ? categoryResult.categories : ui.taxonomy.categories;
        if (tagPage) applyTaxonomyCatalogPage(ui.taxonomy, tagPage);
        ui.taxonomy.knownTags = mergeTaxonomyTags(ui.taxonomy.knownTags, selectedTags || []);
        ui.taxonomy.hydrated = true;
      } catch (error) {
        if (generation === ui.taxonomy.generation) ui.taxonomy.error = error?.message || '公共分类与标签读取失败，请稍后重试';
      } finally {
        if (generation === ui.taxonomy.generation) { ui.taxonomy.loading = false; renderTaxonomyDom(); }
      }
    }
    async function searchTags(query) {
      const generation = ++ui.taxonomy.generation;
      ui.taxonomy.query = String(query || '').trim();
      ui.taxonomy.loading = true; ui.taxonomy.error = '';
      try {
        const tagPage = await loadTagPages(ui.taxonomy.query, generation);
        if (generation !== ui.taxonomy.generation || !tagPage) return;
        ui.taxonomy.tags = tagPage.tags;
        ui.taxonomy.knownTags = mergeTaxonomyTags(ui.taxonomy.knownTags, tagPage.tags);
        ui.taxonomy.notice = tagPage.complete ? '' : '搜索结果较多，请输入更完整的名称';
      } catch (error) {
        if (generation === ui.taxonomy.generation) ui.taxonomy.error = error?.message || '标签搜索失败，请稍后重试';
      } finally {
        if (generation === ui.taxonomy.generation) { ui.taxonomy.loading = false; renderTaxonomyDom(); }
      }
    }

    async function hydrateMediaPreviews() {
      if (!['overview', 'world'].includes(ui.step) || typeof options.resolveMedia !== 'function') return;
      const overview = blockPayload('overview', stateApi.createBlankCoreBlocks().overview);
      const roster = blockPayload('roster', stateApi.createBlankCoreBlocks().roster);
      const refs = ui.step === 'overview'
        ? [mediaFileId(overview.coverAssetRef), mediaFileId(overview.appearanceRef?.worldBackgroundAssetRef)].filter(Boolean)
        : (roster.characters || []).flatMap(role => {
          const metadata = role?.characterSnapshot?.templateMetadata || {};
          return [mediaFileId(metadata.avatarAssetId || role?.appearanceRef?.avatarAssetId), mediaFileId(metadata.backgroundAssetId || role?.appearanceRef?.backgroundAssetId)].filter(Boolean);
        });
      const worldRefs = ui.step === 'world' && typeof options.resolveWorldRoleAvatarMedia === 'function'
        ? (roster.characters || []).map(role => mediaFileId(role?.appearanceRef?.worldAvatarAssetRef)).filter(Boolean) : [];
      const missing = [...new Set(refs)].filter(fileId => !ui.mediaUrls[fileId] && !ui.mediaPending.has(fileId));
      const missingWorld = [...new Set(worldRefs)].filter(fileId => !ui.mediaUrls[fileId] && !ui.mediaPending.has(fileId));
      if (!missing.length && !missingWorld.length) return;
      [...missing, ...missingWorld].forEach(fileId => ui.mediaPending.add(fileId));
      try {
        const batches = [];
        for (let index = 0; index < missing.length; index += 2) batches.push(missing.slice(index, index + 2));
        const worldBatches = [];
        for (let index = 0; index < missingWorld.length; index += 40) worldBatches.push(missingWorld.slice(index, index + 40));
        const resolvedPages = await Promise.all([
          ...batches.map(batch => options.resolveMedia(batch)),
          ...worldBatches.map(batch => options.resolveWorldRoleAvatarMedia(batch)),
        ]);
        Object.assign(ui.mediaUrls, ...resolvedPages.map(page => page || {}));
        if (ui.step === 'overview') {
          root.querySelectorAll('[data-simulator-media-card]').forEach((card) => {
            const kind = card.dataset.simulatorMediaCard;
            const current = kind === 'worldPromo' ? mediaFileId(overview.coverAssetRef) : mediaFileId(overview.appearanceRef?.worldBackgroundAssetRef);
            const url = ui.mediaUrls[current];
            const preview = card.querySelector('.shex-sim-media-preview');
            if (url && preview) preview.innerHTML = `<img src="${esc(url)}" alt="${kind === 'worldPromo' ? '宣传主题图' : '世界背景'}预览">`;
          });
        } else {
          root.querySelectorAll('[data-simulator-role-media-ref]').forEach((card) => {
            const fileId = String(card.dataset.simulatorRoleMediaRef || '');
            const label = String(card.dataset.simulatorRoleMediaLabel || '图片');
            const url = ui.mediaUrls[fileId];
            if (url) card.innerHTML = `<span>${esc(label)}</span><img src="${esc(url)}" alt="角色${esc(label)}">`;
          });
          root.querySelectorAll('[data-simulator-role-avatar-ref]').forEach((preview) => {
            const fileId = String(preview.dataset.simulatorRoleAvatarRef || '');
            const url = ui.mediaUrls[fileId];
            if (!url) return;
            preview.innerHTML = `<img src="${esc(url)}" alt="角色头像">`;
            const card = preview.closest('.shex-sim-role-avatar');
            const state = card?.querySelector('.shex-sim-role-avatar-body>small');
            if (state && card.dataset.simulatorRoleAvatarSource === 'world') state.textContent = '世界内头像';
          });
        }
      } catch (_) {}
      finally { [...missing, ...missingWorld].forEach(fileId => ui.mediaPending.delete(fileId)); }
    }

    async function uploadWorldMedia(kind, file) {
      if (!file || ui.busy) return;
      const upload = kind === 'worldPromo' ? options.uploadWorldPromo : options.uploadWorldBackground;
      if (typeof upload !== 'function') { notify('图片上传服务暂时不可用'); return; }
      ui.busy = `media:${kind}`; notify('正在上传图片…');
      try {
        const localUrl = URL?.createObjectURL?.(file) || '';
        const continuation = await uploadAndPersistWorldMedia({
          kind,
          file,
          upload,
          editor,
          client,
          logMediaStage: options.logMediaStage,
          createSaveTrace,
        });
        const fileId = continuation.fileId;
        if (localUrl) ui.mediaUrls[fileId] = localUrl;
        ui.publication = null; ui.notice = '';
        options.onDraftUpdated?.({ ...snapshot(), title: String(blockPayload('overview', stateApi.createBlankCoreBlocks().overview).title || ''), status: ui.draftStatus, updatedAt: Date.now() });
        notify('图片已上传并保存');
      } catch (error) { notify(error?.message || '图片上传失败，请稍后重试'); }
      finally { ui.busy = ''; render(); }
    }
    async function uploadWorldRoleAvatar(roleId, file) {
      if (!file || ui.busy) return;
      if (typeof options.uploadWorldRoleAvatar !== 'function') { notify('头像上传服务暂时不可用'); return; }
      ui.busy = 'media:worldRoleAvatar'; notify('正在上传头像…');
      try {
        const result = await options.uploadWorldRoleAvatar(file);
        const fileId = mediaFileId(result);
        if (!fileId) throw new Error('头像上传失败');
        const roster = clone(blockPayload('roster', stateApi.createBlankCoreBlocks().roster));
        const role = (roster.characters || []).find(item => String(item?.roleId || '') === roleId);
        if (!role) throw new Error('角色已变化，请重新打开后再试');
        Object.assign(role, independentWorldRole(role));
        delete role.characterSnapshot; delete role.characterVersionRef;
        role.appearanceRef = { ...(role.appearanceRef || {}), worldAvatarAssetRef: { fileId, mediaKind: 'worldRoleAvatar' } };
        editor.setBlock('roster', 'roster', roster);
        const intent = editor.beginSave({ onlyBlockKeys: ['roster'] });
        if (!intent) throw new Error('头像未能保存到世界草稿');
        try {
          const saved = await client.saveDraftBlocks(intent.request);
          if (!editor.acknowledgeSave(intent.token, saved)) throw new Error('头像草稿保存回执无效');
        } catch (error) { editor.failSave(intent.token); throw error; }
        const localUrl = URL?.createObjectURL?.(file) || '';
        if (localUrl) ui.mediaUrls[fileId] = localUrl;
        ui.publication = null; ui.notice = '';
        options.onDraftUpdated?.({ ...snapshot(), title: String(blockPayload('overview', stateApi.createBlankCoreBlocks().overview).title || ''), status: ui.draftStatus, updatedAt: Date.now() });
        notify('世界内头像已上传并保存');
      } catch (error) { notify(error?.message || '头像上传失败，请稍后重试'); }
      finally { ui.busy = ''; render(); }
    }
    function render() { if (!allowed()) { root.innerHTML = ''; return; } snapshot().draftId ? renderEditor() : renderLanding(); }
    // X103：世界侧用量与章节剧情目录用量。和发布检查用同一份计算逻辑，草稿阶段实时显示，不必等到发布才发现超限。
    let budgetRefreshTimer = null;
    function draftTemplateForBudget() {
      const defaults = stateApi.createBlankCoreBlocks();
      return {
        overview: blockPayload('overview', defaults.overview), world: blockPayload('world', defaults.world),
        roster: blockPayload('roster', defaults.roster), state: blockPayload('state', defaults.state),
        director: blockPayload('director', defaults.director),
        chapters: chapters().map(block => ({ ...(block.payload || {}), stages: (block.stageBlocks || []).map(stage => stage.payload || {}) })),
      };
    }
    function refreshBudgetMeters() {
      // 只读展示：这里的任何异常都不能影响编辑、保存和发布。
      const api = globalThis.SHEXWorldInputBudget;
      if (!api?.measureWorldInput || typeof root?.querySelector !== 'function' || typeof root?.querySelectorAll !== 'function') return;
      let worldNode, chapterNodes, measured;
      try {
        worldNode = root.querySelector('[data-simulator-world-budget]');
        chapterNodes = Array.from(root.querySelectorAll('[data-simulator-chapter-directory]') || []);
        if (!worldNode && !chapterNodes.length) return;
        measured = api.measureWorldInput(draftTemplateForBudget());
      } catch (_) { return; }
      const count = value => Number(value || 0).toLocaleString('en-US');
      if (worldNode) {
        const unresolved = (measured.unresolvedCharacterRoleIds || []).length;
        worldNode.hidden = false;
        worldNode.classList.toggle('is-over', measured.exceedsLimit === true);
        worldNode.innerHTML = `<span>世界侧用量：<strong>${count(measured.worldInputChars)}</strong> / ${count(measured.maxWorldInputChars)}｜${measured.exceedsLimit ? '已超过上限，暂不能发布' : `当前档位 +${Number(measured.surchargeEnergy)} X能量`}</span>${helpButton('worldInput')}${unresolved ? `<small>有 ${unresolved} 个引用已有角色的资料未计入，最终以发布检查为准</small>` : ''}`;
      }
      chapterNodes.forEach(node => {
        const item = (measured.chapterDirectories || []).find(entry => String(entry.chapterId) === String(node.dataset.simulatorChapterDirectory || ''));
        node.hidden = !item;
        if (!item) return;
        node.classList.toggle('is-over', item.exceedsLimit === true);
        // 显示贴近真实游玩的占用；是否超限仍按发布检查的保守口径（假设进度记录最满）判断，两者不一致时把保守数字也写出来。
        const shown = Number.isFinite(Number(item.typicalChars)) ? item.typicalChars : item.chars;
        node.innerHTML = `<span>章节剧情目录：<strong>${count(shown)}</strong> / ${count(item.maxChars)}${item.exceedsLimit === true ? `｜按进度记录最满时估算为 ${count(item.chars)}，已超过上限` : ''}</span>${helpButton('chapterDirectory')}`;
      });
    }
    function scheduleBudgetRefresh() {
      if (budgetRefreshTimer) clearTimeout(budgetRefreshTimer);
      budgetRefreshTimer = setTimeout(() => { budgetRefreshTimer = null; try { refreshBudgetMeters(); } catch (_) {} }, 180);
      budgetRefreshTimer?.unref?.();
    }
    function updateSaveStatus() {
      scheduleBudgetRefresh();
      const node = root.querySelector('[data-simulator-save-status]');
      if (node) node.textContent = statusText();
      const button = root.querySelector('[data-simulator-save]');
      if (button) button.disabled = !snapshot().dirtyBlockKeys.length || snapshot().saving;
    }

    async function loadDraft(draftId) {
      assertAllowed();
      const requestedDraftId = String(draftId || '').trim();
      if (!requestedDraftId) throw new Error('草稿编号缺失，请从“我的作品”重新打开');
      const generation = ++ui.generation;
      resetStoryUi();
      resetRolePicker();
      ui.loading = true; ui.error = ''; ui.notice = ''; ui.publication = null; editor.load({}); renderLanding();
      try {
        const draft = await client.getDraft({ draftId: requestedDraftId });
        if (generation !== ui.generation) return;
        if (!allowed()) return;
        const returnedDraftId = String(draft?.draftId || '').trim();
        if (!returnedDraftId || returnedDraftId !== requestedDraftId) throw new Error('世界草稿返回的编号不一致，请返回“我的作品”重新打开');
        editor.load(draft); ui.draftStatus = ['published', 'unpublished'].includes(draft.status) ? draft.status : 'draft'; ui.step = 'overview'; ui.selectedChapterId = ''; ui.selectedStageId = '';
        const returnedHeads = new Map((draft.blockHeads || []).map(head => [String(head?.blockKey || ''), head]));
        snapshot().blocks.forEach((block) => {
          const head = returnedHeads.get(String(block.blockKey || '')) || {};
          recordSaveTrace({
            phase: 'get_draft_state_loaded',
            draftId: returnedDraftId,
            blockKey: String(block.blockKey || ''),
            fieldKey: '',
            requestId: '',
            stateSource: 'getDraft.result → simulator-creator-state.load',
            localRevision: integerOrNull(block.revision),
            requestBaseRevision: null,
            backendReturnedRevision: integerOrNull(head.revision),
            backendCurrentRevision: integerOrNull(head.revision),
            contentHash: String(head.contentHash || block.contentHash || ''),
          });
        });
        normalizeEditableCandidatePolicy();
        options.onDraftReady?.({ draftId: returnedDraftId, source: 'load', draft: { ...snapshot(), title: String(draft.title || ''), status: ui.draftStatus, updatedAt: Number(draft.updatedAt || 0) } });
      } catch (error) { if (generation === ui.generation) ui.error = error?.message || '世界草稿读取失败'; }
      finally { if (generation === ui.generation) { ui.loading = false; render(); } }
    }
    async function createBlank() {
      if (ui.busy) return;
      assertAllowed(); const generation = ++ui.generation; resetStoryUi(); ui.busy = 'create'; ui.error = '';
      renderLanding();
      try {
        const created = await client.createDraft({ requestId: String(createRequestId('simulator_draft_create')).slice(0, 120) });
        if (generation !== ui.generation) return;
        const createdDraftId = String(created?.draftId || '').trim();
        if (!createdDraftId) throw new Error('后端没有返回有效草稿编号，未进入编辑器');
        editor.load({ ...created, blocks: [] }, { withBlankCore: true });
        ui.draftStatus = 'draft';
        options.onDraftReady?.({ draftId: createdDraftId, source: 'create', draft: { ...snapshot(), title: String(created.title || ''), status: 'draft', updatedAt: Number(created.updatedAt || Date.now()) } });
        ui.step = 'overview'; notify('世界草稿已创建'); render();
      } catch (error) { if (generation === ui.generation) { ui.error = error?.message || '空白世界创建失败'; render(); } }
      finally { if (generation === ui.generation) { ui.busy = ''; updateSaveStatus(); } }
    }
    async function save() {
      if (ui.busy) return;
      assertAllowed();
      normalizeEditableCandidatePolicy();
      const intent = editor.beginSave();
      if (!intent) return;
      const saveTraces = intent.request.patches.map(patch => createSaveTrace(patch.blockKey));
      saveTraces.forEach(trace => { trace.before(intent.request); trace.request(intent.request); });
      const generation = ui.generation;
      ui.busy = 'save'; ui.error = ''; ui.notice = ''; updateSaveStatus();
      try {
        const result = await client.saveDraftBlocks(intent.request);
        if (generation !== ui.generation) return;
        saveTraces.forEach(trace => trace.response(intent.request, result));
        editor.acknowledgeSave(intent.token, result);
        saveTraces.forEach(trace => trace.applied(intent.request, result));
        notify(result.noChange ? '内容没有变化' : '已保存');
        options.onDraftUpdated?.({ ...snapshot(), title: String(blockPayload('overview', stateApi.createBlankCoreBlocks().overview).title || ''), status: ui.draftStatus, updatedAt: Date.now() });
      } catch (error) {
        if (generation !== ui.generation) return;
        saveTraces.forEach(trace => trace.failure(intent.request, error));
        editor.failSave(intent.token); notify(error?.message || '保存失败，请稍后重试');
      } finally { if (generation === ui.generation) { ui.busy = ''; render(); } }
    }
    async function checkPublication() {
      if (ui.busy || snapshot().dirtyBlockKeys.length) return;
      assertAllowed(); ui.busy = 'check'; ui.error = ''; render();
      const generation = ui.generation;
      try {
        const result = await client.checkPublication({ draftId: snapshot().draftId, draftRevision: snapshot().revision });
        if (generation !== ui.generation) return;
        editor.setPublicationCheck(result); if (!result.publishable) notify('请先处理发布校验问题');
        return result;
      } catch (error) {
        if (generation === ui.generation) {
          options.logPublicationError?.({ phase: 'check', error });
          notify(publicationFailureMessage('check', error));
        }
        return null;
      }
      finally { if (generation === ui.generation) { ui.busy = ''; render(); } }
    }
    async function publish() {
      const snap = snapshot();
      if (ui.busy || snap.dirtyBlockKeys.length || !snap.publicationCheck?.publishable || snap.publicationCheck.checkedDraftRevision !== snap.revision) return;
      assertAllowed(); ui.busy = 'publish'; ui.error = ''; render();
      const generation = ui.generation;
      let phase = 'beautify_prepare';
      let requestId = '';
      try {
        requestId=String(createRequestId('simulator_publish')).slice(0,120);
        const beautifyRef=await globalThis?.SHEXBeautify?.editor?.creatorWorkBeautify?.publicationRefFor?.({workType:'world',draftId:snap.draftId,title:snap.blocks?.overview?.title||'未命名世界',raw:{publicationReference:ui.publication||null}},{publicationRequestId:`${requestId}-beautify`})||null;
        phase = 'world_publish';
        ui.publication = await client.publishSimulator({ draftId: snap.draftId, draftRevision: snap.revision, requestId, ...(beautifyRef?{beautifyRef}:{}) });
        ui.draftStatus = 'published';
        notify('发布成功');
      } catch (error) {
        if (generation === ui.generation) {
          options.logPublicationError?.(publicationErrorEntry(error, phase, requestId));
          notify(phase === 'beautify_prepare' ? beautifyPublicationFailureMessage(error) : publicationFailureMessage('publish', error));
        }
      }
      finally { if (generation === ui.generation) { ui.busy = ''; render(); } }
    }
    async function checkAndPublish() {
      if (snapshot().dirtyBlockKeys.length) { notify('请先保存改动'); return; }
      const result = await checkPublication();
      if (result?.publishable) await publish();
    }
    async function unpublish() {
      const snap = snapshot();
      if (ui.busy || ui.draftStatus !== 'published' || snap.dirtyBlockKeys.length) return;
      assertAllowed();
      if (!globalThis.confirm?.('确认下架这个模拟器吗？下架后新用户不能新建世界，已有世界和存档仍可继续使用。')) return;
      const generation = ui.generation;
      ui.busy = 'unpublish'; ui.error = ''; render();
      try {
        const result = await client.unpublishSimulator({ draftId: snap.draftId, draftRevision: snap.revision });
        if (generation !== ui.generation) return;
        editor.acknowledgeLifecycle(result);
        ui.draftStatus = 'unpublished'; ui.publication = null;
        options.onDraftUpdated?.({ ...snapshot(), title: String(blockPayload('overview', stateApi.createBlankCoreBlocks().overview).title || ''), status: ui.draftStatus, updatedAt: Date.now() });
        notify('模拟器已下架，已有世界和存档可继续使用');
      } catch (error) { if (generation === ui.generation) notify(error?.message || '下架失败，请稍后重试'); }
      finally { if (generation === ui.generation) { ui.busy = ''; render(); } }
    }
    function resetRolePicker(optionsValue = {}) {
      ui.picker.generation += 1;
      ui.picker.open = optionsValue.open === true;
      ui.picker.query = '';
      ui.picker.cursor = '';
      ui.picker.hasMore = false;
      ui.picker.items = [];
      ui.picker.selectedDraftIds = [];
      ui.picker.selectedItems = new Map();
      ui.picker.replaceRoleId = String(optionsValue.replaceRoleId || '').trim();
      ui.picker.loading = false;
      ui.picker.error = '';
    }
    function refreshRolePickerSelectionDom() {
      const host = root.querySelector?.('[data-simulator-role-picker]');
      if (!host) return;
      const selected = new Set(ui.picker.selectedDraftIds || []);
      host.querySelectorAll?.('[data-simulator-role-selection]')?.forEach(control => {
        const draftId = String(control.value || '');
        const label = control.closest?.('[data-character-draft-id]');
        const status = label?.querySelector?.('small');
        label?.classList?.toggle('is-selected', selected.has(draftId));
        if (!control.disabled && status) status.textContent = selected.has(draftId) ? '已选择' : String(control.dataset.updatedLabel || '可选择');
      });
      const confirm = host.querySelector?.('[data-simulator-role-picker-confirm]');
      const replacing = Boolean(ui.picker.replaceRoleId);
      const count = replacing ? Math.min(1, selected.size) : selected.size;
      if (confirm) {
        confirm.disabled = count < 1;
        confirm.textContent = replacing ? '确认替换来源' : `加入 ${count} 个角色`;
      }
    }
    async function searchRoles({ append = false } = {}) {
      if (ui.picker.loading || typeof client.listCharacterDrafts !== 'function') return;
      assertAllowed(); const generation = ++ui.picker.generation;
      if (!append) { ui.picker.cursor = ''; ui.picker.hasMore = false; }
      ui.picker.loading = true; ui.picker.error = ''; render();
      try {
        const result = await client.listCharacterDrafts({ query: ui.picker.query, limit: 20, cursor: append ? ui.picker.cursor : '' });
        if (generation !== ui.picker.generation) return;
        ui.picker.items = uniqueCharacterDraftItems(append ? [...ui.picker.items, ...(result.items || [])] : (result.items || []));
        ui.picker.cursor = String(result.nextCursor || ''); ui.picker.hasMore = result.hasMore === true || Boolean(result.nextCursor);
      } catch (error) { if (generation === ui.picker.generation) ui.picker.error = error?.message || '角色草稿查找失败'; }
      finally { if (generation === ui.picker.generation) { ui.picker.loading = false; render(); } }
    }
    function generatedId(prefix, existing) { return stateApi.createSafeEntityId(prefix, new Set(existing), () => createEntityId(prefix)); }
    function firstVariable() { return blockPayload('state', stateApi.createBlankCoreBlocks().state).variables?.find(item => item?.key); }
    function firstRole() { return blockPayload('roster', stateApi.createBlankCoreBlocks().roster).characters?.find(item => item?.roleId); }
    function firstEvent() { return chapters().flatMap(chapter => chapter.stageBlocks).flatMap(stage => stage.payload.events || []).find(item => item?.eventId); }
    function defaultCondition(type = 'variableCompare', targetStage = null) {
      if (type === 'variableCompare') {
        const variable = firstVariable();
        return variable ? { type, path: `variables.${variable.key}`, op: '==', value: clone(variable.initialValue) } : null;
      }
      if (type === 'relationshipCompare') {
        const role = firstRole();
        return role ? { type, edge: `user>${role.roleId}`, axis: 'affinity', op: '==', value: 0 } : null;
      }
      if (type === 'eventState') {
        const event = firstEvent();
        return event ? { type, eventId: event.eventId, op: '==', value: 'completed' } : null;
      }
      const stage = targetStage || chapters().flatMap(chapter => chapter.stageBlocks)[0];
      return stage ? { type: 'stageComplete', stageId: stage.payload.stageId } : null;
    }
    function updateBlock(key, path, value, remove = false) {
      const block = key === '__stage__' ? currentStageBlock() : editor.getBlock(key);
      if (!block) return;
      lastFieldKeyByBlock.set(block.blockKey, `${block.blockKey}.${String(path || '')}`);
      editor.setBlock(block.blockKey, block.blockType, setAt(block.payload, path, value, remove));
      ui.publication = null; ui.notice = ''; updateSaveStatus();
    }
    function normalizeEditableCandidatePolicy() {
      const kinds = editor.getBlock('director')?.payload?.candidatePolicy?.allowedKinds;
      if (!Array.isArray(kinds)) return;
      const runtimeProfile = editor.getBlock('world')?.payload?.runtimeProfile;
      const supported = editableCandidateKinds(kinds, runtimeProfile);
      if (supported.length === kinds.length && supported.every((kind, index) => kind === kinds[index])) return;
      updateBlock('director', 'candidatePolicy.allowedKinds', supported.length ? supported : [...editableKindsForProfile(runtimeProfile)]);
    }
    function refreshDependentValueControl(control, blockKey, path) {
      let valuePath = '';
      if (/^items\.\d+\.simpleEffect\.targetKey$/.test(path)) valuePath = path.replace(/targetKey$/, 'value');
      else if (/(?:\.conditions|entryCondition|completionCondition)(?:\.clauses\.\d+)?\.path$/.test(path)) valuePath = path.replace(/\.path$/, '.value');
      else if (/\.effects\.\d+\.key$/.test(path)) valuePath = path.replace(/\.key$/, '.value');
      if (!valuePath) return;
      const container = control.closest?.('.shex-sim-subcard, .shex-sim-condition, .shex-sim-effect');
      const valueControl = container?.querySelector?.(`[data-block="${blockKey}"][data-path="${valuePath}"]`);
      if (!valueControl) return;
      const targetBlock = blockKey === '__stage__' ? currentStageBlock() : editor.getBlock(blockKey);
      const variable = variableByReference(blockPayload('state', stateApi.createBlankCoreBlocks().state).variables || [], control.value);
      valueControl.closest('label').outerHTML = typedValueField(
        valueControl.closest('label')?.querySelector('span')?.textContent || '值',
        blockKey, valuePath, getAt(targetBlock?.payload, valuePath), variable,
      );
    }
    function refreshVariableInitialValueControl(control, path) {
      const match = /^variables\.(\d+)\.enumValues$/.exec(path);
      if (!match) return;
      const index = Number(match[1]);
      const variable = editor.getBlock('state')?.payload?.variables?.[index];
      const card = control.closest?.('.shex-sim-subcard');
      const valueControl = card?.querySelector?.(`[data-block="state"][data-path="variables.${index}.initialValue"]`);
      const label = valueControl?.closest?.('label');
      if (label && variable) label.outerHTML = typedValueField('初始值', 'state', `variables.${index}.initialValue`, variable.initialValue, variable);
    }
    function addToBlock(blockKey, path, item) {
      const block = editor.getBlock(blockKey); if (!block) return;
      const parts = pathParts(path); let list = block.payload;
      for (const part of parts) list = list?.[part];
      updateBlock(blockKey, path, [...(Array.isArray(list) ? list : []), item]); render();
    }
    function removeFromBlock(blockKey, path, index) {
      const block = editor.getBlock(blockKey); if (!block) return;
      const parts = pathParts(path); let list = block.payload;
      for (const part of parts) list = list?.[part];
      if (!Array.isArray(list) || !list[index]) return;
      const next = list.slice(); next.splice(index, 1); updateBlock(blockKey, path, next); render();
    }
    function syncRelationSlider(control) {
      const axis = String(control?.dataset?.simulatorRelationSlider || '');
      if (!axis) return;
      const level = relationLevelLabel(axis, control.value);
      control.setAttribute('aria-valuetext', level);
      const output = control.closest?.('.shex-sim-relation-slider')?.querySelector?.(`[data-simulator-relation-level="${axis}"]`);
      if (output) output.textContent = level;
    }

    function onInput(event) {
      const roleAvatarInput = event.target.closest?.('[data-simulator-role-avatar-input]');
      if (roleAvatarInput) {
        if (event.type === 'change') void uploadWorldRoleAvatar(String(roleAvatarInput.dataset.simulatorRoleAvatarInput || ''),
          globalThis.SHEXImageCropper?.filesForInput?.(roleAvatarInput)?.[0] || roleAvatarInput.files?.[0]);
        return;
      }
      const mediaInput = event.target.closest?.('[data-simulator-media-input]');
      if (mediaInput) {
        if (event.type === 'change') void uploadWorldMedia(mediaInput.dataset.simulatorMediaInput,
          globalThis.SHEXImageCropper?.filesForInput?.(mediaInput)?.[0] || mediaInput.files?.[0]);
        return;
      }
      const tagSearch = event.target.closest?.('[data-simulator-tag-search]');
      if (tagSearch) {
        ui.taxonomy.query = String(tagSearch.value || '');
        if (tagSearchTimer) clearTimeout(tagSearchTimer);
        tagSearchTimer = setTimeout(() => { tagSearchTimer = null; void searchTags(ui.taxonomy.query); }, 180);
        return;
      }
      const tagCreateName = event.target.closest?.('[data-simulator-tag-create-name]');
      if (tagCreateName) { ui.taxonomy.createName = String(tagCreateName.value || ''); return; }
      const categoryControl = event.target.closest?.('[data-simulator-category]');
      if (categoryControl) {
        if (event.type !== 'change' || !categoryControl.checked) return;
        updateBlock('overview', 'categoryId', String(categoryControl.value || ''));
        return;
      }
      const tagControl = event.target.closest?.('[data-simulator-tag]');
      if (tagControl) {
        if (event.type !== 'change') return;
        const overview = blockPayload('overview', stateApi.createBlankCoreBlocks().overview);
        const current = Array.isArray(overview.tagIds) ? overview.tagIds : [];
        if (tagControl.checked && !canSelectTaxonomyTag(tagControl.dataset.tagStatus, current.includes(tagControl.value))) {
          tagControl.checked = false; notify('这个标签已停用，不能重新添加'); return;
        }
        if (tagControl.checked && !current.includes(tagControl.value) && current.length >= 10) {
          tagControl.checked = false; notify('最多选择 10 个标签'); return;
        }
        updateBlock('overview', 'tagIds', toggleReferenceValue(current, tagControl.value, tagControl.checked));
        renderTaxonomyDom();
        return;
      }
      const roleSelection = event.target.closest?.('[data-simulator-role-selection]');
      if (roleSelection) {
        if (event.type !== 'change' || roleSelection.disabled) return;
        const item = ui.picker.items[Number(roleSelection.dataset.simulatorPickDraft)];
        const draftId = characterDraftId(item) || String(roleSelection.value || '').trim();
        if (!item || !draftId) return;
        if (ui.picker.replaceRoleId) {
          ui.picker.selectedItems.clear();
          if (roleSelection.checked) ui.picker.selectedItems.set(draftId, item);
        } else if (roleSelection.checked) ui.picker.selectedItems.set(draftId, item);
        else ui.picker.selectedItems.delete(draftId);
        ui.picker.selectedDraftIds = [...ui.picker.selectedItems.keys()];
        refreshRolePickerSelectionDom();
        return;
      }
      const referenceControl = event.target.closest?.('[data-simulator-reference]');
      if (referenceControl) {
        if (event.type !== 'change') return;
        const blockKey = referenceControl.dataset.block;
        const path = referenceControl.dataset.path;
        const block = blockKey === '__stage__' ? currentStageBlock() : editor.getBlock(blockKey);
        if (!block) return;
        const current = getAt(block.payload, path);
        updateBlock(blockKey, path, toggleReferenceValue(current, referenceControl.value, referenceControl.checked));
        return;
      }
      const effectAxisControl = event.target.closest?.('[data-simulator-effect-axis]');
      if (effectAxisControl) {
        if (event.type !== 'change') return;
        const eventIndex = Number(effectAxisControl.dataset.eventIndex);
        const effectIndex = Number(effectAxisControl.dataset.effectIndex);
        const oldAxis = String(effectAxisControl.dataset.axis || '');
        const nextAxis = String(effectAxisControl.value || '');
        const stage = stageForTarget(event.target);
        const effect = stage?.payload?.events?.[eventIndex]?.effects?.[effectIndex];
        const axes = clone(effect?.patch?.axes || {});
        if (!oldAxis || !nextAxis || oldAxis === nextAxis || Object.hasOwn(axes, nextAxis)) return;
        axes[nextAxis] = axes[oldAxis];
        delete axes[oldAxis];
        updateBlock(stageForTarget(event.target)?.blockKey, `events.${eventIndex}.effects.${effectIndex}.patch.axes`, axes);
        refreshStoryForm(stage.blockKey, [`events.${eventIndex}.effects.${effectIndex}`]); syncStory();
        return;
      }
      const edgeControl = event.target.closest?.('[data-simulator-edge-part]');
      if (edgeControl) {
        if (event.type !== 'change') return;
        const blockKey = edgeControl.dataset.block; const path = edgeControl.dataset.path;
        const blockValue = blockKey === '__stage__' ? currentStageBlock() : editor.getBlock(blockKey);
        if (!blockValue) return;
        const parts = edgeParts(getAt(blockValue.payload, path));
        parts[edgeControl.dataset.simulatorEdgePart === 'from' ? 'from' : 'to'] = String(edgeControl.value || '');
        updateBlock(blockKey, path, `${parts.from}>${parts.to}`);
        return;
      }
      const control = event.target.closest('[data-simulator-field]');
      if (control) {
        const block = control.dataset.block; let path = control.dataset.path;
        if (block === 'roster' && /^characters\.\d+\./.test(path)) {
          const index = Number(path.split('.')[1]);
          const roster = blockPayload('roster', stateApi.createBlankCoreBlocks().roster);
          const role = roster.characters?.[index];
          if (!role) return;
          if (role.sourceType !== 'simulator_exclusive') {
            try { updateBlock('roster', `characters.${index}`, independentWorldRole(role)); }
            catch (error) { notify(error.message); return; }
          }
        }
        if (block === 'director') path = ({ goal: 'narrativeGoal', tone: 'toneInstructions', npcRules: 'npcControlRules', tempo: 'pacing', spoilers: 'forbiddenReveals' })[path] || path;
        const type = control.dataset.valueType || '';
        let value = control.type === 'checkbox' ? control.checked : control.value;
        const maxCodepoints = Math.max(0, Number(control.dataset.maxCodepoints || 0));
        if (maxCodepoints && typeof value === 'string' && Array.from(value).length > maxCodepoints) {
          value = Array.from(value).slice(0, maxCodepoints).join('');
          control.value = value;
        }
        let remove = false;
        let structuralRender = false;
        if (type === 'lines') value = parseLineList(value);
        else if (type === 'list') value = parseList(value);
        else if (type === 'number') value = Number(value);
        else if (type === 'optional-number') { remove = value === ''; value = remove ? undefined : Number(value); }
        else if (type === 'optional-text') { remove = value === ''; value = remove ? undefined : value; }
        else if (type === 'boolean-select') value = value === 'true';
        else if (type === 'smart') { if (value === 'true' || value === 'false') value = value === 'true'; else if (value !== '' && Number.isFinite(Number(value))) value = Number(value); }
        if (path === 'mode' && block.startsWith('stage:')) {
          const stageBlock = editor.getBlock(block);
          if (stageBlock) {
            let next = { ...clone(stageBlock.payload), mode: value };
            if (value === 'loop' && !next.repeatPolicy) next.repeatPolicy = { maxOccurrences: null, resetEventIds: [], carryVariableKeys: [] };
            editor.setBlock(block, 'stage', next); ui.publication = null; ui.notice = '';
            structuralRender = true;
          }
        } else if (/^events\.\d+\.random\.enabled$/.test(path) && block.startsWith('stage:')) {
          const parent = path.replace(/\.enabled$/, '');
          const stageBlock = stageForTarget(event.target); const prior = clone(getAt(stageBlock?.payload, parent)) || {};
          updateBlock(block, parent, value ? { weight: 1, cooldownOccurrences: 0, maxTriggers: null, ...prior, enabled: true } : { ...prior, enabled: false });
          structuralRender = true;
        } else if (/^items\.\d+\.simpleEffect\.kind$/.test(path) && block === 'state') {
          const parent = path.replace(/\.kind$/, '');
          const stateBlock = editor.getBlock('state');
          updateBlock(block, parent, transitionSimpleEffectKind(getAt(stateBlock?.payload, parent), value));
          structuralRender = true;
        } else if (/^variables\.\d+\.type$/.test(path) && block === 'state') {
          const stateBlock = editor.getBlock('state'); const index = Number(path.split('.')[1]);
          updateBlock('state', `variables.${index}`, transitionVariableType(stateBlock?.payload?.variables?.[index], value));
          structuralRender = true;
        } else if (/(?:\.conditions|(?:^|\.)(?:entryCondition|completionCondition))(?:\.clauses\.\d+)?\.type$/.test(path)) {
          const parent = path.replace(/\.type$/, '');
          const replacement = defaultCondition(value, stageForTarget(control));
          if (!replacement) { control.value = getAt(editor.getBlock(block)?.payload, path) || ''; ui.error = value === 'variableCompare' ? '请先添加变量。' : value === 'relationshipCompare' ? '请先添加角色。' : value === 'eventState' ? '请先添加事件。' : '请先添加阶段。'; render(); return; }
          const targetBlock = editor.getBlock(block);
          updateBlock(block, parent, transitionConditionType(getAt(targetBlock?.payload, parent), value, {
            firstVariable: firstVariable(), firstVariablePath: firstVariable() ? `variables.${firstVariable().key}` : '',
            firstEdge: firstRole() ? `user>${firstRole().roleId}` : '', firstEventId: firstEvent()?.eventId || '',
            firstStageId: (stageForTarget(control) || chapters().flatMap(chapter => chapter.stageBlocks)[0])?.payload?.stageId || '',
          }));
          structuralRender = true;
        } else if (/\.effects\.\d+\.type$/.test(path) && block.startsWith('stage:')) {
          const parent = path.replace(/\.type$/, '');
          const role = firstRole(); const variable = firstVariable();
          if (value === 'relationshipPatch' && !role) { control.value = getAt(editor.getBlock(block)?.payload, path) || ''; ui.error = '请先添加角色，再添加关系效果。'; render(); return; }
          if (value === 'variablePatch' && !variable) { control.value = getAt(editor.getBlock(block)?.payload, path) || ''; ui.error = '请先添加变量，再添加状态效果。'; render(); return; }
          const stageBlock = stageForTarget(event.target);
          updateBlock(block, parent, transitionEffectType(getAt(stageBlock?.payload, parent), value, { firstVariable: variable, firstEdge: role ? `user>${role.roleId}` : '' }));
          structuralRender = true;
        } else {
          updateBlock(block, path, value, remove);
          syncRelationSlider(control);
          refreshDependentValueControl(control, block, path);
          refreshVariableInitialValueControl(control, path);
        }
        if (structuralRender) {
          if (block.startsWith('stage:') || block.startsWith('chapter:')) { refreshStoryForm(block, [path.replace(/\.type$/, '')]); syncStory(); }
          else render();
        } else if (path === 'title' && (block.startsWith('chapter:') || block.startsWith('stage:'))) {
          const card = control.closest('[data-simulator-stage-card],[data-simulator-chapter-card]');
          const strong = card?.querySelector('header strong'); if (strong) strong.textContent = value || (block.startsWith('chapter:') ? '未命名章节' : '未命名阶段');
        }
        if (block.startsWith('stage:') && /^events\.\d+\.(title|required)$/.test(path)) updateEventHeading(control);
        if (event.type === 'change' && path === 'order' && (block.startsWith('chapter:') || block.startsWith('stage:'))) {
          const generation = ui.generation;
          // Finish the blur/change dispatch before moving the focused node's branch.
          setTimeout(() => { if (generation === ui.generation) syncStory(); }, 0);
        }
        return;
      }
      const candidate = event.target.closest('[data-simulator-candidate]');
      if (candidate) {
        if (!EDITABLE_CANDIDATE_KINDS.has(candidate.dataset.simulatorCandidate)) return;
        const current = blockPayload('director', stateApi.createBlankCoreBlocks().director);
        const next = nextEditableCandidateKinds(current.candidatePolicy?.allowedKinds, candidate.dataset.simulatorCandidate, candidate.checked, editor.getBlock('world')?.payload?.runtimeProfile);
        if (!next) { candidate.checked = true; notify('至少保留一种 AI 可提出的变化：事件候选或变量变化候选。'); return; }
        updateBlock('director', 'candidatePolicy.allowedKinds', next);
      }
    }
    async function onSubmit(event) {
      if (event.target.matches('[data-simulator-tag-create-form]')) {
        event.preventDefault();
        if (ui.taxonomy.creating) return;
        const form = event.target;
        const input = form.querySelector('[data-simulator-tag-create-name]');
        const submittedCreateName = String(input?.value || '');
        const displayName = submittedCreateName.trim();
        if (!displayName) { ui.taxonomy.error = '请先输入要新增的标签'; renderTaxonomyDom(); return; }
        const generation = ui.generation;
        const initiatingDraftId = String(snapshot().draftId || '');
        const requestIsCurrent = () => generation === ui.generation && initiatingDraftId === String(snapshot().draftId || '');
        ui.taxonomy.createName = submittedCreateName;
        ui.taxonomy.creating = true;
        ui.taxonomy.error = '';
        renderTaxonomyDom();
        try {
          const overview = blockPayload('overview', stateApi.createBlankCoreBlocks().overview);
          const result = await createAndSelectTag({ tagStore, displayName, currentIds: overview.tagIds });
          if (!requestIsCurrent()) return;
          ui.taxonomy.tags = [...ui.taxonomy.tags.filter(item => String(item?.tagId || '') !== result.tag.tagId), result.tag]
            .sort((left, right) => String(left.displayName || '').localeCompare(String(right.displayName || ''), 'zh-CN'));
          ui.taxonomy.knownTags = mergeTaxonomyTags(ui.taxonomy.knownTags, result.tag);
          const latestOverview = blockPayload('overview', stateApi.createBlankCoreBlocks().overview);
          const selection = mergeCreatedTagSelection(latestOverview.tagIds, result.tag.tagId);
          if (selection.changed) updateBlock('overview', 'tagIds', selection.tagIds);
          if (!selection.selected) ui.taxonomy.error = '标签已创建，但当前已选满 10 个，请先取消一个再选择';
          ui.taxonomy.createName = remainingTagCreateName(ui.taxonomy.createName, submittedCreateName);
        } catch (error) {
          if (requestIsCurrent()) ui.taxonomy.error = error?.message || '标签新增失败，请稍后重试';
        } finally {
          if (requestIsCurrent()) { ui.taxonomy.creating = false; renderTaxonomyDom(); }
        }
        return;
      }
      if (event.target.matches('[data-simulator-role-search-form]')) {
        event.preventDefault(); ui.picker.query = String(root.querySelector('[data-simulator-role-search]')?.value || ''); await searchRoles();
      }
    }
    function beginWorldReimport() {
      const snap = snapshot();
      if (ui.busy || snap.saving || reimportPanel || !snap.draftId) return;
      if (!globalThis.SHEXWorldImportPanel?.createWorldImportPanel) { notify('导入资源未加载，请刷新后重试'); return; }
      const nodes = Array.from(root.childNodes);
      const mount = root.ownerDocument.createElement('div');
      root.replaceChildren(mount);
      reimportPanel = globalThis.SHEXWorldImportPanel.createWorldImportPanel({
        root: mount, offlineClient: client, isAdmin: options.isAdmin, hasAccess: allowed,
        targetDraftId: snap.draftId, baseRevision: snap.revision,
        createRequestId: options.createRequestId, notify,
        onClose() {
          reimportPanel = null; root.replaceChildren(...nodes); markIndependentPage(true); syncStickyOffsets();
        },
        onDraftCreated(result) {
          reimportPanel?.dispose(); reimportPanel = null;
          open({ draftId: result.draftId });
        },
      });
      reimportPanel.open();
    }
    async function onClick(event) {
      const target = event.target.closest('button'); if (!target) return;
      if (storyUi.composing && !target.matches('[data-simulator-help]')) {
        event.preventDefault(); storyUi.pending = () => { if (target.isConnected) void onClick({ target, preventDefault() {}, stopPropagation() {} }); }; return;
      }
      if (target.matches('[data-simulator-advanced-toggle]')) { toggleAdvancedPanel(target); return; }
      if (target.hasAttribute('data-simulator-settings')) {
        const key = target.dataset.simulatorSettings; const all = chapters();
        const chapter = all.find(item => item.blockKey === key || item.stageBlocks.some(stage => stage.blockKey === key));
        if (!chapter) return;
        const alreadyVisible = target.getAttribute('aria-expanded') === 'true';
        storyUi.chapter = chapter.blockKey;
        if (key.startsWith('stage:')) storyUi.stages.set(chapter.blockKey, key);
        if (alreadyVisible) storyUi.settings.delete(key); else storyUi.settings.add(key);
        syncStory(); return;
      }
      const helpTarget = target.closest('[data-simulator-help]');
      if (helpTarget || target.matches('[data-simulator-stage-help]')) {
        event.preventDefault(); event.stopPropagation();
        await openSimulatorHelpDialog(helpTarget?.dataset?.simulatorHelp || 'stage');
        return;
      }
      if (target.matches('[data-simulator-close]')) { close(); options.onClose?.(); return; }
      if (target.matches('[data-simulator-library]')) { if (snapshot().dirtyBlockKeys.length && !globalThis.confirm?.('有未保存改动，确认返回我的作品吗？')) return; close(); options.onClose?.(); return; }
      if (target.matches('[data-simulator-delete-draft]')) {
        const draftId = snapshot().draftId;
        if (!draftId || ui.draftStatus !== 'draft' || !globalThis.confirm?.('确认删除这个世界草稿吗？删除后无法继续编辑。')) return;
        ui.busy = 'delete'; ui.error = ''; render();
        try {
          await client.deleteDraft({ draftId });
          notify('已删除');
          options.onDraftDeleted?.({ draftId });
          close(); options.onClose?.({ deletedDraftId: draftId });
        } catch (error) { ui.busy = ''; notify(error?.message || '删除失败，请稍后重试'); render(); }
        return;
      }
      if (target.matches('[data-simulator-create-blank]')) { await createBlank(); return; }
      if (target.dataset.simulatorOpenDraft) { await loadDraft(target.dataset.simulatorOpenDraft); return; }
      if (target.dataset.simulatorStep) { ui.step = target.dataset.simulatorStep; render(); return; }
      if (target.matches('[data-simulator-reimport]')) { beginWorldReimport(); return; }
      if (target.matches('[data-simulator-save]')) { await save(); return; }
      if (target.matches('[data-simulator-check-publish]')) { await checkAndPublish(); return; }
      if (target.matches('[data-simulator-unpublish]')) { await unpublish(); return; }
      if (target.dataset.simulatorRequiredTarget) { const publicationTarget = target.dataset.simulatorRequiredTarget; ui.step = 'overview'; render(); focusPublicationTarget(publicationTarget); return; }
      if (target.dataset.simulatorIssueTarget) {
        const issueTarget = target.dataset.simulatorIssueTarget;
        const chapterId = String(target.dataset.chapterId || '');
        const stageId = String(target.dataset.stageId || '');
        const eventIndex = target.dataset.eventIndex === '' ? null : Number(target.dataset.eventIndex);
        ui.step = 'story';
        if (chapterId) ui.selectedChapterId = chapterId;
        if (stageId) ui.selectedStageId = stageId;
        if (storyUi.node && chapterId) { storyUi.chapter = 'chapter:' + chapterId; if (stageId) storyUi.stages.set(storyUi.chapter, 'stage:' + chapterId + ':' + stageId); }
        render();
        focusStoryIssueTarget(issueTarget, { chapterId, stageId, eventIndex });
        return;
      }
      if (target.dataset.simulatorClearMedia) {
        const overview = blockPayload('overview', stateApi.createBlankCoreBlocks().overview);
        if (target.dataset.simulatorClearMedia === 'worldPromo') updateBlock('overview', 'coverAssetRef', undefined, true);
        else {
          const appearance = { ...(overview.appearanceRef || {}) };
          delete appearance.worldBackgroundAssetRef;
          updateBlock('overview', 'appearanceRef', Object.keys(appearance).length ? appearance : undefined, !Object.keys(appearance).length);
        }
        render(); return;
      }
      if (target.dataset.simulatorClearRoleAvatar) {
        const roleId = String(target.dataset.simulatorClearRoleAvatar || '');
        const roster = clone(blockPayload('roster', stateApi.createBlankCoreBlocks().roster));
        const role = (roster.characters || []).find(item => String(item?.roleId || '') === roleId);
        if (!role?.appearanceRef?.worldAvatarAssetRef) return;
        try { Object.assign(role, independentWorldRole(role)); }
        catch (error) { notify(error.message); return; }
        delete role.characterSnapshot; delete role.characterVersionRef;
        delete role.appearanceRef.worldAvatarAssetRef;
        updateBlock('roster', 'characters', roster.characters);
        render(); return;
      }
      if (target.dataset.simulatorIssueStep) {
        ui.step = target.dataset.simulatorIssueStep; render();
        if (target.dataset.simulatorIssueField) focusPublicationTarget(target.dataset.simulatorIssueField);
        return;
      }
      if (target.matches('[data-simulator-add-location]')) {
        const world = blockPayload('world', stateApi.createBlankCoreBlocks().world); const ids = (world.locations || []).map(item => item.locationId);
        addToBlock('world', 'locations', { locationId: generatedId('location', ids), name: '', summary: '', tags: [] }); return;
      }
      if (target.matches('[data-simulator-role-load-more]')) { await searchRoles({ append: true }); return; }
      if (target.matches('[data-simulator-open-role-picker]')) { resetRolePicker({ open: true }); render(); await searchRoles(); return; }
      if (target.matches('[data-simulator-replace-role]')) { resetRolePicker({ open: true, replaceRoleId: target.dataset.simulatorReplaceRole }); render(); await searchRoles(); return; }
      if (target.matches('[data-simulator-close-role-picker]')) { resetRolePicker(); render(); return; }
      if (target.matches('[data-simulator-role-picker-confirm]')) {
        const selectedItems = [...ui.picker.selectedItems.values()];
        if (!selectedItems.length) return;
        const roster = blockPayload('roster', stateApi.createBlankCoreBlocks().roster);
        try {
        if (ui.picker.replaceRoleId) {
          const roles = clone(roster.characters || []);
          const roleIndex = roles.findIndex(role => String(role?.roleId || '') === ui.picker.replaceRoleId);
          const current = roles[roleIndex];
          if (!current) return;
          roles[roleIndex] = replaceCharacterDraftSource(current, selectedItems[0]);
          updateBlock('roster', 'characters', roles);
          notify('角色来源已替换');
        } else {
          const ids = (roster.characters || []).map(role => String(role?.roleId || '')).filter(Boolean);
          const merged = mergeCharacterDraftSelection(roster.characters || [], selectedItems, {
            createRoleId: () => { const roleId = generatedId('role', ids); ids.push(roleId); return roleId; },
          });
          if (!merged.addedCount) { notify('所选角色已经加入当前模拟器'); return; }
          updateBlock('roster', 'characters', merged.roles);
          notify(`已加入 ${merged.addedCount} 个角色`);
        }
        } catch (error) { notify(error.message || '角色资料未能载入，请重新选择'); return; }
        resetRolePicker();
        render();
        return;
      }
      if (target.hasAttribute('data-simulator-add-dialogue') || target.hasAttribute('data-simulator-remove-dialogue')) {
        const roleId = target.dataset.simulatorAddDialogue || target.dataset.roleId;
        const roster = blockPayload('roster', stateApi.createBlankCoreBlocks().roster);
        const index = (roster.characters || []).findIndex(role => role.roleId === roleId);
        if (index < 0) return;
        let role;
        try { role = independentWorldRole(roster.characters[index]); }
        catch (error) { notify(error.message); return; }
        role.exclusiveProfile ||= {};
        role.exclusiveProfile.characterProfile ||= {};
        const list = role.exclusiveProfile.characterProfile.exampleDialogues ||= [];
        if (target.hasAttribute('data-simulator-add-dialogue')) list.push({ scene: '', content: '' });
        else list.splice(Number(target.dataset.simulatorRemoveDialogue), 1);
        updateBlock('roster', `characters.${index}`, role);
        const host = target.closest('[data-simulator-role-profile]');
        const open = [...host.querySelectorAll('details')].map(detail => detail.open);
        const wrapper = root.ownerDocument.createElement('div'); wrapper.innerHTML = roleProfileMarkup(role, index);
        const next = wrapper.firstElementChild;
        next.querySelectorAll('details').forEach((detail, i) => { detail.open = open[i]; });
        host.replaceWith(next);
        if (target.hasAttribute('data-simulator-add-dialogue')) next.querySelector(`[data-path="characters.${index}.exclusiveProfile.characterProfile.exampleDialogues.${list.length - 1}.scene"]`)?.focus();
        return;
      }
      if (target.matches('[data-simulator-add-variable]')) { const value = blockPayload('state', stateApi.createBlankCoreBlocks().state); addToBlock('state', 'variables', { key: generatedId('variable', (value.variables || []).map(item => item.key)), type: 'number', initialValue: 0, min: 0, max: 100, description: '', displayName: '', public: false, aiWritable: false }); return; }
      if (target.matches('[data-simulator-add-item]')) { const value = blockPayload('state', stateApi.createBlankCoreBlocks().state); addToBlock('state', 'items', { itemId: generatedId('item', (value.items || []).map(item => item.itemId)), name: '', initialQuantity: 1, summary: '', simpleEffect: { kind: 'none' } }); return; }
      if (target.matches('[data-simulator-add-relationship]')) { addToBlock('state', 'initialRelationships', { fromRoleId: '', toRoleId: '', axes: { familiarity: 0, affinity: 0, trust: 0, tension: 0 }, identityLabels: [], notes: '' }); return; }
      if (target.matches('[data-simulator-add-route]')) { const value = blockPayload('state', stateApi.createBlankCoreBlocks().state); addToBlock('state', 'routes', { routeId: generatedId('route', (value.routes || []).map(item => item.routeId)), title: '', summary: '' }); return; }
      if (target.matches('[data-simulator-add-chapter]')) {
        const all = chapters(); const chapterId = generatedId('chapter', all.map(item => item.payload.chapterId));
        editor.setBlock(`chapter:${chapterId}`, 'chapter', { chapterId, title: '', summary: '', order: all.length + 1, stageIds: [], roleIds: [], locationIds: [], hidden: false });
        ui.selectedChapterId = chapterId; ui.selectedStageId = ''; storyUi.chapter = `chapter:${chapterId}`; storyUi.stages.set(storyUi.chapter, ''); ui.publication = null; reconcileStoryOpening(); render(); focusStoryField(storyUi.chapter); return;
      }
      if (target.dataset.simulatorSelectChapter) { const key = 'chapter:' + target.dataset.simulatorSelectChapter; storyUi.chapter = storyUi.chapter === key ? '' : key; syncStory(); return; }
      if (target.matches('[data-simulator-remove-current-chapter]')) {
        const all = chapters(); const chapter = chapterForTarget(target);
        if (!chapter || !globalThis.confirm?.('确认移除当前章节及其全部阶段吗？引用错误会在发布前检查中明确列出。')) return;
        chapter.stageBlocks.forEach(stage => editor.deleteBlock(stage.blockKey, 'stage'));
        editor.deleteBlock(chapter.blockKey, 'chapter');
        ui.selectedChapterId = ''; ui.selectedStageId = ''; storyUi.chapter = ''; ui.publication = null; ui.notice = ''; reconcileStoryOpening(); syncStory(); return;
      }
      if (target.matches('[data-simulator-add-stage]')) {
        const all = chapters(); const chapter = chapterForTarget(target); if (!chapter) return;
        const stageId = generatedId('stage', chapter.stageBlocks.map(item => item.payload.stageId));
        editor.setBlock(`stage:${chapter.payload.chapterId}:${stageId}`, 'stage', { chapterId: chapter.payload.chapterId, stageId, title: '', summary: '', order: chapter.stageBlocks.length + 1, mode: 'linear', roleIds: [], locationIds: [], eventIds: [], events: [], hidden: false });
        editor.setBlock(chapter.blockKey, 'chapter', { ...clone(chapter.payload), stageIds: [...(chapter.payload.stageIds || []), stageId] });
        ui.selectedStageId = stageId; storyUi.chapter = chapter.blockKey; storyUi.stages.set(chapter.blockKey, `stage:${chapter.payload.chapterId}:${stageId}`); ui.publication = null; reconcileStoryOpening(); syncStory(); focusStoryField(storyUi.stages.get(chapter.blockKey)); return;
      }
      if (target.dataset.simulatorSelectStage) { const key = target.closest('[data-simulator-stage-card]').dataset.simulatorStageCard; const chapter = chapterForTarget(target); if (!chapter) return; storyUi.stages.set(chapter.blockKey, storyUi.stages.get(chapter.blockKey) === key ? '' : key); syncStory(); return; }
      if (target.matches('[data-simulator-remove-current-stage]')) {
        const all = chapters(); const chapter = chapterForTarget(target); const stage = stageForTarget(target);
        if (!chapter || !stage || !globalThis.confirm?.('确认移除当前阶段吗？引用错误会在发布前检查中明确列出。')) return;
        editor.deleteBlock(stage.blockKey, 'stage');
        editor.setBlock(chapter.blockKey, 'chapter', { ...clone(chapter.payload), stageIds: (chapter.payload.stageIds || []).filter(id => id !== stage.payload.stageId) });
        ui.selectedStageId = ''; storyUi.stages.set(chapter.blockKey, ''); ui.publication = null; ui.notice = ''; reconcileStoryOpening(); syncStory(); return;
      }
      if (target.matches('[data-simulator-add-event]')) {
        const stage = stageForTarget(event.target); if (!stage) return; const events = stage.payload.events || [];
        const eventId = generatedId('event', events.map(item => item.eventId));
        const nextEvents = [...events, { eventId, title: '', summary: '', stageId: stage.payload.stageId, roleIds: [], enabled: true, required: false }];
        editor.setBlock(stage.blockKey, 'stage', { ...clone(stage.payload), eventIds: [...(stage.payload.eventIds || []), eventId], events: nextEvents }); ui.publication = null; refreshStoryForm(stage.blockKey); syncStory(); focusStoryField(stage.blockKey, `events.${events.length}.title`); return;
      }
      if (target.matches('[data-simulator-add-effect-axis]')) {
        const eventIndex = Number(target.dataset.eventIndex); const effectIndex = Number(target.dataset.effectIndex);
        const stage = stageForTarget(event.target); const effect = stage?.payload?.events?.[eventIndex]?.effects?.[effectIndex];
        const axes = clone(effect?.patch?.axes || {});
        const nextAxis = RELATION_AXES.find(([axis]) => !Object.hasOwn(axes, axis))?.[0];
        if (!nextAxis) return;
        axes[nextAxis] = 0;
        updateBlock(stageForTarget(event.target)?.blockKey, `events.${eventIndex}.effects.${effectIndex}.patch.axes`, axes); refreshStoryTarget(target); return;
      }
      if (target.matches('[data-simulator-remove-effect-axis]')) {
        const eventIndex = Number(target.dataset.eventIndex); const effectIndex = Number(target.dataset.effectIndex);
        const axis = String(target.dataset.axis || ''); const stage = stageForTarget(event.target);
        const effect = stage?.payload?.events?.[eventIndex]?.effects?.[effectIndex]; const axes = clone(effect?.patch?.axes || {});
        if (!axis || !Object.hasOwn(axes, axis)) return;
        delete axes[axis];
        updateBlock(stageForTarget(event.target)?.blockKey, `events.${eventIndex}.effects.${effectIndex}.patch.axes`, axes); refreshStoryTarget(target); return;
      }
      if (target.dataset.simulatorAddEventCondition !== undefined) {
        const index = Number(target.dataset.simulatorAddEventCondition); const stage = stageForTarget(event.target);
        const leaf = defaultCondition('variableCompare');
        if (!leaf) { ui.error = '请先在“状态与关系”中添加一个变量，再添加变量条件。'; refreshStoryTarget(target); return; }
        const current = stage?.payload?.events?.[index]?.conditions;
        const next = !current ? leaf : (Array.isArray(current.clauses) ? { ...clone(current), clauses: [...current.clauses, leaf] } : { mode: 'AND', clauses: [clone(current), leaf] });
        updateBlock(stageForTarget(event.target)?.blockKey, `events.${index}.conditions`, next); refreshStoryTarget(target); return;
      }
      if (target.dataset.simulatorAddBlockCondition !== undefined) {
        const blockKey = target.dataset.blockKey; const block = editor.getBlock(blockKey); const path = target.dataset.simulatorAddBlockCondition;
        const leaf = defaultCondition('variableCompare');
        if (!block || !leaf) { ui.error = '请先在“状态与关系”中添加一个变量，再添加进入或完成条件。'; refreshStoryTarget(target); return; }
        const current = block.payload?.[path];
        const next = !current ? leaf : (Array.isArray(current.clauses) ? { ...clone(current), clauses: [...current.clauses, leaf] } : { mode: 'AND', clauses: [clone(current), leaf] });
        updateBlock(blockKey, path, next); refreshStoryTarget(target); return;
      }
      if (target.dataset.simulatorAddEventEffect !== undefined) {
        const index = Number(target.dataset.simulatorAddEventEffect); const stage = stageForTarget(event.target);
        const variable = blockPayload('state', stateApi.createBlankCoreBlocks().state).variables?.[0];
        if (!variable?.key) { ui.error = '请先在“状态与关系”中添加一个变量，再添加变量效果。'; refreshStoryTarget(target); return; }
        const effects = stage?.payload?.events?.[index]?.effects || [];
        updateBlock(stageForTarget(event.target)?.blockKey, `events.${index}.effects`, [...effects, { type: 'variablePatch', key: variable.key, value: clone(variable.initialValue) }]); refreshStoryTarget(target); return;
      }
      if (target.dataset.simulatorRemoveCondition !== undefined) {
        const stage = stageForTarget(event.target); const eventIndex = Number(target.closest('.shex-sim-event')?.querySelector('[data-simulator-add-event-condition]')?.dataset.simulatorAddEventCondition);
        const condition = stage?.payload?.events?.[eventIndex]?.conditions;
        if (!condition) return;
        if (target.dataset.simulatorRemoveCondition === 'root') updateBlock(stageForTarget(event.target)?.blockKey, `events.${eventIndex}.conditions`, undefined, true);
        else {
          const clauses = [...(condition.clauses || [])]; clauses.splice(Number(target.dataset.simulatorRemoveCondition), 1);
          if (!clauses.length) updateBlock(stageForTarget(event.target)?.blockKey, `events.${eventIndex}.conditions`, undefined, true);
          else if (clauses.length === 1) updateBlock(stageForTarget(event.target)?.blockKey, `events.${eventIndex}.conditions`, clauses[0]);
          else updateBlock(stageForTarget(event.target)?.blockKey, `events.${eventIndex}.conditions.clauses`, clauses);
        }
        refreshStoryTarget(target); return;
      }
      if (target.dataset.simulatorRemoveBlockCondition !== undefined) {
        const blockKey = target.dataset.blockKey; const conditionPath = target.dataset.conditionPath; const block = editor.getBlock(blockKey);
        const condition = block?.payload?.[conditionPath]; if (!condition) return;
        if (target.dataset.simulatorRemoveBlockCondition === 'root') updateBlock(blockKey, conditionPath, undefined, true);
        else {
          const clauses = [...(condition.clauses || [])]; clauses.splice(Number(target.dataset.simulatorRemoveBlockCondition), 1);
          if (!clauses.length) updateBlock(blockKey, conditionPath, undefined, true);
          else if (clauses.length === 1) updateBlock(blockKey, conditionPath, clauses[0]);
          else updateBlock(blockKey, `${conditionPath}.clauses`, clauses);
        }
        refreshStoryTarget(target); return;
      }
      if (target.dataset.simulatorRemoveEffect !== undefined) {
        const eventIndex = Number(target.dataset.eventIndex); const effectIndex = Number(target.dataset.simulatorRemoveEffect);
        const stage = stageForTarget(event.target); const effects = [...(stage?.payload?.events?.[eventIndex]?.effects || [])]; effects.splice(effectIndex, 1);
        updateBlock(stageForTarget(event.target)?.blockKey, `events.${eventIndex}.effects`, effects); refreshStoryTarget(target); return;
      }
      if (target.dataset.simulatorRemove) {
        const index = Number(target.dataset.index); const kind = target.dataset.simulatorRemove;
        if (!globalThis.confirm?.(`确认移除这项${kind === 'event' ? '事件' : '内容'}吗？`)) return;
        if (kind === 'location') removeFromBlock('world', 'locations', index);
        else if (kind === 'role') removeFromBlock('roster', 'characters', index);
        else if (kind === 'variable') removeFromBlock('state', 'variables', index);
        else if (kind === 'item') removeFromBlock('state', 'items', index);
        else if (kind === 'relationship') removeFromBlock('state', 'initialRelationships', index);
        else if (kind === 'route') removeFromBlock('state', 'routes', index);
        else if (kind === 'event') { const stage = stageForTarget(event.target); if (!stage) return; const events = [...(stage.payload.events || [])]; const [removed] = events.splice(index, 1); const eventIds = (stage.payload.eventIds || []).filter(id => id !== removed?.eventId); editor.setBlock(stage.blockKey, 'stage', { ...clone(stage.payload), events, eventIds }); refreshStoryTarget(target); }
      }
    }
    const submitHandler = event => void onSubmit(event);
    const clickHandler = event => void onClick(event);
    function bind() {
      if (bound) return; bound = true;
      root.addEventListener('compositionstart', onCompositionStart);
      root.addEventListener('compositionend', onCompositionEnd);
      root.addEventListener('input', onInput);
      root.addEventListener('change', onInput);
      root.addEventListener('submit', submitHandler);
      root.addEventListener('click', clickHandler);
    }
    function open(openOptions = {}) {
      if (!allowed()) { root.innerHTML = ''; return false; }
      markIndependentPage(true);
      bind(); ui.error = ''; ui.notice = ''; ui.publication = null;
      if (openOptions.draftId) void loadDraft(openOptions.draftId); else void createBlank();
      return true;
    }
    function resume() {
      if (!root.querySelector?.('[data-simulator-editor]')) return false;
      markIndependentPage(true);
      const scrollHost = root.closest?.('.x-panel');
      if (scrollHost) scrollHost.scrollTop = 0;
      syncStickyOffsets();
      globalThis.requestAnimationFrame?.(syncStickyOffsets);
      return true;
    }
    function close() {
      reimportPanel?.dispose(); reimportPanel = null; resetStoryUi(); ui.generation += 1; ui.picker.generation += 1; ui.taxonomy.generation += 1; if (tagSearchTimer) { clearTimeout(tagSearchTimer); tagSearchTimer = null; } stickyHeadObserver?.disconnect?.(); stickyHeadObserver = null; ui.busy = ''; ui.loading = false; ui.picker.loading = false; ui.taxonomy.loading = false; ui.taxonomy.creating = false; resetRolePicker(); editor.load({}); root.innerHTML = ''; markIndependentPage(false); if (bound) { root.removeEventListener('compositionstart', onCompositionStart); root.removeEventListener('compositionend', onCompositionEnd); root.removeEventListener('input', onInput); root.removeEventListener('change', onInput); root.removeEventListener('submit', submitHandler); root.removeEventListener('click', clickHandler); bound = false; } }
    function dispose() { close(); }
    return Object.freeze({ open, resume, close, dispose, getState: snapshot });
  }

  return Object.freeze({
    STEPS, CANDIDATE_KINDS, editableCandidateKinds, nextEditableCandidateKinds, createSimulatorWorkbench, persistWorldMediaSelection, uploadAndPersistWorldMedia,
    roleMarkup, worldMarkup, stateMarkup, storyMarkup, overviewMarkup, directorMarkup, publishMarkup, relationshipMarkup, eventMarkup,
    relationLevelLabel, reconcileOpeningPosition, stageHelpContent, openStageHelpDialog,
    HELP_CONTENTS, helpContent, helpButton, sectionTitle, openSimulatorHelpDialog,
    publicationContentRequirements, publicationIssueView,
    conditionLeafMarkup, conditionMarkup, effectMarkup, variableReferenceOptions,
    transitionVariableType, transitionConditionType, transitionEffectType, transitionSimpleEffectKind,
    mergeCharacterDraftSelection, replaceCharacterDraftSource, independentWorldRole, roleSourceUnavailable, publicationFailureMessage, publicationErrorEntry, beautifyPublicationFailureMessage,
    loadSaveDiagnostics, clearSaveDiagnostics, setAt, referenceField,
    toggleReferenceValue, mergeCreatedTagSelection, remainingTagCreateName, createAndSelectTag, advancedSettingsMarkup, toggleAdvancedPanel, createReferenceCatalog,
    applyTaxonomyCatalogPage,
    canSelectTaxonomyTag,
  });
}));
