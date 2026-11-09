(function initCharacterProfileLifecycle(global, factory) {
  const api = factory(global);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.SHEXCharacterProfileLifecycle = api;
})(typeof window !== 'undefined' ? window : globalThis, function createCharacterProfileLifecycle(runtimeGlobal) {
  'use strict';

  const LIFECYCLE_VERSION = 'character-profile-lifecycle-v3-x59-mixed-enforcement';
  const DEFAULT_ACTIVE_INSTANCE_LIMIT = 5;
  const DEFAULT_INSTANCE_POLICY = Object.freeze({
    maxActiveInstances: DEFAULT_ACTIVE_INSTANCE_LIMIT,
    allowPrivateCreation: true,
    allowTemplateDerivedCreation: true,
    enforcement: 'server_template_claim_client_private_creation'
  });

  function normalizeInstancePolicy(value) {
    const source = value && typeof value === 'object' ? value : {};
    const rawLimit = Object.prototype.hasOwnProperty.call(source, 'maxActiveInstances')
      ? source.maxActiveInstances
      : DEFAULT_INSTANCE_POLICY.maxActiveInstances;
    const parsedLimit = Number(rawLimit);
    const maxActiveInstances = rawLimit === null || rawLimit === 'unlimited'
      ? null
      : (Number.isFinite(parsedLimit) ? Math.max(0, Math.floor(parsedLimit)) : DEFAULT_ACTIVE_INSTANCE_LIMIT);
    return Object.freeze({
      maxActiveInstances,
      allowPrivateCreation: source.allowPrivateCreation !== false,
      allowTemplateDerivedCreation: source.allowTemplateDerivedCreation !== false,
      enforcement: String(source.enforcement || DEFAULT_INSTANCE_POLICY.enforcement)
    });
  }

  function resolveInstancePolicy(value) {
    const configured = value && typeof value === 'object'
      ? value
      : runtimeGlobal?.SHEX_CHARACTER_INSTANCE_POLICY;
    return normalizeInstancePolicy(configured);
  }

  function activeCharacterInstances(stateValue = {}) {
    const state = stateValue && typeof stateValue === 'object' ? stateValue : {};
    return (Array.isArray(state.dreams) ? state.dreams : [])
      .filter((dream) => dream && typeof dream === 'object' && String(dream.id || '').trim() && !Number(dream.deletedAt || 0));
  }

  // Compatibility name for the current dream-based product. “Private” is not a
  // permanent product restriction: future template-derived instances use the
  // same active-instance policy and can be enabled without changing call sites.
  const activePrivateInstances = activeCharacterInstances;

  function countActivePrivateInstances(stateValue = {}) {
    return activeCharacterInstances(stateValue).length;
  }

  function characterInstanceCreationDecision(stateValue = {}, policyValue, originValue = 'private_original') {
    const policy = resolveInstancePolicy(policyValue);
    const origin = String(originValue || 'private_original');
    const activeCount = countActivePrivateInstances(stateValue);
    if (origin === 'private_original' && !policy.allowPrivateCreation) {
      return Object.freeze({ allowed: false, code: 'PRIVATE_CREATION_DISABLED', origin, activeCount, policy });
    }
    if (origin === 'template_derived' && !policy.allowTemplateDerivedCreation) {
      return Object.freeze({ allowed: false, code: 'TEMPLATE_DERIVED_CREATION_DISABLED', origin, activeCount, policy });
    }
    if (policy.maxActiveInstances !== null && activeCount >= policy.maxActiveInstances) {
      return Object.freeze({ allowed: false, code: 'ACTIVE_INSTANCE_LIMIT_REACHED', origin, activeCount, policy });
    }
    return Object.freeze({ allowed: true, code: 'ALLOWED', origin, activeCount, policy });
  }

  function canCreatePrivateInstance(stateValue = {}, limitOrPolicy = DEFAULT_INSTANCE_POLICY) {
    const policy = typeof limitOrPolicy === 'number'
      ? { maxActiveInstances: limitOrPolicy }
      : limitOrPolicy;
    return characterInstanceCreationDecision(stateValue, policy, 'private_original').allowed;
  }

  function instanceCreationMessage(decisionValue = {}) {
    const decision = decisionValue && typeof decisionValue === 'object' ? decisionValue : {};
    if (decision.code === 'ACTIVE_INSTANCE_LIMIT_REACHED') {
      return `最多只能添加 ${decision.policy?.maxActiveInstances ?? DEFAULT_ACTIVE_INSTANCE_LIMIT} 位梦角`;
    }
    if (decision.code === 'PRIVATE_CREATION_DISABLED') return '当前暂未开放新增私人梦角';
    if (decision.code === 'TEMPLATE_DERIVED_CREATION_DISABLED') return '当前暂未开放从广场添加梦角';
    return decision.allowed ? '' : '角色数量规则暂不可用，请稍后重试';
  }

  function privateInstanceDeletionScope(stateValue = {}, dreamIdValue = '') {
    const dreamId = String(dreamIdValue || '').trim();
    const dream = activePrivateInstances(stateValue).find((item) => String(item.id || '') === dreamId) || null;
    return Object.freeze({
      dreamId,
      exists: Boolean(dream),
      templateId: String(dream?.templateId || ''),
      deletePrivateInstance: Boolean(dream),
      deletePublicTemplate: false
    });
  }

  return Object.freeze({
    LIFECYCLE_VERSION,
    DEFAULT_ACTIVE_INSTANCE_LIMIT,
    DEFAULT_INSTANCE_POLICY,
    normalizeInstancePolicy,
    resolveInstancePolicy,
    activeCharacterInstances,
    activePrivateInstances,
    countActivePrivateInstances,
    characterInstanceCreationDecision,
    canCreatePrivateInstance,
    instanceCreationMessage,
    privateInstanceDeletionScope
  });
});
