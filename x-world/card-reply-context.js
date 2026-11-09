(function initCardReplyContext(global, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.SHEXCardReplyContext = api;
})(typeof window !== 'undefined' ? window : globalThis, function createCardReplyContextApi() {
  'use strict';

  const VERSION = 'card-reply-context-v2-x92';
  const text = (value) => String(value ?? '').trim();
  const result = (ok, reason = '') => ({ ok, reason });

  function freezeIdentity(value = {}) {
    return Object.freeze({
      selfName: text(value.selfName),
      userCode: text(value.userCode),
      taName: text(value.taName),
      taAvatar: text(value.taAvatar),
      userAvatar: text(value.userAvatar)
    });
  }

  function createIdentity(input = {}) {
    input = input && typeof input === 'object' ? input : {};
    const dreamId = text(input.dreamId);
    if (!dreamId) return null;
    return Object.freeze({
      dreamId,
      userCall: text(input.userCall).slice(0, 40),
      identity: freezeIdentity(input.identity)
    });
  }

  function restoreIdentity(input = {}) {
    return createIdentity(input);
  }

  function create(input = {}) {
    input = input && typeof input === 'object' ? input : {};
    const ownerId = text(input.ownerId);
    const conversationKey = text(input.conversationKey);
    const conversationType = text(input.conversationType);
    const dreamId = text(input.dreamId);
    const requestId = text(input.requestId);
    const createdAt = Math.max(0, Number(input.createdAt || 0) || 0);
    if (!ownerId || !dreamId || !requestId || !createdAt) return null;
    if (conversationType !== 'single') return null;
    if (conversationKey !== `single:${dreamId}`) return null;
    const userCall = text(input.userCall).slice(0, 40);
    return Object.freeze({
      version: VERSION,
      ownerId,
      conversationKey,
      conversationType,
      dreamId,
      userCall,
      identity: freezeIdentity(input.identity),
      requestId,
      createdAt
    });
  }

  function restore(input = {}) {
    return create(input);
  }

  function validateTarget(contextValue = {}, target = {}) {
    const context = restore(contextValue);
    if (!context) return result(false, 'context_invalid');
    if (text(target.ownerId) !== context.ownerId) return result(false, 'owner_changed');
    if (text(target.conversationKey) !== context.conversationKey) return result(false, 'conversation_mismatch');
    if (text(target.conversationType) !== context.conversationType) return result(false, 'conversation_type_mismatch');
    if (text(target.dreamId) !== context.dreamId) return result(false, 'dream_mismatch');
    if (target.dreamExists !== true) return result(false, 'dream_missing');
    if (target.conversationExists !== true) return result(false, 'conversation_missing');
    if (target.sourceMessageRequired !== false && target.sourceMessageExists !== true) {
      return result(false, 'source_message_missing');
    }
    return result(true);
  }

  function validateResponse(contextValue = {}, response = {}) {
    const context = restore(contextValue);
    if (!context) return result(false, 'context_invalid');
    if (text(response.requestId) !== context.requestId) return result(false, 'request_mismatch');
    if (text(response.conversationKey) !== context.conversationKey) return result(false, 'conversation_mismatch');
    if (text(response.chatType) !== context.conversationType) return result(false, 'conversation_type_mismatch');
    if (text(response.chatId) !== context.dreamId) return result(false, 'chat_mismatch');
    if (text(response.dreamId) !== context.dreamId) return result(false, 'dream_mismatch');
    const replies = Array.isArray(response.replies) ? response.replies : [];
    if (replies.some((reply) => text(reply?.dreamId || reply?.senderId) !== context.dreamId)) {
      return result(false, 'reply_dream_mismatch');
    }
    return result(true);
  }

  function createGroup(input = {}) {
    input = input && typeof input === 'object' ? input : {};
    const ownerId = text(input.ownerId);
    const conversationKey = text(input.conversationKey);
    const conversationType = text(input.conversationType);
    const groupId = text(input.groupId);
    const requestId = text(input.requestId);
    const createdAt = Math.max(0, Number(input.createdAt || 0) || 0);
    if (!ownerId || !groupId || !requestId || !createdAt) return null;
    if (conversationType !== 'group') return null;
    if (conversationKey !== `group:${groupId}`) return null;
    const members = Array.isArray(input.members)
      ? input.members.map((member) => createIdentity(member))
      : [];
    if (!members.length || members.some((member) => !member)) return null;
    const memberIds = members.map((member) => member.dreamId);
    if (new Set(memberIds).size !== memberIds.length) return null;
    return Object.freeze({
      version: VERSION,
      ownerId,
      conversationKey,
      conversationType,
      groupId,
      members: Object.freeze(members),
      requestId,
      createdAt
    });
  }

  function restoreGroup(input = {}) {
    return createGroup(input);
  }

  function sameMemberIds(contextMembers = [], targetIds = []) {
    const expected = contextMembers.map((member) => member.dreamId).sort();
    const actual = Array.isArray(targetIds) ? targetIds.map(text).filter(Boolean).sort() : [];
    return expected.length === actual.length
      && new Set(actual).size === actual.length
      && expected.every((dreamId, index) => dreamId === actual[index]);
  }

  function validateGroupTarget(contextValue = {}, target = {}) {
    const context = restoreGroup(contextValue);
    if (!context) return result(false, 'context_invalid');
    if (text(target.ownerId) !== context.ownerId) return result(false, 'owner_changed');
    if (text(target.conversationKey) !== context.conversationKey) return result(false, 'conversation_mismatch');
    if (text(target.conversationType) !== context.conversationType) return result(false, 'conversation_type_mismatch');
    if (text(target.groupId) !== context.groupId) return result(false, 'group_mismatch');
    if (target.groupExists !== true) return result(false, 'group_missing');
    if (target.conversationExists !== true) return result(false, 'conversation_missing');
    if (target.sourceMessageRequired !== false && target.sourceMessageExists !== true) {
      return result(false, 'source_message_missing');
    }
    if (!sameMemberIds(context.members, target.memberDreamIds)) return result(false, 'group_members_mismatch');
    return result(true);
  }

  function validateGroupResponse(contextValue = {}, response = {}) {
    const context = restoreGroup(contextValue);
    if (!context) return result(false, 'context_invalid');
    if (text(response.requestId) !== context.requestId) return result(false, 'request_mismatch');
    if (text(response.conversationKey) !== context.conversationKey) return result(false, 'conversation_mismatch');
    if (text(response.chatType) !== context.conversationType) return result(false, 'conversation_type_mismatch');
    if (text(response.chatId) !== context.groupId) return result(false, 'chat_mismatch');
    const allowedDreamIds = new Set(context.members.map((member) => member.dreamId));
    const replies = Array.isArray(response.replies) ? response.replies : [];
    if (replies.some((reply) => !allowedDreamIds.has(text(reply?.dreamId || reply?.senderId)))) {
      return result(false, 'reply_dream_mismatch');
    }
    return result(true);
  }

  return Object.freeze({
    VERSION,
    createIdentity,
    restoreIdentity,
    create,
    restore,
    validateTarget,
    validateResponse,
    createGroup,
    restoreGroup,
    validateGroupTarget,
    validateGroupResponse
  });
});
