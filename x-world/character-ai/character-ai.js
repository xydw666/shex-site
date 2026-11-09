(function initCharacterAI(global, factory) {
  const api = factory(global);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.SHEXCharacterAI = api;
})(typeof window !== 'undefined' ? window : globalThis, function createCharacterAI(global) {
  'use strict';

  const REPLY_MODES = new Set(['library', 'ai']);
  const PROMPT_CONTRACTS = new Set(['F', 'L', 'O']);
  const catalogSource = global?.SHEXCharacterAIModelCatalog
    || (typeof require === 'function' ? require('./model-catalog.generated.js') : null);
  if (!catalogSource?.models?.length) throw new Error('character AI model catalog is missing');
  const DEFAULT_MODEL_TIER = String(catalogSource.defaultModelId || 'deepseek_flash');
  const LEGACY_MODEL_ALIASES = Object.freeze({ ...(catalogSource.legacyAliases || {}) });
  const MODEL_TIERS = Object.freeze(catalogSource.models.map((model) => Object.freeze({
    ...model,
    labels: Object.freeze([...(model.labels || [])])
  })));
  const MODEL_TIER_BY_ID = Object.freeze(Object.fromEntries(MODEL_TIERS.map((tier) => [tier.id, tier])));
  const DEFAULT_FREE_MODEL_IDS = Object.freeze(['mimo_v25', 'deepseek_flash']);
  const SPECIAL_CHAT_MODES = new Set(['english', 'tarot', 'lenormand']);
  const MESSAGE_MAX_CHARACTERS = 1200;
  const REPLY_MAX_CHARACTERS = 1800;
  const MODEL_SELECTION_PAGE_SIZE = 4;
  const STREAM_ENDPOINT_META_NAME = 'shex-character-ai-stream-url';
  const SEGMENT_STREAM_PROTOCOL = 'segment-delta-v1';
  const EXECUTION_REQUEST_PROTOCOL = 'shex-ai-execution-request-v1';
  const SUPPORTED_INJECTION_VIEWER_SCHEMAS = new Set([
    'injection-viewer-v1',
    'injection-viewer-v2-w5-authority-core'
  ]);
  const segmentStreamClient = global?.SHEXSegmentStreamClient
    || (typeof require === 'function' ? require('./segment-stream-client.js') : null);
  const unavailableStreamEndpoints = new Set();
  const sessionServerExecutionProbeCache = new Map();
  let cachedStreamTransportSupport;
  const TERMINAL_CODES = new Set([
    'CHARACTER_AI_ADMIN_ONLY',
    'AI_REQUEST_ID_CONFLICT',
    'ENERGY_REQUEST_MISMATCH',
    'AI_REQUEST_TERMINAL_FAILED',
    'AI_RESPONSE_REQUEST_ID_MISMATCH'
  ]);
  const VALIDATION_CODES = new Set([
    'INVALID_ARGUMENT',
    'WORLD_RUN_MODEL_NOT_AVAILABLE',
    'INVALID_REQUEST_ID',
    'INVALID_MESSAGE_TEXT',
    'INVALID_PROMPT_CONTRACT',
    'DREAM_NOT_FOUND',
    'SESSION_EXPIRED'
  ]);
  const ADMIN_MANAGER_ACTIONS = new Set([
    'adminGetInteractionState',
    'adminUpdateScene',
    'adminResetScene',
    'adminTransitionPlan',
    'adminGetPendingFacts',
    'adminRemovePendingFact',
    'adminListMemories',
    'adminGetMemory',
    'adminCorrectMemory',
    'adminUpdateMemoryFields',
    'adminTransitionMemory'
  ]);

  function messagePayload(messageValue = {}) {
    const message = messageValue && typeof messageValue === 'object' ? messageValue : {};
    const payload = message.payload && typeof message.payload === 'object' && !Array.isArray(message.payload)
      ? message.payload
      : null;
    return payload && Object.keys(payload).length ? payload : message;
  }

  function isConfirmedAICharacterReply(messageValue = {}) {
    const message = messagePayload(messageValue);
    const role = String(message.role || messageValue?.role || '').trim().toLowerCase();
    if (!['ta', 'assistant', 'character'].includes(role)) return false;
    const sourceMode = String(message.sourceMode || '').trim().toLowerCase();
    const sourceType = String(message.sourceType || '').trim().toLowerCase();
    const sourceRoute = String(message.sourceRoute || '').trim().toLowerCase();
    const sourceCategory = String(message.sourceCategory || '').trim().toLowerCase();
    if (sourceMode === 'ai' || sourceType === 'ai') return true;
    if (/^(?:shex_)?character[_-]ai(?:[_-]|$)/.test(sourceRoute)) return true;
    return sourceCategory === 'character_ai'
      && Boolean(message.promptVersion || message.modelProvider || message.modelName);
  }

  function filterCardContextMessages(messagesValue = [], enabled = false) {
    const messages = Array.isArray(messagesValue) ? messagesValue : [];
    return enabled ? messages.filter((message) => !isConfirmedAICharacterReply(message)) : messages.slice();
  }

  function supportsInjectionViewerDiagnostics(value) {
    return Boolean(value && typeof value === 'object'
      && SUPPORTED_INJECTION_VIEWER_SCHEMAS.has(String(value.schemaVersion || '')));
  }

  function normalizeReplyMode(value) {
    const mode = String(value || '').trim().toLowerCase();
    return REPLY_MODES.has(mode) ? mode : 'library';
  }

  function isGalleryCharacter(dream = {}) {
    return String(dream?.origin || '').trim().toLowerCase() === 'template_derived'
      && Boolean(String(dream?.characterInstanceId || dream?.id || '').trim());
  }

  function normalizeModelTier(value) {
    const requested = String(value || '').trim().toLowerCase();
    const tier = LEGACY_MODEL_ALIASES[requested] || requested;
    return MODEL_TIER_BY_ID[tier] ? tier : DEFAULT_MODEL_TIER;
  }

  function modelTier(value) {
    return MODEL_TIER_BY_ID[normalizeModelTier(value)];
  }

  function modelReplyEnergy(value, options = {}) {
    // X103：模拟器附加价由当前 WorldVersion 下发（+2/+3/+4/+5），所有模型同一套。
    const surcharge = [2, 3, 4, 5].includes(Number(options.surchargeEnergy)) ? Number(options.surchargeEnergy) : 2;
    return modelTier(value).energy + (options.worldRun === true ? surcharge : 0);
  }

  function isWorldRunModelAllowed(value) {
    return modelTier(value).worldRunEnabled === true;
  }

  function isModelAllowed(value, planData = {}, isAdmin = false) {
    if (isAdmin === true || planData?.isAdmin === true) return true;
    const modelId = normalizeModelTier(value);
    const access = planData?.membershipEntitlements?.capabilities?.characterAIModelAccess;
    if (access?.mode === 'all_enabled') return true;
    const allowedModelIds = Array.isArray(access?.allowedModelIds)
      ? access.allowedModelIds
      : DEFAULT_FREE_MODEL_IDS;
    return allowedModelIds.includes(modelId);
  }

  function effectiveModelTier(value, planData = {}, isAdmin = false) {
    return isModelAllowed(value, planData, isAdmin)
      ? modelTier(value)
      : MODEL_TIER_BY_ID[DEFAULT_MODEL_TIER];
  }

  // X103：模拟器的推荐模型里，第一位 MiMo 换成 Qwen 3.7 Plus（模拟器需要严格结构化输出）；其他场景不变。
  const WORLD_RUN_RECOMMENDED_REPLACEMENTS = Object.freeze({ mimo_v25: 'qwen_plus' });

  function modelSelectionPages(options = {}) {
    const baseRecommended = MODEL_TIERS
      .filter((tier) => tier.recommended === true)
      .sort((left, right) => Number(left.recommendedRank || 0) - Number(right.recommendedRank || 0));
    const recommended = (options.worldRun === true
      ? baseRecommended.map((tier) => MODEL_TIER_BY_ID[WORLD_RUN_RECOMMENDED_REPLACEMENTS[tier.id]] || tier)
        .filter((tier, index, list) => tier?.worldRunEnabled === true && list.findIndex((item) => item.id === tier.id) === index)
      : baseRecommended)
      .slice(0, MODEL_SELECTION_PAGE_SIZE);
    const remaining = MODEL_TIERS
      .filter((tier) => options.worldRun !== true || tier.worldRunEnabled === true)
      .map((tier, sourceIndex) => ({ tier, sourceIndex }))
      .sort((left, right) => {
        const energyDifference = Number(left.tier.energy || 0) - Number(right.tier.energy || 0);
        if (energyDifference) return energyDifference;
        return left.sourceIndex - right.sourceIndex;
      })
      .map(({ tier }) => tier);
    const pages = [{ kind: 'recommended', title: '推荐模型', models: recommended }];
    for (let index = 0; index < remaining.length; index += MODEL_SELECTION_PAGE_SIZE) {
      const models = remaining.slice(index, index + MODEL_SELECTION_PAGE_SIZE);
      pages.push({
        kind: 'other',
        title: '其他模型',
        models
      });
    }
    return pages;
  }

  function effectiveReplyMode(dream = {}, aiEnabled = false) {
    if (aiEnabled !== true) return 'library';
    if (isGalleryCharacter(dream)) return 'ai';
    return normalizeReplyMode(dream?.replyMode) === 'ai' ? 'ai' : 'library';
  }

  function promptContractForDream(dreamValue = {}) {
    const dream = dreamValue && typeof dreamValue === 'object' ? dreamValue : {};
    const hasOnlineMode = Object.prototype.hasOwnProperty.call(dream, 'aiOnlineMode');
    const onlineMode = hasOnlineMode ? dream.aiOnlineMode === true : dream.aiActionMode === false;
    if (onlineMode) return 'O';
    return dream.aiLongformMode === true ? 'L' : 'F';
  }

  function normalizePromptContract(value) {
    const contract = String(value || '').trim().toUpperCase();
    if (!contract) return '';
    if (!PROMPT_CONTRACTS.has(contract)) {
      throw createError('INVALID_PROMPT_CONTRACT', 'AI回复模式无效，请重新发送');
    }
    return contract;
  }

  function shouldUseAI(options = {}) {
    const aiEnabled = options.aiEnabled === true || options.isAdmin === true;
    return aiEnabled
      && normalizeReplyMode(options.replyMode) === 'ai'
      && String(options.conversationKind || '') === 'single'
      && !SPECIAL_CHAT_MODES.has(String(options.chatMode || '').trim().toLowerCase())
      && !options.media;
  }

  function validateMessageText(value) {
    const text = String(value || '').trim();
    const length = Array.from(text).length;
    if (!length) return { ok: false, code: 'INVALID_MESSAGE_TEXT', message: '消息不能为空', text, length };
    if (length > MESSAGE_MAX_CHARACTERS) {
      return {
        ok: false,
        code: 'INVALID_MESSAGE_TEXT',
        message: `AI聊天单条消息最多${MESSAGE_MAX_CHARACTERS}个字符，请拆分后发送`,
        text,
        length
      };
    }
    return { ok: true, code: '', message: '', text, length };
  }

  function classifyError(errorOrCode) {
    const code = String(typeof errorOrCode === 'string' ? errorOrCode : errorOrCode?.code || '').trim() || 'CHARACTER_AI_FAILED';
    if (code === 'AI_REQUEST_IN_PROGRESS') return { code, kind: 'processing', retriable: true, autoRetry: true, terminal: false };
    if (code === 'ENERGY_NOT_ENOUGH') return { code, kind: 'energy', retriable: true, autoRetry: false, terminal: false };
    if (code.startsWith('DIRECT_')
      || code.startsWith('AIHUBMIX_')
      || code.startsWith('MOONSHOT_')
      || code.startsWith('QWEN_')
      || code.startsWith('MIMO_')
      || code.startsWith('ARK_')
      || code.startsWith('EXECUTION_')
      || code === 'AI_EXECUTION_NOT_CONFIGURED'
      || code.startsWith('FINALIZE_')
      || code.startsWith('COMPLETION_RECEIPT_')
      || code.startsWith('CHARACTER_AI_STREAM_')) {
      return { code, kind: 'manual_retry', retriable: true, autoRetry: false, terminal: false };
    }
    if (TERMINAL_CODES.has(code)) return { code, kind: 'terminal', retriable: false, autoRetry: false, terminal: true };
    if (VALIDATION_CODES.has(code)) return { code, kind: 'validation', retriable: false, autoRetry: false, terminal: true };
    return { code, kind: 'retryable', retriable: true, autoRetry: true, terminal: false };
  }

  function failureNotice(errorOrCode) {
    const sourceCode = String(typeof errorOrCode === 'string'
      ? errorOrCode
      : errorOrCode?.code || '').trim() || 'CHARACTER_AI_FAILED';
    let line1 = '未知错误（AI-U01）';

    const exactMessages = {
      CLOUDBASE_SDK_LOAD_FAILED: '云服务组件加载失败（AI-C01）',
      CLOUDBASE_SDK_TIMEOUT: '云服务组件加载超时（AI-C02）',
      CLOUDBASE_AUTH_NOT_READY: '云服务鉴权准备失败（AI-C03）',
      CLOUDBASE_AUTH_BUSY: '云服务鉴权正在被占用（AI-C04）',
      CLOUDBASE_PHONE_IDENTITY_TRANSITION: '手机号验证尚未结束（AI-C05）',
      CLOUDBASE_AUTH_COOLDOWN: '云服务鉴权暂时受限（AI-C06）',
      CLOUDBASE_REAUTH_FAILED: '云服务重新鉴权失败（AI-C07）',
      CLOUDBASE_AUTH_SUPERSEDED: '云服务鉴权被刷新打断（AI-C08）',
      SESSION_EXPIRED: '登录状态已失效（AI-A01）',
      CHARACTER_AI_ADMIN_ONLY: 'AI回复权限未通过（AI-P01）',
      DREAM_NOT_FOUND: '梦角资料不存在（AI-D01）',
      INVALID_ARGUMENT: 'AI任务参数不完整（AI-D02）',
      INVALID_REQUEST_ID: 'AI任务编号无效（AI-D03）',
      INVALID_MESSAGE_TEXT: '消息内容不符合要求（AI-M01）',
      INVALID_PROMPT_CONTRACT: 'AI聊天模式参数异常（AI-M02）',
      CHARACTER_AI_NETWORK_FAILED: 'AI服务连接失败（AI-N01）',
      AI_EXECUTION_PREPARE_FAILED: 'AI任务准备失败（AI-N02）',
      AI_EXECUTION_PREPARE_INVALID: 'AI任务准备结果异常（AI-N08）',
      CHARACTER_AI_UNAVAILABLE: 'AI聊天服务暂不可用（AI-N07）',
      ENERGY_NOT_ENOUGH: 'X能量不足（AI-E01）',
      AI_EMPTY_RESPONSE: 'AI没有返回有效内容（AI-R01）',
      AI_RESPONSE_REQUEST_ID_MISMATCH: 'AI回复校验不一致（AI-R02）',
      AI_REQUEST_ID_CONFLICT: 'AI回复任务状态冲突（AI-R03）',
      ENERGY_REQUEST_MISMATCH: 'AI回复任务状态冲突（AI-R03）',
      AI_REQUEST_TERMINAL_FAILED: 'AI回复任务状态冲突（AI-R03）',
      REPLY_TASK_INTERRUPTED: 'AI回复流程被中断（AI-T01）',
      AI_REQUEST_IN_PROGRESS: 'AI回复仍在生成（AI-T02）',
      LOCAL_CHAT_SAVE_FAILED: '聊天消息保存失败（AI-S01）'
    };

    if (exactMessages[sourceCode]) line1 = exactMessages[sourceCode];
    else if (/_TIMEOUT$/.test(sourceCode) || sourceCode === 'DIRECT_TIMEOUT') line1 = 'AI模型请求超时（AI-N03）';
    else if (/_RATE_LIMITED$/.test(sourceCode)) line1 = 'AI请求过于频繁（AI-N04）';
    else if (/_UPSTREAM_UNAVAILABLE$/.test(sourceCode)) line1 = 'AI模型服务暂时不可用（AI-N05）';
    else if (/(?:MODEL_FORBIDDEN|ACCESS_FORBIDDEN|API_KEY_MISSING|AUTH_FAILED|BALANCE_LOW)$/.test(sourceCode)) {
      line1 = '当前AI模型不可用（AI-N06）';
    }
    else if (/^EXECUTION_ENVELOPE_/.test(sourceCode)) line1 = 'AI服务配置不一致（AI-N11）';
    else if (sourceCode === 'AI_EXECUTION_NOT_CONFIGURED') line1 = 'AI服务器尚未启用（AI-N12）';
    else if (sourceCode === 'CHARACTER_AI_STREAM_UNSUPPORTED') line1 = '当前设备不支持流式回复（AI-N13）';
    else if (/^CHARACTER_AI_STREAM_HTTP_/.test(sourceCode)) line1 = 'AI流式服务响应异常（AI-N14）';
    else if (/^(?:FINALIZE_|COMPLETION_RECEIPT_)/.test(sourceCode)) line1 = 'AI回复保存异常（AI-N15）';
    else if (/^(?:CHARACTER_AI_STREAM_|SEGMENT_STREAM_)/.test(sourceCode)) line1 = 'AI流式连接异常（AI-N09）';
    else if (/^(?:FETCH_FAILED|NETWORK_ERROR|ECONNRESET|ETIMEDOUT)$/.test(sourceCode)) line1 = 'AI网络连接中断（AI-N10）';

    const line2 = '请截图给管理员';
    return Object.freeze({
      line1,
      line2,
      text: `${line1}\n${line2}`,
      durationMs: 2000,
      sourceCode
    });
  }

  function createError(code, message, extra = {}) {
    const classification = classifyError(code);
    return Object.assign(new Error(String(message || 'AI回复生成失败，请稍后重试')), classification, { characterAI: true }, extra);
  }

  function streamEndpoint(options = {}) {
    const explicit = String(options.streamEndpoint || '').trim();
    const runtimeConfigured = String(global?.SHEX_CLOUDBASE_CONFIG?.characterAIStreamUrl || '').trim();
    const configured = explicit || runtimeConfigured || String(
      global?.document?.querySelector?.(`meta[name="${STREAM_ENDPOINT_META_NAME}"]`)?.content || ''
    ).trim();
    if (!configured || unavailableStreamEndpoints.has(configured)) return '';
    if (/^(?:https?:\/\/|\/)/i.test(configured)) return configured;
    return '';
  }

  function serverExecutionEndpoint(options = {}) {
    const explicit = String(options.serverExecutionEndpoint || '').trim();
    const configured = String(global?.SHEX_CLOUDBASE_CONFIG?.characterAIServerUrl || '').trim();
    const enabled = options.serverExecutionEnabled === true
      || (options.serverExecutionEnabled !== false && global?.SHEX_CLOUDBASE_CONFIG?.characterAIServerEnabled === true);
    const endpoint = explicit || (enabled ? configured : '');
    if (!endpoint || !/^https:\/\//i.test(endpoint)) return '';
    return endpoint;
  }

  function streamTransportSupported(options = {}) {
    if (typeof options.streamTransportSupported === 'boolean') return options.streamTransportSupported;
    const hasExplicitScope = Boolean(options.streamTransportScope);
    if (!hasExplicitScope && typeof cachedStreamTransportSupport === 'boolean') return cachedStreamTransportSupport;
    const scope = options.streamTransportScope || global;
    try {
      if (typeof scope?.fetch !== 'function'
        || typeof scope?.TextDecoder !== 'function'
        || typeof scope?.Response !== 'function') {
        if (!hasExplicitScope) cachedStreamTransportSupport = false;
        return false;
      }
      const response = new scope.Response(new Uint8Array([0]));
      const supported = typeof response?.body?.getReader === 'function';
      if (!hasExplicitScope) cachedStreamTransportSupport = supported;
      return supported;
    } catch (_) {
      if (!hasExplicitScope) cachedStreamTransportSupport = false;
      return false;
    }
  }

  async function serverExecutionReachable(options = {}, endpoint = '') {
    const normalizedEndpoint = String(endpoint || '').trim();
    if (!normalizedEndpoint) return false;
    const cache = options.serverExecutionProbeCache instanceof Map
      ? options.serverExecutionProbeCache
      : sessionServerExecutionProbeCache;
    if (cache.has(normalizedEndpoint)) return Boolean(await cache.get(normalizedEndpoint));
    const fetcher = options.fetch || global?.fetch?.bind(global);
    if (typeof fetcher !== 'function') return false;
    const timeoutMs = Math.max(500, Math.min(5000, Number(options.serverExecutionProbeTimeoutMs || 2500)));
    let timeoutId = null;
    const probe = Promise.race([
      Promise.resolve().then(() => fetcher(normalizedEndpoint, {
        method: 'OPTIONS',
        headers: { Accept: 'text/event-stream' },
        credentials: 'omit',
        cache: 'no-store'
      })).then((response) => response?.ok === true || Number(response?.status || 0) === 204),
      new Promise((resolve) => { timeoutId = global.setTimeout(() => resolve(false), timeoutMs); })
    ]).catch(() => false).finally(() => {
      if (timeoutId !== null && typeof global?.clearTimeout === 'function') global.clearTimeout(timeoutId);
    }).then((reachable) => {
      const result = reachable === true;
      cache.set(normalizedEndpoint, result);
      return result;
    });
    cache.set(normalizedEndpoint, probe);
    return probe;
  }

  function createSSEParser(onEvent) {
    let buffer = '';
    function consumeFrame(frame) {
      const lines = String(frame || '').split('\n');
      let eventName = 'message';
      const data = [];
      lines.forEach((line) => {
        if (line.startsWith('event:')) eventName = line.slice(6).trim() || 'message';
        if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
      });
      if (data.length) onEvent(eventName, data.join('\n'));
    }
    return {
      push(value) {
        buffer += String(value || '');
        buffer = buffer.replace(/\r\n/g, '\n');
        let boundary;
        while ((boundary = buffer.indexOf('\n\n')) >= 0) {
          consumeFrame(buffer.slice(0, boundary));
          buffer = buffer.slice(boundary + 2);
        }
      },
      end() {
        if (buffer.trim()) consumeFrame(buffer);
        buffer = '';
      }
    };
  }

  function requestDataFromOptions(options, checked) {
    const promptContract = normalizePromptContract(options.promptContract);
    const worldRun = String(options.requestKind || '').trim().toLowerCase() === 'world_run';
    return {
      action: 'generateReply',
      userId: options.user.userId,
      sessionToken: options.user.sessionToken,
      ...(worldRun ? {
        requestKind:'world_run',
        runId:String(options.runId || '').trim(),
        worldTemplateId:String(options.worldTemplateId || '').trim(),
        ...(options.worldVersionId ? { worldVersionId:String(options.worldVersionId).trim() } : {})
      } : { dreamId:String(options.dreamId || '').trim() }),
      messageId: String(options.messageId || '').trim(),
      requestId: String(options.requestId || '').trim(),
      messageText: checked.text,
      ...(options.petRuntimeContext ? {petRuntimeContext: options.petRuntimeContext} : {}),
      ...(options.ludoRuntimeContext ? {ludoRuntimeContext: options.ludoRuntimeContext} : {}),
      ...(options.requestKind === 'pet_event' ? {requestKind: 'pet_event'} : {}),
      ...(promptContract ? { promptContract } : {}),
      ...(typeof options.onSegmentDelta === 'function' ? { previewProtocol: SEGMENT_STREAM_PROTOCOL } : {}),
      ...(options.debugMemory === true ? { debugMemory: true } : {}),
      ...(options.modelTier ? { modelTier: normalizeModelTier(options.modelTier) } : {})
    };
  }

  function validateReplyPayload(payload, requestId) {
    if (!payload?.ok) throw createError(payload?.code || 'CHARACTER_AI_FAILED', payload?.message || 'AI回复生成失败，请稍后重试');
    if (String(payload.requestId || '') !== requestId) {
      throw createError('AI_RESPONSE_REQUEST_ID_MISMATCH', 'AI回复任务编号不匹配，请重新发送');
    }
    return payload;
  }

  async function streamHttpFailure(response) {
    const status = Math.max(0, Number(response?.status || 0));
    let payload = {};
    try {
      if (typeof response?.text === 'function') {
        const raw = await response.text();
        payload = raw ? JSON.parse(raw) : {};
      } else if (typeof response?.json === 'function') {
        payload = await response.json();
      }
    } catch (_) {
      payload = {};
    }
    const sourceCode = String(payload?.code || '').trim().toUpperCase();
    const code = /^[A-Z][A-Z0-9_]{2,80}$/.test(sourceCode)
      ? sourceCode
      : `CHARACTER_AI_STREAM_HTTP_${status || 'ERROR'}`;
    const message = String(payload?.message || payload?.detail || `AI流式服务返回异常（${status || '未知状态'}）`).slice(0, 160);
    return { code, message, status };
  }

  async function generateReplyStreaming(options, requestData, transport = {}) {
    const endpoint = String(transport.endpoint || streamEndpoint(options)).trim();
    const requestBody = transport.body || requestData;
    const fetcher = options.fetch || global?.fetch?.bind(global);
    if (!endpoint || typeof fetcher !== 'function' || typeof global?.TextDecoder !== 'function') {
      throw createError('CHARACTER_AI_STREAM_UNAVAILABLE', '流式回复入口暂不可用', { fallbackAllowed: true });
    }
    let response;
    try {
      response = await fetcher(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify(requestBody),
        credentials: 'omit'
      });
    } catch (error) {
      throw createError('CHARACTER_AI_STREAM_UNAVAILABLE', error?.message || '流式回复连接失败', { fallbackAllowed: false });
    }
    if (!response?.ok) {
      const status = Number(response?.status || 0);
      const safelyUnavailable = transport.allowLegacyFallback !== false && [404, 405, 501].includes(status);
      if (safelyUnavailable) unavailableStreamEndpoints.add(endpoint);
      const failure = await streamHttpFailure(response);
      throw createError(failure.code, failure.message, {
        autoRetry: false,
        fallbackAllowed: safelyUnavailable,
        manualRetry: true,
        statusCode: failure.status
      });
    }
    if (!response.body?.getReader) {
      throw createError('CHARACTER_AI_STREAM_UNSUPPORTED', '当前设备无法读取流式回复', {
        autoRetry: false,
        fallbackAllowed: false,
        manualRetry: true
      });
    }
    const reader = response.body.getReader();
    const decoder = new global.TextDecoder('utf-8');
    const segmentAccumulator = requestData.previewProtocol === SEGMENT_STREAM_PROTOCOL
      ? segmentStreamClient?.createAccumulator?.({ requestId: requestData.requestId })
      : null;
    if (requestData.previewProtocol === SEGMENT_STREAM_PROTOCOL && !segmentAccumulator) {
      throw createError('CHARACTER_AI_STREAM_UNAVAILABLE', '流式分段组件暂不可用', { fallbackAllowed: false });
    }
    let finalPayload = null;
    let terminalError = null;
    const parser = createSSEParser((eventName, rawData) => {
      let data = {};
      try { data = JSON.parse(rawData); } catch (_) {
        terminalError = createError('CHARACTER_AI_STREAM_INVALID', '流式回复数据异常，请稍后重试');
        return;
      }
      if (eventName === 'ready') {
        if (String(data?.requestId || '') !== requestData.requestId) {
          terminalError = createError('AI_RESPONSE_REQUEST_ID_MISMATCH', '流式回复任务编号不匹配，请重新发送');
        } else if (requestData.previewProtocol === SEGMENT_STREAM_PROTOCOL
          && String(data?.protocol || '') !== SEGMENT_STREAM_PROTOCOL) {
          terminalError = createError('SEGMENT_STREAM_PROTOCOL_MISMATCH', '流式服务版本尚未更新，请稍后重试');
        } else if (typeof options.onStreamReady === 'function') {
          options.onStreamReady(data);
        }
      } else if (eventName === 'segment') {
        if (!segmentAccumulator) {
          terminalError = createError('SEGMENT_STREAM_PROTOCOL_MISMATCH', '收到未协商的流式分段事件');
          return;
        }
        try {
          const applied = segmentAccumulator.apply(data);
          if (applied.applied && typeof options.onSegmentDelta === 'function') {
            options.onSegmentDelta(applied.event, applied.segments);
          }
        } catch (error) {
          terminalError = createError(error?.code || 'CHARACTER_AI_STREAM_INVALID', error?.message || '流式回复数据异常');
        }
      } else if (eventName === 'preview') {
        const preview = Array.from(String(data?.text || '')).slice(0, REPLY_MAX_CHARACTERS).join('');
        const previewSegments = normalizeReplySegments(data?.segments);
        if (preview && typeof options.onPreview === 'function') options.onPreview(preview, previewSegments);
      } else if (eventName === 'done') {
        finalPayload = data;
        if (typeof options.onStreamDone === 'function') options.onStreamDone(data);
      } else if (eventName === 'error') {
        terminalError = createError(data?.code || 'CHARACTER_AI_FAILED', data?.message || 'AI回复生成失败，请稍后重试');
      } else if (eventName === 'aborted') {
        terminalError = createError('CHARACTER_AI_STREAM_ABORTED', data?.message || '本次回复已停止');
      }
    });
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        parser.push(decoder.decode(value, { stream: true }));
        if (terminalError) break;
      }
      parser.push(decoder.decode());
      parser.end();
    } catch (error) {
      throw createError('CHARACTER_AI_STREAM_INTERRUPTED', error?.message || '流式回复连接中断', { fallbackAllowed: false });
    } finally {
      try { reader.releaseLock?.(); } catch (_) {}
    }
    if (terminalError) throw terminalError;
    if (!finalPayload) throw createError('CHARACTER_AI_STREAM_INTERRUPTED', '流式回复连接提前结束', { fallbackAllowed: false });
    const validated = validateReplyPayload(finalPayload, requestData.requestId);
    if (segmentAccumulator && segmentAccumulator.snapshot().length) {
      const streamed = JSON.stringify(normalizeReplySegments(segmentAccumulator.snapshot()));
      const finalized = JSON.stringify(normalizeReplySegments(validated?.reply?.segments));
      if (streamed !== finalized) {
        // X103 稳定性：WorldRun 回复在此时已由服务器提交（validateReplyPayload 已确认 ok 且
        // requestId 一致）。服务器对分段做合法规整不能让整轮被判失败——终稿才是权威，
        // 流式只是预览。只记录诊断标记，把终稿交给调用方正常落地。普通单聊合同不变。
        if (isWorldRunRequest(options)) return { ...validated, streamFinalMismatch:true };
        throw createError('SEGMENT_STREAM_FINAL_MISMATCH', '流式内容与最终消息不一致，请稍后重试', { serverCommitted:true });
      }
    }
    return validated;
  }

  async function prepareReplyExecution(options, requestData) {
    let result;
    try {
      result = await options.app.callFunction({
        name: 'shexCharacterAI',
        data: { ...requestData, action: 'prepareReplyExecution' }
      });
    } catch (error) {
      throw createError(error?.code || 'AI_EXECUTION_PREPARE_FAILED', error?.message || 'AI服务器工作单准备失败');
    }
    return validateReplyPayload(result?.result || result || {}, requestData.requestId);
  }

  async function generateReplyOnServer(options, requestData, endpoint) {
    const prepared = await prepareReplyExecution(options, requestData);
    if (prepared.executionRequired === false && prepared.reply) return prepared;
    if (prepared.executionRequired !== true || !prepared.envelope) {
      throw createError('AI_EXECUTION_PREPARE_INVALID', 'AI服务器工作单准备结果无效');
    }
    const logicalRequest = { ...requestData, previewProtocol: SEGMENT_STREAM_PROTOCOL };
    return generateReplyStreaming(options, logicalRequest, {
      endpoint,
      allowLegacyFallback: false,
      body: {
        protocolVersion: EXECUTION_REQUEST_PROTOCOL,
        envelope: prepared.envelope
      }
    });
  }

  function normalizeReplySegments(values = []) {
    const allowed = new Set(['scene', 'action', 'dialogue']);
    let charactersLeft = REPLY_MAX_CHARACTERS;
    return (Array.isArray(values) ? values : []).slice(0, 40).reduce((result, value) => {
      if (charactersLeft <= 0) return result;
      const type = String(value?.type || '').trim().toLowerCase();
      const text = Array.from(String(value?.text || '').replace(/<\/?(?:scene|action|dialogue)>/gi, '').trim()).slice(0, charactersLeft).join('');
      if (!allowed.has(type) || !text) return result;
      charactersLeft -= Array.from(text).length;
      result.push({
        ...(value?.segmentId !== undefined && value?.segmentId !== null
          ? { segmentId: String(value.segmentId) }
          : {}),
        type,
        text
      });
      return result;
    }, []);
  }

  function isWorldRunRequest(options = {}) {
    return String(options?.requestKind || '').trim().toLowerCase() === 'world_run';
  }

  // WorldRun 的回复内容可以只在 speakerTurns 里（旁白/多角色分段），顶层 text 并非必需。
  // 只有 text 与所有 speakerTurns 都为空，才算真正的空回复。
  function worldRunReplyHasContent(reply = {}) {
    if (String(reply?.text || '').trim()) return true;
    return Array.isArray(reply?.speakerTurns)
      && reply.speakerTurns.some(turn => turn && String(turn.text || '').trim());
  }

  function descriptorFromReply(reply = {}, dreamId = '', options = {}) {
    const text = String(reply?.text || '').trim();
    if (!text) throw createError('AI_EMPTY_RESPONSE', 'AI没有返回有效回复，请稍后重试');
    const payload = {
      role: 'ta',
      text,
      sourceType: String(reply.sourceType || 'ai'),
      sourceRoute: String(reply.sourceRoute || 'character_ai'),
      sourceCategory: String(reply.sourceCategory || 'character_ai'),
      promptVersion: String(reply.promptVersion || ''),
      modelProvider: String(reply.modelProvider || ''),
      modelName: String(reply.modelName || ''),
      safetyBlocked: reply.safetyBlocked === true
    };
    const promptContract = String(reply.promptContract || '').trim().toUpperCase();
    if (PROMPT_CONTRACTS.has(promptContract)) {
      payload.promptContract = promptContract;
      if (promptContract === 'O') payload.onlineMode = true;
      if (promptContract === 'L') payload.longformMode = true;
    }
    const segments = normalizeReplySegments(reply.segments);
    if (!payload.safetyBlocked && payload.sourceType === 'ai'
      && ['character_ai', 'simulator_ai_director'].includes(payload.sourceRoute) && segments.length) {
      payload.segments = segments;
    }
    const questionControlsAllowed = options.allowStructuredQuestions !== false && !options.petRuntimeContext && !options.ludoRuntimeContext
      && !['pet_event', 'world_run'].includes(String(options.requestKind || '').trim().toLowerCase());
    if (questionControlsAllowed && !payload.safetyBlocked && payload.sourceType === 'ai' && payload.sourceRoute === 'character_ai'
      && Array.isArray(reply.questions) && reply.questions.length) {
      const cardGroups = global?.SHEXCardGroups
        || (typeof require === 'function' ? require('../card-groups.js') : null);
      const batch = cardGroups?.normalizeQuestionBatch?.({ questions: reply.questions });
      if (batch?.questions?.length) {
        payload.sourceMode = 'ai';
        payload.interactionType = 'question';
        payload.interactionData = batch;
      }
    }
    return {
      payload,
      // AI回复已经在云端完成生成与审查，立即交付；字卡聊天仍由原回复时间设置控制。
      delayMs: 0,
      meta: { dreamId: String(dreamId || ''), revokeEligible: false, characterAI: true }
    };
  }

  // 演示站点：guest 用户云端 AI 不可用时，用本地词库生成一条可交付的回复。
  function guestLocalReplyPayload(requestId) {
    const text = typeof global.SHEXGenerateTypingSentence === 'function'
      ? global.SHEXGenerateTypingSentence()
      : '我在呢，慢慢说，我听着。';
    return { ok: true, code: '', message: '', requestId: String(requestId || '').trim(), reply: { text } };
  }

  async function generateReply(options = {}) {
    const app = options.app;
    const user = options.user || {};
    const dreamId = String(options.dreamId || '').trim();
    const messageId = String(options.messageId || '').trim();
    const requestId = String(options.requestId || '').trim();
    const worldRun = String(options.requestKind || '').trim().toLowerCase() === 'world_run';
    const runId = String(options.runId || '').trim();
    const worldTemplateId = String(options.worldTemplateId || '').trim();
    const checked = options.requestKind === 'pet_event' && options.petRuntimeContext?.events?.length && !options.messageText
      ? {ok: true, text: ''} : validateMessageText(options.messageText);
    if (!checked.ok) throw createError(checked.code, checked.message);
    if (!app?.callFunction) throw createError('CHARACTER_AI_UNAVAILABLE', 'AI聊天服务暂时不可用');
    if (!user?.userId || !user?.sessionToken) throw createError('SESSION_EXPIRED', '登录状态已失效，请重新登录');
    if ((!worldRun && !dreamId) || (worldRun && (!runId || !worldTemplateId)) || !messageId || !requestId) {
      throw createError('INVALID_ARGUMENT', 'AI回复任务缺少必要参数');
    }
    const requestData = requestDataFromOptions({ ...options, user, dreamId, runId, worldTemplateId, messageId, requestId }, checked);
    let result;
    try {
      result = await app.callFunction({
        name: 'shexCharacterAI',
        data: requestData
      });
    } catch (error) {
      // 演示站点：guest 用户在云端 AI 不可用时，用本地词库生成回复，保证聊天能跑通。
      if (user?.guest) return guestLocalReplyPayload(requestId);
      throw createError(error?.code || 'CHARACTER_AI_NETWORK_FAILED', error?.message || 'AI聊天服务连接失败，请稍后重试');
    }
    const payload = result?.result || result || {};
    try {
      return validateReplyPayload(payload, requestId);
    } catch (error) {
      if (user?.guest) return guestLocalReplyPayload(requestId);
      throw error;
    }
  }

  async function consolidateMemory(options = {}) {
    const app = options.app;
    const user = options.user || {};
    const dreamId = String(options.dreamId || '').trim();
    if (!app?.callFunction) throw createError('CHARACTER_AI_UNAVAILABLE', 'AI聊天服务暂时不可用');
    if (!user?.userId || !user?.sessionToken) throw createError('SESSION_EXPIRED', '登录状态已失效，请重新登录');
    if (!dreamId) throw createError('INVALID_ARGUMENT', '长期记忆整理缺少角色参数');
    let result;
    try {
      result = await app.callFunction({
        name: 'shexCharacterAI',
        data: {
          action: 'consolidateMemory',
          userId: user.userId,
          sessionToken: user.sessionToken,
          dreamId
        }
      });
    } catch (error) {
      throw createError(error?.code || 'MEMORY_CONSOLIDATION_NETWORK_FAILED', '长期记忆后台整理暂时失败');
    }
    const payload = result?.result || result || {};
    if (!payload?.ok) throw createError(payload?.code || 'MEMORY_CONSOLIDATION_FAILED', '长期记忆后台整理暂时失败');
    return {
      status: String(payload.status || 'none'),
      committedCount: Math.max(0, Number(payload.committedCount || 0)),
      modelCalled: payload.modelCalled === true
    };
  }

  // X103 会员版长期记忆（查看 / 改正文 / 忘掉）。不调用模型、不扣 X能量；权限由服务端按会员权益判定。
  const MEMBER_MEMORY_ACTIONS = new Set(['memberListMemories', 'memberEditMemory', 'memberForgetMemory']);

  function longTermMemoryAllowed(planData, isAdmin = false) {
    return isAdmin === true || planData?.isAdmin === true
      || planData?.membershipEntitlements?.capabilities?.characterAILongTermMemory === true;
  }

  async function memberMemoryRequest(options = {}) {
    const app = options.app;
    const user = options.user || {};
    const dreamId = String(options.dreamId || '').trim();
    const action = String(options.action || '').trim();
    if (!MEMBER_MEMORY_ACTIONS.has(action)) throw createError('MEMBER_MEMORY_ACTION_INVALID', '操作无效');
    if (!app?.callFunction) throw createError('CHARACTER_AI_UNAVAILABLE', 'AI聊天服务暂时不可用');
    if (!user?.userId || !user?.sessionToken) throw createError('SESSION_EXPIRED', '登录状态已失效，请重新登录');
    if (!dreamId) throw createError('INVALID_ARGUMENT', '缺少角色参数');
    const source = options.data && typeof options.data === 'object' && !Array.isArray(options.data) ? options.data : {};
    // 只把会员接口认识的字段发给服务端；类型、重要度等内部字段即使传进来也不会发出去。
    const data = {};
    ['memoryId', 'content', 'expectedUpdatedAt', 'operationId'].forEach((key) => {
      if (source[key] !== undefined) data[key] = source[key];
    });
    let result;
    try {
      result = await app.callFunction({
        name: 'shexCharacterAI',
        data: { ...data, action, userId: user.userId, sessionToken: user.sessionToken, dreamId }
      });
    } catch (error) {
      throw createError(error?.code || 'MEMBER_MEMORY_NETWORK_FAILED', error?.message || '连接失败，请稍后重试');
    }
    const payload = result?.result || result || {};
    if (!payload?.ok) throw createError(payload?.code || 'MEMBER_MEMORY_FAILED', payload?.message || '操作失败，请稍后重试');
    return payload;
  }

  async function adminManagerRequest(options = {}) {
    const app = options.app;
    const user = options.user || {};
    const dreamId = String(options.dreamId || '').trim();
    const action = String(options.action || '').trim();
    if (!ADMIN_MANAGER_ACTIONS.has(action)) throw createError('ADMIN_ACTION_INVALID', '管理员操作无效');
    if (!app?.callFunction) throw createError('CHARACTER_AI_UNAVAILABLE', 'AI聊天服务暂时不可用');
    if (!user?.userId || !user?.sessionToken) throw createError('SESSION_EXPIRED', '登录状态已失效，请重新登录');
    if (!dreamId) throw createError('INVALID_ARGUMENT', '管理员操作缺少角色参数');
    const data = options.data && typeof options.data === 'object' && !Array.isArray(options.data) ? options.data : {};
    let result;
    try {
      result = await app.callFunction({
        name: 'shexCharacterAI',
        data: {
          ...data,
          action,
          userId: user.userId,
          sessionToken: user.sessionToken,
          dreamId
        }
      });
    } catch (error) {
      throw createError(error?.code || 'ADMIN_MANAGER_NETWORK_FAILED', error?.message || '管理器连接失败，请稍后重试');
    }
    const payload = result?.result || result || {};
    if (!payload?.ok) throw createError(payload?.code || 'ADMIN_MANAGER_FAILED', payload?.message || '管理员操作失败');
    return payload;
  }

  async function generateTaskDescriptors(options = {}) {
    let payload;
    const worldRun = String(options.requestKind || '').trim().toLowerCase() === 'world_run';
    // WorldRun owns its R8 settlement inside shexCharacterAI; it must not enter
    // the ordinary character prepare/finalize work-order protocol.
    const serverEndpoint = options.debugMemory === true || worldRun ? '' : serverExecutionEndpoint(options);
    const endpoint = typeof options.onPreview === 'function' || typeof options.onSegmentDelta === 'function'
      ? streamEndpoint(options)
      : '';
    const canStream = streamTransportSupported(options);
    const canReachServer = serverEndpoint && canStream
      ? await serverExecutionReachable(options, serverEndpoint)
      : false;
    if (serverEndpoint && canReachServer) {
      const checked = options.requestKind === 'pet_event' && options.petRuntimeContext?.events?.length && !options.messageText
        ? {ok: true, text: ''} : validateMessageText(options.messageText);
      if (!checked.ok) throw createError(checked.code, checked.message);
      const user = options.user || {};
      const dreamId = String(options.dreamId || '').trim();
      const runId = String(options.runId || '').trim();
      const worldTemplateId = String(options.worldTemplateId || '').trim();
      const messageId = String(options.messageId || '').trim();
      const requestId = String(options.requestId || '').trim();
      if (!options.app?.callFunction) throw createError('CHARACTER_AI_UNAVAILABLE', 'AI聊天服务暂时不可用');
      if (!user?.userId || !user?.sessionToken) throw createError('SESSION_EXPIRED', '登录状态已失效，请重新登录');
      if ((!worldRun && !dreamId) || (worldRun && (!runId || !worldTemplateId)) || !messageId || !requestId) throw createError('INVALID_ARGUMENT', 'AI回复任务缺少必要参数');
      const requestData = requestDataFromOptions({ ...options, user, dreamId, runId, worldTemplateId, messageId, requestId }, checked);
      payload = await generateReplyOnServer(options, requestData, serverEndpoint);
      if (typeof options.waitForSegmentDrain === 'function') await options.waitForSegmentDrain();
    } else if (serverEndpoint) {
      payload = await generateReply(options);
    } else if (endpoint && canStream) {
      const checked = options.requestKind === 'pet_event' && options.petRuntimeContext?.events?.length && !options.messageText
        ? {ok: true, text: ''} : validateMessageText(options.messageText);
      if (!checked.ok) throw createError(checked.code, checked.message);
      const user = options.user || {};
      const dreamId = String(options.dreamId || '').trim();
      const runId = String(options.runId || '').trim();
      const worldTemplateId = String(options.worldTemplateId || '').trim();
      const messageId = String(options.messageId || '').trim();
      const requestId = String(options.requestId || '').trim();
      if (!user?.userId || !user?.sessionToken) throw createError('SESSION_EXPIRED', '登录状态已失效，请重新登录');
      if ((!worldRun && !dreamId) || (worldRun && (!runId || !worldTemplateId)) || !messageId || !requestId) throw createError('INVALID_ARGUMENT', 'AI回复任务缺少必要参数');
      const requestData = requestDataFromOptions({ ...options, user, dreamId, runId, worldTemplateId, messageId, requestId }, checked);
      try {
        payload = await generateReplyStreaming(options, requestData);
        if (typeof options.waitForSegmentDrain === 'function') {
          await options.waitForSegmentDrain();
        }
      } catch (error) {
        // guest 演示用户：streaming 失败时也回退到本地回复。
        if (user?.guest) {
          payload = await generateReply(options);
        } else if (error?.fallbackAllowed !== true) {
          throw error;
        } else {
          payload = await generateReply(options);
        }
      }
    } else {
      payload = await generateReply(options);
    }
    // X103 稳定性：descriptorFromReply 是单聊的交付合同（要求顶层 text）。WorldRun 的消息由
    // applyReply 从 reply.speakerTurns 展开，并不消费 descriptors，所以不能让这份遗留合同阻断
    // 一轮已由服务器提交的 WorldRun 回复。真正全空时仍报空，但明确标注服务器已提交。
    if (worldRun && !worldRunReplyHasContent(payload?.reply)) {
      throw createError('AI_EMPTY_RESPONSE', 'AI没有返回有效回复，请稍后重试', { serverCommitted:true });
    }
    return {
      descriptors: worldRun
        ? (String(payload?.reply?.text || '').trim() ? [descriptorFromReply(payload.reply, options.dreamId, options)] : [])
        : [descriptorFromReply(payload.reply, options.dreamId, options)],
      cached: payload.cached === true,
      requestId: payload.requestId,
      // X103 Phase 1：WorldRun 每轮的权威状态必须整组透传。原先只放行 simulatorRun/reply，
      // statePresentation / chapter / stage 在这里被丢弃，applyReply 只能沿用旧值，
      // world.progress.* 因此永不更新；stateChangesSkipped 也因此成为死分支。
      // 缺省一律给 null/false，保持 applyReply「有就换、没有就沿用」的既有语义。
      ...(worldRun ? {
        simulatorRun:payload.simulatorRun || null,
        reply:payload.reply || null,
        lastChatAt:payload.lastChatAt || null,
        lastMessagePreview:String(payload.lastMessagePreview || ''),
        statePresentation:payload.statePresentation || null,
        chapter:payload.chapter || null,
        stage:payload.stage || null,
        completion:payload.completion?.status === 'completed' ? payload.completion : null,
        systemEventOnly:payload.systemEventOnly === true,
        autoEventsPending:payload.autoEventsPending === true,
        stateChangesSkipped:payload.stateChangesSkipped === true,
        streamFinalMismatch:payload.streamFinalMismatch === true,
        // X103：服务端只下发 public===true 的世界变量；这里原样透传，缺省为 null 让 applyReply 沿用当前值。
        variableDefinitions:Array.isArray(payload.variableDefinitions) ? payload.variableDefinitions : null,
        variables:payload.variables && typeof payload.variables === 'object' && !Array.isArray(payload.variables) ? payload.variables : null,
        variablesRevision:Number.isSafeInteger(payload.variablesRevision) ? payload.variablesRevision : null
      } : {}),
      memoryConsolidation: payload?.memoryConsolidation?.ready === true
        ? { ready: true, sourceMessageCount: Math.max(0, Number(payload.memoryConsolidation.sourceMessageCount || 0)) }
        : { ready: false },
      ...(payload?.adminDiagnostics && typeof payload.adminDiagnostics === 'object'
        ? { adminDiagnostics: payload.adminDiagnostics }
        : {})
    };
  }

  return Object.freeze({
    ADMIN_MANAGER_ACTIONS,
    DEFAULT_MODEL_TIER,
    MODEL_TIERS,
    MODEL_SELECTION_PAGE_SIZE,
    MESSAGE_MAX_CHARACTERS,
    adminManagerRequest,
    longTermMemoryAllowed,
    memberMemoryRequest,
    classifyError,
    consolidateMemory,
    descriptorFromReply,
    effectiveReplyMode,
    failureNotice,
    isGalleryCharacter,
    isModelAllowed,
    isWorldRunModelAllowed,
    filterCardContextMessages,
    generateReply,
    generateReplyOnServer,
    generateReplyStreaming,
    generateTaskDescriptors,
    isConfirmedAICharacterReply,
    normalizeReplyMode,
    promptContractForDream,
    normalizeModelTier,
    modelTier,
    modelReplyEnergy,
    effectiveModelTier,
    modelSelectionPages,
    normalizeReplySegments,
    shouldUseAI,
    serverExecutionEndpoint,
    serverExecutionReachable,
    streamTransportSupported,
    supportsInjectionViewerDiagnostics,
    streamEndpoint,
    validateMessageText
  });
});
