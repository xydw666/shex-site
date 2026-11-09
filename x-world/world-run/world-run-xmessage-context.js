(function initWorldRunXMessageContext(global, factory) {
  // X103 Phase 2：变量契约模块。浏览器里由 index.html 先于本文件加载并挂到 global；
  // Node 单测里直接 require。两边都拿不到时整条变量链安全降级为空，不得抛错。
  let variablesModule = global?.SHEXWorldRunVariables || null;
  if (!variablesModule && typeof require === 'function') {
    try { variablesModule = require('./world-run-variables.js'); } catch (_) { variablesModule = null; }
  }
  let openingModule = global?.SHEXCharacterOpeningContract || null;
  if (!openingModule && typeof require === 'function') {
    try { openingModule = require('../character-profile/character-opening-contract.js'); } catch (_) { openingModule = null; }
  }
  const api = factory(global?.SHEXWorldRunView, variablesModule, openingModule);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.SHEXWorldRunXMessageContext = api;
})(typeof window !== 'undefined' ? window : globalThis, function createWorldRunXMessageContextModule(view, variablesModule, openingModule) {
  'use strict';

  const text = value => String(value ?? '').trim();
  const clone = value => value && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value;
  const PRESENTATION_VERSION = 'world-run-state-presentation-v1';

  function normalizeStatePresentation(value = {}, fallback = {}) {
    const source = value && typeof value === 'object' ? value : {};
    if (text(source.contractVersion) === PRESENTATION_VERSION) {
      const occurrence = Number(source.occurrence);
      return {
        contractVersion:PRESENTATION_VERSION,
        chapterTitle:text(source.chapterTitle).slice(0,80) || '未命名章节',
        stageTitle:text(source.stageTitle).slice(0,80) || '未命名阶段',
        combinedTitle:text(source.combinedTitle).slice(0,170),
        isLoop:source.isLoop === true,
        occurrence:Number.isSafeInteger(occurrence) && occurrence > 0 ? occurrence : 1,
        occurrenceLabel:text(source.occurrenceLabel).slice(0,40),
        platformLabel:text(source.platformLabel).slice(0,220),
      };
    }
    const chapterTitle = text(fallback.chapter?.title).slice(0,80) || '未命名章节';
    const stageTitle = text(fallback.stage?.title).slice(0,80) || '未命名阶段';
    const combinedTitle = `${chapterTitle} · ${stageTitle}`;
    return { contractVersion:PRESENTATION_VERSION, chapterTitle, stageTitle, combinedTitle, isLoop:false, occurrence:1, occurrenceLabel:'', platformLabel:combinedTitle };
  }

  // ---- X103 Phase 2：WorldRun 变量快照在前端链路上不得被丢掉 ----
  // 定义来自世界模板（创作侧 state 内容块里的 variables 数组），取值来自 run 的物化快照。
  // 服务端字段位置尚未定死（shexWorldRun 不在本仓库），这里对已知的几种摆放做兼容读取，
  // 并且严格区分两者：只有「数组」才会被当成定义，避免把取值映射误读成定义。
  function normalizeVariableDefinitions(input) {
    return variablesModule?.normalizeDefinitions ? variablesModule.normalizeDefinitions(input) : [];
  }
  function normalizeVariableValues(input) {
    return variablesModule?.normalizeValues ? variablesModule.normalizeValues(input) : {};
  }
  function applyVariableSnapshot(currentValues, currentRevision, incoming, incomingRevision) {
    if (!variablesModule?.applySnapshot) {
      return { values:normalizeVariableValues(currentValues), revision:currentRevision ?? null, accepted:false };
    }
    return variablesModule.applySnapshot(currentValues, currentRevision, incoming, incomingRevision);
  }
  function hasEntries(value) {
    if (Array.isArray(value)) return value.length > 0;
    return Boolean(value) && typeof value === 'object' && Object.keys(value).length > 0;
  }
  function pickVariableDefinitions(source = {}, run = {}) {
    const explicit = source.variableDefinitions || run.variableDefinitions;
    if (hasEntries(explicit)) return explicit;
    return [source.world?.state?.variables, source.state?.variables, run.state?.variables]
      .find(candidate => Array.isArray(candidate) && candidate.length) || [];
  }
  function pickVariableValues(source = {}, run = {}) {
    return [source.variables, run.variables, source.state?.variableValues, run.state?.variableValues]
      .find(hasEntries) || null;
  }
  function pickVariablesRevision(source = {}, run = {}) {
    const candidate = [
      source.variablesRevision, run.variablesRevision,
      source.appliedThroughSequence, run.appliedThroughSequence,
      source.runRevision, run.runRevision,
      source.revision, run.revision
    ].find(value => typeof value === 'number' && Number.isFinite(value));
    return candidate === undefined ? null : candidate;
  }

  function normalizeRoot(input = {}) {
    if (view?.normalizeWorldRunResult) return view.normalizeWorldRunResult(input);
    const root = input && typeof input === 'object' ? input : {};
    const run = root.run && typeof root.run === 'object' ? root.run : root;
    return { ...root, run, runId:text(root.runId || run.runId), world:root.world || run.world || {}, position:root.position || run.position || {} };
  }

  function normalizeMessage(message = {}) {
    const role = message.role === 'user' ? 'user' : 'ta';
    const id = text(message.id || message.messageId);
    const normalized = {
      ...clone(message),
      id,
      messageId:id,
      role,
      text:text(message.text),
      time:Number(message.time || message.createdAt || 0),
      ...(role === 'ta' ? {
        sourceType:text(message.sourceType) || 'ai',
        sourceRoute:text(message.sourceRoute) || 'simulator_ai_director',
        sourceCategory:text(message.sourceCategory) || 'simulator_ai',
        promptContract:text(message.promptContract) || 'L',
        longformMode:message.longformMode !== false,
        ...(message.fixedOpening === true ? { fixedOpening:true } : {}),
      } : {})
    };
    if (role === 'ta' && normalized.fixedOpening === true && !Array.isArray(normalized.segments)) {
      const segments = openingModule?.parseOpeningSegments?.(normalized.text, 3000) || [];
      if (segments.length) normalized.segments = segments;
    }
    return normalized;
  }

  // 服务端 updatedAt 是 ISO 字符串；Number(ISO) 会得到 NaN，导致列表无法按最近时间排序。
  function toTimestamp(value) {
    if (value instanceof Date) {
      const time = value.getTime();
      return Number.isFinite(time) && time > 0 ? time : 0;
    }
    if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : 0;
    if (value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, '$date')) return toTimestamp(value.$date);
    const raw = text(value);
    if (!raw) return 0;
    if (/^\d+(?:\.\d+)?$/.test(raw)) return toTimestamp(Number(raw));
    const parsed = Date.parse(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }

  // 同一条 assistant 回复在不同路径下的统一身份：权威 assistantId + 展开后的段序号。
  function replyIdentityKey(message = {}) {
    const authoritativeId = text(message.authoritativeReplyId);
    const index = Number(message.replyIndex);
    return authoritativeId && Number.isInteger(index) && index >= 0 ? `${authoritativeId}#${index}` : '';
  }

  // 实时流式阶段的消息沿用 `${requestId}:reply:${i}`，以便与流式 DOM 原地晋升；
  // 一旦同一回复的权威展开（`${assistantId}:${n}`）到达，provisional 副本即被替换。
  function isProvisionalReplyMessage(message = {}) {
    const requestId = text(message.requestId);
    return Boolean(requestId) && text(message.id).startsWith(`${requestId}:reply:`);
  }

  function projectTerminalMessages(messages) {
    const key = message => text(message.terminalMessageId) || replyIdentityKey(message) || text(message.id);
    const terminals = new Map();
    for (const message of messages) {
      if (!message.deletedAt && !message.revoked) continue;
      const previous = terminals.get(key(message));
      if (!previous?.deletedAt) terminals.set(key(message), message);
    }
    return messages.map(message => {
      const terminal = terminals.get(key(message));
      if (!terminal) return message;
      return {...message,type:'notice',noticeKind:'revoked',revoked:Boolean(terminal.revoked),deletedAt:Number(terminal.deletedAt || 0),
        text:terminal.deletedAt ? '' : terminal.text,segments:[],parts:[],speakerTurns:[]};
    });
  }

  function mergeMessages(...groups) {
    const byId = new Map();
    groups.flat().forEach(message => {
      const normalized = normalizeMessage(message);
      const previous = byId.get(normalized.id);
      if (normalized.id && !(previous?.deletedAt || (previous?.revoked && !normalized.deletedAt))) byId.set(normalized.id, normalized);
    });
    const projected = projectTerminalMessages([...byId.values()]);
    const authoritativeKeys = new Set(projected
      .filter(message => !isProvisionalReplyMessage(message))
      .map(replyIdentityKey)
      .filter(Boolean));
    return projected.filter(message => {
      if (!authoritativeKeys.size || !isProvisionalReplyMessage(message)) return true;
      return !authoritativeKeys.has(replyIdentityKey(message));
    }).sort((left, right) => {
      const leftSequence = Math.max(0, Number(left.sequence || 0));
      const rightSequence = Math.max(0, Number(right.sequence || 0));
      if (leftSequence && rightSequence) return leftSequence - rightSequence;
      if (leftSequence) return -1;
      if (rightSequence) return 1;
      return Number(left.time || 0) - Number(right.time || 0);
    });
  }

  // 完整会话与 getWorldRun 的最近消息窗口合并时，保留用户已经看到的顺序。
  // 服务端历史有 sequence 但没有逐条 time；本轮刚聊的消息恰好相反。
  // 直接按两者重新排序，会把最新窗口放到旧消息前面。
  function mergeOwnedMessages(previousMessages = [], incomingMessages = []) {
    const incoming = (Array.isArray(incomingMessages) ? incomingMessages : []).map(normalizeMessage).filter(item => item.id);
    const incomingById = new Map(incoming.map(item => [item.id, item]));
    const ordered = (Array.isArray(previousMessages) ? previousMessages : []).map(normalizeMessage).filter(item => item.id)
      .map(previous => {
        const next = incomingById.get(previous.id);
        return next && !(previous.deletedAt || (previous.revoked && !next.deletedAt)) ? { ...previous, ...next, time:next.time || previous.time } : previous;
      });
    const knownIds = new Set(ordered.map(item => item.id));
    incoming.forEach((message, index) => {
      if (knownIds.has(message.id)) return;
      const nextAnchor = incoming.slice(index + 1).find(item => knownIds.has(item.id));
      const anchorIndex = nextAnchor ? ordered.findIndex(item => item.id === nextAnchor.id) : -1;
      if (anchorIndex >= 0) ordered.splice(anchorIndex, 0, message);
      else ordered.push(message);
      knownIds.add(message.id);
    });
    const projected = projectTerminalMessages(ordered);
    const authoritativeKeys = new Set(projected.filter(item => !isProvisionalReplyMessage(item)).map(replyIdentityKey).filter(Boolean));
    return projected.filter(item => !isProvisionalReplyMessage(item) || !authoritativeKeys.has(replyIdentityKey(item)));
  }

  function normalizeRoleIdentityDirectory(value, runId, worldVersionId) {
    if (!value || text(value.runId) !== text(runId) || text(value.worldVersionId) !== text(worldVersionId)) return null;
    return { runId:text(runId), worldVersionId:text(worldVersionId),
      roleIds:[...new Set((Array.isArray(value.roleIds) ? value.roleIds : []).map(text).filter(Boolean))] };
  }
  function roleCache(directory, previous, messages = [], sourceRunId = '', sourceVersionId = '') {
    const base = previous && directory && previous.runId === directory.runId && previous.worldVersionId === directory.worldVersionId
      ? clone(previous) : { runId:text(directory?.runId), worldVersionId:text(directory?.worldVersionId), byRoleId:{} };
    if (!directory || text(sourceRunId) !== directory.runId || text(sourceVersionId) !== directory.worldVersionId) return base;
    for (const item of messages) {
      const message = item?.payload || item;
      if (message?.role !== 'assistant' || text(message.worldVersionId) !== directory.worldVersionId) continue;
      for (const turn of Array.isArray(message.speakerTurns) ? message.speakerTurns : []) {
        const id = text(turn?.speakerRoleId);
        if (!directory.roleIds.includes(id) || !['dialogue','action'].includes(text(turn.type) || (id ? 'dialogue' : 'scene'))) continue;
        if (!Object.hasOwn(base.byRoleId,id)) Object.defineProperty(base.byRoleId,id,{
          value:{displayName:text(turn.speakerName),avatar:text(turn.speakerAvatar)}, enumerable:true, writable:true, configurable:true
        });
      }
    }
    return base;
  }
  function mergedRoleIdentity(previous, next, runId) {
    const version = text(next.worldVersionId || previous.worldVersionId);
    const directory = normalizeRoleIdentityDirectory(next.roleIdentityDirectory,runId,version)
      || normalizeRoleIdentityDirectory(previous.roleIdentityDirectory,runId,version);
    const cache = roleCache(directory,previous.rolePresentationCache);
    const incoming = roleCache(directory,next.rolePresentationCache);
    for (const id of directory?.roleIds || []) {
      if (Object.hasOwn(incoming.byRoleId,id)) Object.defineProperty(cache.byRoleId,id,{
        value:clone(incoming.byRoleId[id]),enumerable:true,writable:true,configurable:true
      });
    }
    return {roleIdentityDirectory:directory,rolePresentationCache:cache};
  }

  function participantAvatar(participant = {}) {
    return text(participant.avatarUrl || participant.avatar || participant.avatarAssetId || participant.avatarFileId);
  }

  function resolveSpeaker(current = {}, message = {}) {
    const speakerRoleId = text(message.speakerRoleId);
    const participant = speakerRoleId
      ? (current.participants || []).find(item => text(item?.roleId) === speakerRoleId)
      : null;
    if (!participant) {
      const directory = normalizeRoleIdentityDirectory(current.roleIdentityDirectory,current.runId,current.worldVersionId);
      const cache = current.rolePresentationCache;
      const cached = directory && text(message.worldVersionId) === directory.worldVersionId
        && cache?.runId === directory.runId && cache?.worldVersionId === directory.worldVersionId
        && directory.roleIds.includes(speakerRoleId) && Object.hasOwn(cache.byRoleId || {},speakerRoleId)
        ? cache.byRoleId[speakerRoleId] : null;
      if (cached) return {speakerRoleId,speakerName:text(cached.displayName) || '世界角色',speakerAvatar:text(cached.avatar),speakerKind:'role'};
      // X103：目录确认这个 ID 是当前世界版本登记的正式角色时，直接采用这一段自带的角色名与头像。
      // 后端只会给登记角色的台词/动作写 speakerRoleId；角色不在「进入世界时的在场名单」里（换章后、或这条历史来自升级前的版本）
      // 不是把它降级成旁白的理由。目录里没有的 ID 仍然不被信任。
      if (directory && speakerRoleId && directory.roleIds.includes(speakerRoleId) && text(message.speakerName)) {
        return {speakerRoleId,speakerName:text(message.speakerName),speakerAvatar:text(message.speakerAvatar),speakerKind:'role'};
      }
      return {speakerRoleId:'',speakerName:speakerRoleId ? '旁白' : (text(message.speakerName) || '旁白'),speakerAvatar:'',speakerKind:'narrator'};
    }
    return {
      speakerRoleId,
      speakerName:text(participant.displayName || participant.name) || '世界角色',
      speakerAvatar:participantAvatar(participant),
      speakerKind:'role'
    };
  }

  function presentSpeaker(speaker = {}) {
    if (speaker.speakerKind === 'narrator') {
      return { ...speaker, speakerName:'X', avatarMark:'X' };
    }
    return { ...speaker, avatarMark:'' };
  }

  function expandAssistantReply(current = {}, reply = {}) {
    const baseId = text(reply.messageId || reply.id);
    const requestId = text(reply.requestId);
    const turns = Array.isArray(reply.speakerTurns)
      ? reply.speakerTurns.filter(item => item && text(item.text))
      : [];
    const source = turns.length ? turns : [{ ...reply, text:text(reply.text) }];
    const base = clone(reply) || {};
    delete base.speakerTurns;
    delete base.segments;
    delete base.parts;
    // X103：注册人物开场。带结构化分段的开场白按正式角色的普通回复来展示（名字、头像、对话框、动作同框），
    // 不走「固定开场」的旁白 / X 展示；没有分段的旧开场不受影响。
    if (turns.length && base.fixedOpening === true) {
      delete base.fixedOpening;
      base.sourceRoute = 'simulator_ai_director';
      base.sourceCategory = 'simulator_ai';
    }
    const baseTime = Number(reply.time || 0);
    return source.map((turn, index) => {
      const originalIndex = Number.isInteger(turn?.replyIndex) ? turn.replyIndex : index;
      const explicitType = text(turn?.type).toLowerCase();
      const type = ['scene', 'action', 'dialogue', 'notice'].includes(explicitType)
        ? explicitType
        : (turns.length ? (text(turn?.speakerRoleId) ? 'dialogue' : 'scene') : '');
      // 角色动作归属到做动作的正式角色（名字、头像），只有旁白才显示为 X。
      const resolved = type === 'scene' || (type === 'action' && !text(turn?.speakerRoleId))
        ? { speakerRoleId:'', speakerName:'', speakerAvatar:'', speakerKind:'narrator' }
        : resolveSpeaker(current, { ...turn, worldVersionId:text(reply.worldVersionId) });
      // X103：旁白永远只是旁白。结构化分段里，说话人无法确认为当前世界正式角色的台词/动作一律按旁白段展示，
      // 不生成带头像和名字的人物气泡，也不沿用这一段自带的任何「说话人名字」。
      const narrated = turns.length > 0 && resolved.speakerKind === 'narrator' && type !== 'scene';
      const speaker = narrated ? { speakerRoleId:'', speakerName:'', speakerAvatar:'', speakerKind:'narrator' } : resolved;
      const displayType = narrated && type === 'dialogue' ? 'scene' : type;
      const messageId = requestId
        ? `${requestId}:reply:${originalIndex}`
        : (turns.length ? `${baseId}:${originalIndex + 1}` : baseId);
      return normalizeMessage({
        ...base,
        ...clone(turn),
        ...speaker,
        worldVersionId:text(reply.worldVersionId),
        id:messageId,
        messageId,
        ...(requestId ? { requestId } : {}),
        ...(baseId ? { authoritativeReplyId:baseId, replyIndex:originalIndex } : {}),
        terminalMessageId:turns.length ? `${baseId}:${originalIndex + 1}` : baseId,
        role:'ta',
        ...(displayType ? { type:displayType, segments:[{
          ...(turn?.segmentId !== undefined && turn?.segmentId !== null ? { segmentId:turn.segmentId } : {}),
          type:displayType,
          text:text(turn.text)
        }] } : {}),
        text:text(turn.text),
        // 历史记录没有客户端时间：不伪造成“现在”，排序交给 sequence。
        time:baseTime ? baseTime + index : 0
      });
    }).filter(item => item.id && item.text);
  }

  // createContext / applyHistoryPage 共用：把一条已持久化的对话消息展开成聊天框消息。
  function expandStoredMessage(current = {}, message = {}, sequenceValue = 0) {
    const source = message && typeof message === 'object' ? message : {};
    const sequence = Math.max(0, Number(sequenceValue || source.sequence || 0));
    const isAssistant = source.role !== 'user';
    if (isAssistant && Array.isArray(source.speakerTurns) && source.speakerTurns.length) {
      return expandAssistantReply(current, source).map((expanded, index) => ({
        ...expanded,
        sequence:sequence ? sequence + (index / 1000) : 0
      }));
    }
    const stored = { ...clone(source), sequence };
    const id = text(source.id || source.messageId);
    if (isAssistant && id && !isProvisionalReplyMessage({ ...source, id })) {
      stored.authoritativeReplyId = text(source.authoritativeReplyId) || id;
      stored.terminalMessageId = text(source.terminalMessageId) || id;
      if (!Number.isInteger(Number(source.replyIndex))) stored.replyIndex = 0;
    }
    return [stored];
  }

  // X103 稳定性：WorldRun 状态组按 revision 整组单调。
  // 状态组 = revision / statePresentation / chapter / stage / position / variables /
  //          variablesRevision / variableDefinitions / completion。
  // 较低 revision 的异步旧回包整组丢弃，绝不和新状态拼成「半回滚」；同 revision 视为幂等刷新；
  // 缺 revision（0）的回包不能覆盖已知的较高 revision。消息不受此约束，永远按 id 合并——
  // 「查看更早消息」这类合法的旧数据必须照常进来。
  function runStateRevision(context) {
    const value = Number(context?.revision);
    return Number.isFinite(value) && value > 0 ? value : 0;
  }
  function incomingStateIsStale(previous, next) {
    return runStateRevision(next) < runStateRevision(previous);
  }

  function worldMessagePreview(current = {}) {
    const suppressedThrough = toTimestamp(current.terminalPreviewThrough);
    return suppressedThrough > 0 && toTimestamp(current.lastChatAt) <= suppressedThrough ? '' : text(current.lastMessagePreview);
  }

  function mergeOwnedContexts(current = [], incoming = []) {
    const byRunId = new Map();
    [...(Array.isArray(current) ? current : []), ...(Array.isArray(incoming) ? incoming : [])].forEach(item => {
      if (!item || !text(item.runId)) return;
      const runId = text(item.runId);
      const previous = byRunId.get(runId);
      const next = clone(item);
      if (!previous) {
        byRunId.set(runId, next);
        return;
      }
      // X103 Phase 2：多来源归并同样要守「旧快照不得覆盖新的」——列表刷新回来的老 context
      // 不能把刚打完一轮的权威变量值冲掉。
      const staleState = incomingStateIsStale(previous, next);
      const sameVersion = text(previous.worldVersionId) === text(next.worldVersionId);
      const retainVersion = staleState && !sameVersion;
      const mergedVariables = applyVariableSnapshot(previous.variables, previous.variablesRevision, next.variables, next.variablesRevision);
      const terminalPreviewThrough = Math.max(toTimestamp(previous.terminalPreviewThrough),toTimestamp(next.terminalPreviewThrough));
      byRunId.set(runId, {
        ...previous,
        ...next,
        ...(retainVersion
          ? { roleIdentityDirectory:previous.roleIdentityDirectory, rolePresentationCache:previous.rolePresentationCache }
          : mergedRoleIdentity(previous,next,runId)),
        worldVersionId:retainVersion ? previous.worldVersionId : (next.worldVersionId || previous.worldVersionId),
        surchargeEnergy:retainVersion || (sameVersion && ![2, 3, 4, 5].includes(Number(next.surchargeEnergy)))
          ? previous.surchargeEnergy : next.surchargeEnergy,
        variableDefinitions:hasEntries(next.variableDefinitions)
          ? next.variableDefinitions
          : (Array.isArray(previous.variableDefinitions) ? previous.variableDefinitions : []),
        variables:mergedVariables.values,
        variablesRevision:mergedVariables.revision,
        completion:next.completion?.status === 'completed' ? clone(next.completion) : clone(previous.completion || null),
        // getWorldRun 不回传 updatedAt；不能让缺省值把列表里的最近时间覆盖成 0。
        updatedAt:Math.max(toTimestamp(previous.updatedAt), toTimestamp(next.updatedAt)),
        lastChatAt:Math.max(toTimestamp(previous.lastChatAt), toTimestamp(next.lastChatAt)),
        terminalPreviewThrough,
        lastMessagePreview:worldMessagePreview({
          terminalPreviewThrough,
          lastChatAt:Math.max(toTimestamp(previous.lastChatAt),toTimestamp(next.lastChatAt)),
          lastMessagePreview:toTimestamp(next.lastChatAt) >= toTimestamp(previous.lastChatAt)
            ? text(next.lastMessagePreview) : text(previous.lastMessagePreview),
        }),
        world:{ ...(previous.world || {}), ...(next.world || {}) },
        contact:{ ...(previous.contact || {}), ...(next.contact || {}) },
        xWorldItem:{ ...(previous.xWorldItem || {}), ...(retainVersion ? {} : (next.xWorldItem || {})) },
        chapter:Object.keys(next.chapter || {}).length ? next.chapter : previous.chapter,
        stage:Object.keys(next.stage || {}).length ? next.stage : previous.stage,
        participants:Array.isArray(next.participants) && next.participants.length ? next.participants : previous.participants,
        messages:Array.isArray(next.messages) && next.messages.length
          ? mergeOwnedMessages(previous.messages || [], next.messages)
          : previous.messages,
        historyCursor:next.historyCursor || previous.historyCursor || null,
        ...(staleState ? {
          revision:previous.revision,
          statePresentation:previous.statePresentation,
          chapter:previous.chapter,
          stage:previous.stage,
          position:previous.position,
          variableDefinitions:Array.isArray(previous.variableDefinitions) ? previous.variableDefinitions : [],
          variables:previous.variables || {},
          variablesRevision:previous.variablesRevision ?? null,
          completion:clone(previous.completion || null),
          // 陈旧的服务端快照不代表本地在途发送的真实状态，不能把 sending/pendingRequest 冲掉。
          pendingRequest:previous.pendingRequest ?? null,
          sending:previous.sending === true
        } : {})
      });
    });
    return [...byRunId.values()].sort((left, right) => {
      const timeDiff = toTimestamp(right.lastChatAt) - toTimestamp(left.lastChatAt);
      return timeDiff || text(left.runId).localeCompare(text(right.runId));
    });
  }

  function reconcileOwnedRuntimeState(input = {}) {
    const ownerId = text(input.ownerId);
    const previousOwnerId = text(input.previousOwnerId);
    const ownerChanged = Boolean(previousOwnerId && ownerId && previousOwnerId !== ownerId);
    const currentContexts = ownerChanged ? [] : (Array.isArray(input.currentContexts) ? input.currentContexts : []);
    const contexts = mergeOwnedContexts(currentContexts, Array.isArray(input.incomingContexts) ? input.incomingContexts : []);
    const ownedRunIds = new Set(contexts.map(item => text(item?.runId)).filter(Boolean));
    const selectedCandidates = [
      ...(ownerChanged ? [] : [text(input.selectedRunId)]),
      text(input.preferredRunId)
    ].filter(Boolean);
    const selectedRunId = selectedCandidates.find(runId => ownedRunIds.has(runId)) || '';
    return {
      ownerId:ownerId || previousOwnerId,
      ownerChanged,
      contexts,
      selectedRunId
    };
  }

  function resolveXWorldAppearanceScope(input = {}) {
    const ownerId = text(input.ownerId);
    if (!ownerId) return null;
    const selectedRunId = text(input.selectedRunId);
    const ownedContexts = input.ownedContexts instanceof Map
      ? input.ownedContexts
      : new Map((Array.isArray(input.ownedContexts) ? input.ownedContexts : []).map((item) => [text(item?.runId), item]));
    if (selectedRunId && ownedContexts.has(selectedRunId)) {
      return { ownerId, scopeType:'world_run', scopeId:selectedRunId };
    }
    const currentDreamId = text(input.currentDreamId);
    return currentDreamId ? { ownerId, scopeType:'user_dream', scopeId:currentDreamId } : null;
  }

  function ownedWorldRows(contexts = []) {
    return mergeOwnedContexts([], contexts).map(current => ({
      type:'world_run',
      id:text(current.runId),
      title:text(current.contact?.title || current.title) || '未命名世界',
      avatar:text(current.contact?.avatar),
      avatarAssetId:text(current.contact?.avatarAssetId),
      lastMessagePreview:worldMessagePreview(current),
      summary:worldMessagePreview(current) || '继续体验',
      lastChatAt:toTimestamp(current.lastChatAt),
      time:toTimestamp(current.lastChatAt),
      meta:'世界'
    }));
  }

  function ownedXWorldItems(contexts = []) {
    return mergeOwnedContexts([], contexts).map(current => clone(current.xWorldItem)).filter(item => item?.worldRunId);
  }

  function createContext(input = {}, options = {}) {
    const root = normalizeRoot(input);
    const run = root.run || {};
    const runId = text(root.runId || run.runId);
    const worldTemplateId = text(root.worldTemplateId || run.worldTemplateId);
    const worldVersionId = text(root.worldVersionId || run.worldVersionId || run.pinnedTemplateVersion);
    if (!runId || !worldTemplateId || !worldVersionId) throw new Error('WORLD_RUN_IDENTITY_INVALID');
    const world = root.world || {};
    const title = text(world.title || root.title) || '未命名世界';
    const promoAvatar = text(world.promoUrl || world.promoAssetId);
    const promoAssetId = text(world.promoAssetId);
    const background = text(world.backgroundUrl || world.backgroundAssetId);
    const contact = {
      type:'world_run', id:runId, conversationKey:`world_run:${runId}`, title,
      avatar:promoAvatar, avatarAssetId:promoAssetId,
      source:'simulator_world', replyMode:'ai', canUseDualMode:false
    };
    const participants = Array.isArray(root.participants) ? clone(root.participants) : (Array.isArray(root.roles) ? clone(root.roles) : []);
    const roleIdentityDirectory = normalizeRoleIdentityDirectory(root.roleIdentityDirectory,runId,worldVersionId);
    const rolePresentationCache = roleCache(roleIdentityDirectory,null,Array.isArray(root.messages) ? root.messages : [],runId,worldVersionId);
    const restoredMessages = (Array.isArray(root.messages) ? root.messages : [])
      .flatMap(message => expandStoredMessage({participants,runId,worldVersionId,roleIdentityDirectory,rolePresentationCache}, message));
    const entryVariables = applyVariableSnapshot({}, null, pickVariableValues(root, run), pickVariablesRevision(root, run));
    return {
      kind:'world_run',
      runId,
      conversationKey:`world_run:${runId}`,
      worldTemplateId,
      worldVersionId,
      surchargeEnergy:[2, 3, 4, 5].includes(Number(run.surchargeEnergy)) ? Number(run.surchargeEnergy) : null,
      updatedAt:toTimestamp(root.updatedAt || run.updatedAt),
      lastChatAt:toTimestamp(root.lastChatAt || run.lastChatAt),
      lastMessagePreview:text(root.lastMessagePreview || run.lastMessagePreview),
      terminalPreviewThrough:toTimestamp(root.terminalPreviewThrough),
      revision:Math.max(0, Number(root.revision || run.revision || 0)),
      title,
      world:clone(world),
      background,
      backgroundAssetId:text(world.backgroundAssetId),
      contact,
      xWorldItem:{
        kind:'world_run', worldRunId:runId, worldTemplateId, worldVersionId, title,
        background, avatar:promoAvatar, source:'simulator_world', locked:true
      },
      position:clone(root.position || run.position || {}),
      chapter:clone(root.chapter || {}),
      stage:clone(root.stage || {}),
      statePresentation:normalizeStatePresentation(root.statePresentation, root),
      completion:root.completion?.status === 'completed' ? clone(root.completion) : null,
      variableDefinitions:normalizeVariableDefinitions(pickVariableDefinitions(root, run)),
      variables:entryVariables.values,
      variablesRevision:entryVariables.revision,
      participants,
      roleIdentityDirectory,
      rolePresentationCache,
      messages:mergeMessages(restoredMessages),
      historyCursor:root.historyCursor ? text(root.historyCursor) : null,
      pendingRequest:null,
      sending:false,
      returnPage:text(options.returnPage || root.returnPage) || 'character-gallery'
    };
  }

  function worldPresentation(current = {}) {
    const world = current?.world && typeof current.world === 'object' ? current.world : {};
    const item = current?.xWorldItem && typeof current.xWorldItem === 'object' ? current.xWorldItem : {};
    return {
      title:text(world.title || item.title || current?.title) || '未命名世界',
      avatar:text(world.promoUrl || world.promoAssetId || item.avatar || current?.contact?.avatar),
      background:text(world.backgroundUrl || world.backgroundAssetId || item.background || current?.background)
    };
  }

  function applyHistoryPage(current, page = {}) {
    if (!current?.runId) throw new Error('WORLD_RUN_CONTEXT_MISSING');
    if (text(page.runId) && text(page.runId) !== text(current.runId)) throw new Error('WORLD_RUN_ID_MISMATCH');
    const records = (Array.isArray(page.items) ? page.items : []).filter(item => item?.type === 'world_dialogue' && item?.payload);
    const rolePresentationCache = roleCache(current.roleIdentityDirectory,current.rolePresentationCache,records,text(page.runId),current.worldVersionId);
    const identityCurrent = {...current,rolePresentationCache};
    const older = records.flatMap(item => expandStoredMessage(identityCurrent,item.payload,item.sequence));
    return {
      ...current,
      rolePresentationCache,
      messages:mergeMessages(current.messages || [], older),
      historyCursor:page.nextCursor ? text(page.nextCursor) : null
    };
  }

  function applyReply(current, payload = {}, userMessage = {}) {
    if (!current?.runId) throw new Error('WORLD_RUN_CONTEXT_MISSING');
    const simulatorRun = payload.simulatorRun || {};
    if (text(simulatorRun.runId) && text(simulatorRun.runId) !== text(current.runId)) throw new Error('WORLD_RUN_ID_MISMATCH');
    const trustedVersionId = text(simulatorRun.runId) === text(current.runId)
      && text(simulatorRun.worldVersionId) === text(current.worldVersionId) ? text(current.worldVersionId) : '';
    const reply = {...(payload.reply || {}),role:'assistant',worldVersionId:trustedVersionId};
    const rolePresentationCache = roleCache(current.roleIdentityDirectory,current.rolePresentationCache,[reply],text(simulatorRun.runId),trustedVersionId);
    const identityCurrent = {...current,rolePresentationCache};
    const user = normalizeMessage({ ...userMessage, role:'user' });
    // 直接回包在因果上晚于它所基于的状态，缺 revision 时照常应用；
    // 只有显式带着更低 revision 的回包才整组保留当前状态（消息仍然合并）。
    const replyRevision = Number(simulatorRun.revision);
    const replyStateIsStale = Number.isFinite(replyRevision) && replyRevision > 0 && replyRevision < runStateRevision(current);
    const requestId = text(payload.requestId || reply.requestId);
    const hasProvisionalIdentity = requestId && (
      text(current.pendingRequest?.requestId) === requestId
      || (current.messages || []).some(message => text(message?.requestId) === requestId
        && text(message?.id).startsWith(`${requestId}:reply:`))
    );
    const assistantMessages = expandAssistantReply(identityCurrent, {
      ...reply,
      requestId:hasProvisionalIdentity ? requestId : '',
      time:Number(reply.time || user.time || Date.now()) + 1
    });
    const nextPosition = clone(simulatorRun.position || current.position || {});
    const chapterId = text(nextPosition?.chapterId);
    const stageId = text(nextPosition?.stageId);
    const chapter = payload.chapter && typeof payload.chapter === 'object'
      ? clone(payload.chapter)
      : (chapterId && chapterId === text(current.chapter?.chapterId) ? clone(current.chapter) : { chapterId });
    const stage = payload.stage && typeof payload.stage === 'object'
      ? clone(payload.stage)
      : (stageId && stageId === text(current.stage?.stageId) ? clone(current.stage) : { stageId });
    if (replyStateIsStale) {
      return {
        ...current,
        rolePresentationCache,
        lastChatAt:Math.max(toTimestamp(current.lastChatAt), toTimestamp(payload.lastChatAt || simulatorRun.lastChatAt)),
        lastMessagePreview:text(payload.lastMessagePreview) || text(current.lastMessagePreview),
        messages:mergeMessages(current.messages || [], user.id ? [user] : [], assistantMessages),
        pendingRequest:null,
        sending:false
      };
    }
    // X103 Phase 2：每轮有新变量快照就换成权威值，没有就沿用；带 revision 时旧快照不得覆盖新的。
    const incomingDefinitions = pickVariableDefinitions(payload, simulatorRun);
    const nextVariables = applyVariableSnapshot(
      current.variables,
      current.variablesRevision,
      pickVariableValues(payload, simulatorRun),
      pickVariablesRevision(payload, simulatorRun)
    );
    return {
      ...current,
      rolePresentationCache,
      lastChatAt:Math.max(toTimestamp(current.lastChatAt), toTimestamp(payload.lastChatAt || simulatorRun.lastChatAt)),
      lastMessagePreview:text(payload.lastMessagePreview) || text(current.lastMessagePreview),
      revision:Math.max(Number(current.revision || 0), Number(simulatorRun.revision || 0)),
      position:nextPosition,
      chapter,
      stage,
      statePresentation:payload.statePresentation
        ? normalizeStatePresentation(payload.statePresentation, { chapter, stage })
        : clone(current.statePresentation),
      completion:payload.completion?.status === 'completed' ? clone(payload.completion) : clone(current.completion || null),
      variableDefinitions:hasEntries(incomingDefinitions)
        ? normalizeVariableDefinitions(incomingDefinitions)
        : (Array.isArray(current.variableDefinitions) ? current.variableDefinitions : []),
      variables:nextVariables.values,
      variablesRevision:nextVariables.revision,
      messages:mergeMessages(current.messages || [], user.id ? [user] : [], assistantMessages),
      pendingRequest:null,
      sending:false
    };
  }

  function canSendReply(current = {}) {
    return current?.kind === 'world_run' && Boolean(text(current.runId)) && current.completion?.status !== 'completed';
  }

  return Object.freeze({
    createContext, applyReply, applyHistoryPage, canSendReply, mergeMessages, runStateRevision, incomingStateIsStale, normalizeMessage, resolveSpeaker, presentSpeaker,
    expandAssistantReply, expandStoredMessage, toTimestamp, mergeOwnedContexts, reconcileOwnedRuntimeState, resolveXWorldAppearanceScope, ownedWorldRows, ownedXWorldItems,
    worldPresentation
  });
});
