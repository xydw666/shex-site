(() => {
  'use strict';

  // 克隆音色：Free 499 / 会员 399，只显示当前用户自己的价格；实际扣费以服务端为准。
  const modelCost = () => Number(window.SHEXAuth?.featurePrice?.('voice_clone', 499, 399) ?? 499);
  const MAX_TTS_CHARS = 240;
  const CREATE_MODEL_TIMEOUT_MS = 190000;
  const SHORT_RECOVERY_DELAYS_MS = Object.freeze([250, 900]);
  const EXTENDED_RECOVERY_DELAYS_MS = Object.freeze([500, 1500, 3000, 5000, 8000, 12000]);
  const PAID_VOICE_PLAN_CODES = new Set(['plus', 'pro', 'ultra']);
  const inFlight = new Map();
  const queuedAutoMessages = new Map();
  const autoPlayIntents = new Set();
  const letterVoiceFallback = new Map();
  let letterVoiceCache = null;
  let autoVoiceQueue = Promise.resolve();
  let settingsBound = false;
  let activeAudio = null;
  let activeAudioButton = null;
  let activeLetterOwner = null;
  let activeLetterEpoch = 0;
  let pendingLetterEpoch = 0;
  let autoPlaybackAudio = null;
  let autoPlaybackPrimeTask = null;
  let autoPlaybackUnlocked = false;
  let autoPlaybackBlockedNotified = false;

  const voiceIcon = (kind = 'play') => kind === 'pause'
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6v12M16 6v12"/></svg>'
    : kind === 'loading'
      ? '<svg class="is-spinning" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.34-5.66"/></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5.5v13l11-6.5z"/></svg>';

  function setVoiceButtonIcon(button, kind, label) {
    if (!button) return;
    if (!window.SHEXChatVoicePresentation?.paintButton(button, kind, label, voiceIcon(kind))) button.innerHTML = voiceIcon(kind);
    button.setAttribute('aria-label', label);
    button.title = label;
  }

  const bridge = () => window.SHEXVoiceBridge || null;
  const $ = (selector, root = document) => root?.querySelector?.(selector) || null;

  function isVoiceAdmin() {
    return window.SHEXAuth?.isAdmin?.() === true;
  }

  function currentUser() {
    return bridge()?.currentUser?.() || window.SHEXAuth?.current?.() || null;
  }

  function voicePlanCode(planData = {}) {
    return String(planData?.currentPlan?.code || planData?.currentPlan?.plan || planData?.plan || '').trim().toLowerCase();
  }

  function isPaidVoicePlan(planData = {}) {
    return planData?.isAdmin === true || PAID_VOICE_PLAN_CODES.has(voicePlanCode(planData));
  }

  async function readVoicePlanAccess() {
    if (isVoiceAdmin()) return { allowed: true, verified: true };
    try {
      const getPlan = window.SHEXAuth?.getMyPlan;
      if (typeof getPlan !== 'function') throw new Error('plan api unavailable');
      const planData = await getPlan();
      return { allowed: isPaidVoicePlan(planData), verified: true };
    } catch (error) {
      console.warn('[SHEXVoice] voice plan check unavailable', error?.message || error);
      return { allowed: false, verified: false };
    }
  }

  async function requirePaidVoicePlan() {
    // 语音回复和克隆音色已向 Free 开放，不再按套餐拦截。
    return true;
    // eslint-disable-next-line no-unreachable
    const access = await readVoicePlanAccess();
    if (access.allowed) return true;
    bridge()?.showToast?.(access.verified
      ? '语音回复仅对当前有效的 Plus、Pro 或 Ultra 套餐开放'
      : '套餐状态暂时无法确认，请稍后重试');
    return false;
  }

  async function enforceVoicePlanState(mask, dream) {
    // 语音回复已向 Free 开放：不再因为是免费套餐而自动关闭语音。
    if (mask) mask.dataset.voicePlanAllowed = 'true';
    return;
    // eslint-disable-next-line no-unreachable
    const access = await readVoicePlanAccess();
    if (!mask?.isConnected || !dream) return;
    mask.dataset.voicePlanAllowed = access.allowed ? 'true' : access.verified ? 'false' : 'unknown';
    if (!access.verified || access.allowed || normalizedVoiceMode(dream.voiceMode) !== 'auto') return;
    updateDreamVoice(dream.id, { voiceMode: 'off' });
    syncVoiceModeControls(mask, dreamById(dream.id) || { ...dream, voiceMode: 'off' });
    void bridge()?.syncUserDataAfterResourceChange?.('免费套餐已关闭语音回复');
  }

  function looksLikeKaomoji(value) {
    const compact = String(value || '').replace(/\s+/g, '');
    if (!compact || compact.length > 32 || /\p{Script=Han}/u.test(compact)) return false;
    if (/^(?:qaq|qwq|tat|t[_\-.]t|q[_\-.]q|\^[_\-.]?\^|>[_\-.]?<|=w=|orz|otz)$/i.test(compact)) return true;
    const markers = compact.match(/[\p{Extended_Pictographic}｡。・･·•°˘´｀`＾^＿_〜~～≧≦><＞＜╯╰ノヽつづヾωΩдДಥ눈ㅂㅅ╥;；:：'"]/gu) || [];
    return markers.length >= 2;
  }

  function stripSpeechDecorations(value) {
    let text = String(value || '');
    text = text.replace(/([0-9#*])\uFE0F?\u20E3/gu, '$1');
    text = text.replace(/\p{Regional_Indicator}{2}/gu, '');
    text = text.replace(/\p{Extended_Pictographic}(?:\uFE0E|\uFE0F)?(?:\u200D\p{Extended_Pictographic}(?:\uFE0E|\uFE0F)?)*/gu, '');
    text = text.replace(/[（(]([^（）()\r\n]{1,32})[）)](?:و|ﾉ|ノ|つ|づ|っ)?[✧☆★♪♡♥]*/gu,
      (match, inner) => looksLikeKaomoji(inner) ? '' : match);
    text = text
      .replace(/(?:qaq|qwq|tat|t[_\-.]t|q[_\-.]q|\^[_\-.]?\^|>[_\-.]?<|=w=|orz|otz)/gi, '')
      .replace(/(?:[:;=8][\-^']?[)(/\\DPp])/g, '')
      .replace(/[\u200B-\u200D\uFE0E\uFE0F\uFEFF\p{Emoji_Modifier}]/gu, '');
    return text;
  }

  function normalizeText(value) {
    const source = String(value || '')
      .normalize('NFKC')
      .replace(/https?:\/\/\S+/gi, '')
      .replace(/\[(?:图片|表情包|语音|视频|动作|礼物)[^\]]*\]/g, '');
    const normalized = stripSpeechDecorations(source)
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/\s+([，。！？!?、；;：:])/g, '$1')
      .replace(/\s+/g, ' ')
      .trim();
    return /[\p{L}\p{N}]/u.test(normalized) ? normalized : '';
  }

  function readableLength(value) {
    return Array.from(normalizeText(value)).length;
  }

  function energyCost(value) {
    const length = typeof value === 'number' ? value : readableLength(value);
    if (length <= 0) return 0;
    if (length <= 30) return 1;
    if (length <= 60) return 3;
    if (length <= 90) return 5;
    if (length <= 120) return 7;
    if (length <= MAX_TTS_CHARS) return 14;
    return 0;
  }

  function normalizeLetterText(value) {
    function looksLikeKaomoji(value) {
      const compact = String(value || '').replace(/\s+/g, '');
      if (!compact || compact.length > 32 || /\p{Script=Han}/u.test(compact)) return false;
      if (/^(?:qaq|qwq|tat|t[_\-.]t|q[_\-.]q|\^[_\-.]?\^|>[_\-.]?<|=w=|orz|otz)$/i.test(compact)) return true;
      const markers = compact.match(/[\p{Extended_Pictographic}｡。・･·•°˘´｀`＾^＿_〜~～≧≦><＞＜╯╰ノヽつづヾωΩдДಥ눈ㅂㅅ╥;；:：'"]/gu) || [];
      return markers.length >= 2;
    }
    let text = String(value || '').normalize('NFKC')
      .replace(/https?:\/\/\S+/gi, '')
      .replace(/\[(?:图片|表情包|语音|视频|动作|礼物)[^\]]*\]/g, '');
    text = text.replace(/([0-9#*])\uFE0F?\u20E3/gu, '$1');
    text = text.replace(/\p{Regional_Indicator}{2}/gu, '');
    text = text.replace(/\p{Extended_Pictographic}(?:\uFE0E|\uFE0F)?(?:\u200D\p{Extended_Pictographic}(?:\uFE0E|\uFE0F)?)*/gu, '');
    text = text.replace(/[（(]([^（）()\r\n]{1,32})[）)](?:و|ﾉ|ノ|つ|づ|っ)?[✧☆★♪♡♥]*/gu,
      (match, inner) => looksLikeKaomoji(inner) ? '' : match);
    text = text
      .replace(/(?:qaq|qwq|tat|t[_\-.]t|q[_\-.]q|\^[_\-.]?\^|>[_\-.]?<|=w=|orz|otz)/gi, '')
      .replace(/(?:[:;=8][\-^']?[)(/\\DPp])/g, '')
      .replace(/[\u200B-\u200D\uFE0E\uFE0F\uFEFF\p{Emoji_Modifier}]/gu, '');
    const normalized = text.replace(/\s+([，。！？!?、；;：:])/g, '$1')
      .replace(/\s+/g, ' ').trim();
    return /[\p{L}\p{N}]/u.test(normalized) ? normalized : '';
  }

  async function textHash(value) {
    const bytes = new TextEncoder().encode(value);
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  }

  function letterVoiceStore() {
    if (!letterVoiceCache && window.SHEXXLettersCore?.createCache) letterVoiceCache = window.SHEXXLettersCore.createCache();
    return letterVoiceCache;
  }

  function letterVoiceKey(segment) {
    return `${segment.paperId}:${segment.blockId}:${segment.segmentHash}:${segment.voiceVersion}`;
  }

  // 已登记到信上的语音文件按账号/梦角/片段存在本机，重开同一封信直接复用，不必再回云端查询。
  const LETTER_VOICE_SAVED_KEY = 'shex_x_letter_voice_refs_v1';
  const LETTER_VOICE_SAVED_LIMIT = 600;
  let letterVoiceSaved = null;
  function savedLetterVoices() {
    if (letterVoiceSaved) return letterVoiceSaved;
    letterVoiceSaved = new Map();
    try {
      const rows = JSON.parse(localStorage.getItem(LETTER_VOICE_SAVED_KEY) || '[]');
      if (Array.isArray(rows)) rows.forEach(row => { if (Array.isArray(row) && typeof row[0] === 'string' && /^cloud:\/\/[^/]+\/.+/.test(String(row[1] || ''))) letterVoiceSaved.set(row[0], row[1]); });
    } catch (_) { /* Storage unavailable: memory cache still works. */ }
    return letterVoiceSaved;
  }
  function saveLetterVoice(storageKey, fileID) {
    const saved = savedLetterVoices();
    if (saved.get(storageKey) === fileID) return;
    saved.delete(storageKey); saved.set(storageKey, fileID);
    while (saved.size > LETTER_VOICE_SAVED_LIMIT) saved.delete(saved.keys().next().value);
    try { localStorage.setItem(LETTER_VOICE_SAVED_KEY, JSON.stringify([...saved])); } catch (_) { /* Quota or privacy mode. */ }
  }

  function cachedLetterVoice(userId, dreamId, segment) {
    const key = letterVoiceKey(segment);
    const memory = letterVoiceStore()?.get(userId, dreamId, 'voiceRefs', key)
      || letterVoiceFallback.get(JSON.stringify([userId, dreamId, key]));
    if (memory) return memory;
    const fileID = savedLetterVoices().get(JSON.stringify([userId, dreamId, key]));
    return fileID ? { fileID, attached: true } : null;
  }

  function rememberLetterVoice(userId, dreamId, segment, value) {
    const key = letterVoiceKey(segment);
    if (value?.attached && value.fileID) saveLetterVoice(JSON.stringify([userId, dreamId, key]), value.fileID);
    if (letterVoiceStore()) letterVoiceCache.put(userId, dreamId, 'voiceRefs', key, value);
    else {
      const fallbackKey = JSON.stringify([userId, dreamId, key]);
      letterVoiceFallback.delete(fallbackKey);
      letterVoiceFallback.set(fallbackKey, value);
      while (letterVoiceFallback.size > 32) letterVoiceFallback.delete(letterVoiceFallback.keys().next().value);
    }
  }

  function splitLetterText(value) {
    const characters = Array.from(normalizeLetterText(value));
    const result = [];
    while (characters.length) {
      let end = Math.min(MAX_TTS_CHARS, characters.length);
      for (let index = 0; index < end; index += 1) {
        if (/[。！？!?；;\n]/u.test(characters[index])) {
          end = index + 1;
          break;
        }
      }
      const text = characters.splice(0, end).join('').trim();
      if (/[\p{L}\p{N}]/u.test(text)) result.push(text);
    }
    return result;
  }

  async function planLetterVoice(paper, voiceVersion) {
    if (!(paper?.state === 'sent' || paper?.state === 'draft' && paper.authorType === 'user')
      || paper.hiddenAt || paper.hidden || paper.localDraft || !paper.paperId || !paper.userId || !paper.dreamId) {
      throw new Error('只能朗读本人可见的信笺或已保存用户草稿');
    }
    if (!Number.isInteger(Number(voiceVersion)) || Number(voiceVersion) < 1) throw new Error('声音版本无效');
    const blocks = (paper.blocks || []).filter(block => block?.type === 'text' && block.blockId && normalizeLetterText(block.text));
    const segments = [];
    for (const block of blocks) {
      for (const text of splitLetterText(block.text)) {
        if (!window.SHEXVoicePolicy?.prepareSpeechText(text, normalizeText)) continue;
        const segmentHash = await textHash(text);
        const [paperHash, blockHash] = await Promise.all([textHash(paper.paperId), textHash(block.blockId)]);
        const requestId = `xletter_${paperHash.slice(0, 16)}_${blockHash.slice(0, 16)}_${segmentHash}_${voiceVersion}`;
        segments.push({ paperId: paper.paperId, blockId: block.blockId, segmentHash,
          voiceVersion: Number(voiceVersion), requestId, text, length: Array.from(text).length, energyCost: energyCost(text) });
      }
    }
    return { text: blocks.map(block => normalizeLetterText(block.text)).join('\n'), segmentCount: segments.length,
      totalEnergyCost: segments.reduce((sum, item) => sum + item.energyCost, 0), segments };
  }

  async function requestTextVoice({ dreamId, text, requestId, messageId = requestId, sourceType = 'x_letter',
    paperId, blockId, segmentHash, voiceVersion }) {
    if (!window.SHEXVoicePolicy?.prepareSpeechText(text, normalizeText)) throw Object.assign(new Error('没有可朗读内容'), { code: 'VOICE_TEXT_EMPTY' });
    if (!dreamId || !text || !requestId || normalizeLetterText(text) !== text || !energyCost(text)) throw new Error('语音片段无效');
    return cloudCall({ action: 'synthesizeSpeech', dreamId, text, requestId, messageId, sourceType,
      paperId, blockId, segmentHash, voiceVersion });
  }

  async function requestLetterVoice({ paper, voiceVersion, api = window.SHEXXLettersAPI,
    currentUser: readUser = currentUser, currentDream, isActive = () => true, onlySegments, onReady, concurrency = 3 } = {}) {
    if (typeof currentDream !== 'function') throw new Error('需要当前梦角状态才能朗读信笺');
    const quote = await planLetterVoice(paper, voiceVersion);
    const owner = readUser();
    const stillOwned = () => isActive() && readUser()?.userId === paper.userId && currentDream() === paper.dreamId;
    if (!owner?.userId || !stillOwned()) throw new Error('账号或梦角已切换');
    if (typeof api?.attachVoiceSegment !== 'function') throw new Error('信笺语音登记服务不可用');
    if (onlySegments !== undefined && (!Array.isArray(onlySegments) || onlySegments.some(key => typeof key !== 'string'
      || !quote.segments.some(segment => `${segment.blockId}:${segment.segmentHash}` === key)))) throw new Error('朗读恢复片段无效');
    const requested = onlySegments === undefined ? null : new Set(onlySegments);
    const ready = [], failed = [];
    // 按顺序开工、最多同时生成几段：每段一好就通过 onReady 交给播放器，第一段好了就能先播。
    const queue = quote.segments.filter(segment => !requested || requested.has(`${segment.blockId}:${segment.segmentHash}`));
    let next = 0, ownerLost = false, voiceUnavailable = false;
    const work = async segment => {
      if (!stillOwned()) { ownerLost = true; return; }
      let cached = cachedLetterVoice(owner.userId, paper.dreamId, segment);
      let stage = 'generate';
      try {
        if (!cached?.fileID) {
          const audio = await requestTextVoice({ ...segment, dreamId: paper.dreamId });
          if (!stillOwned()) { ownerLost = true; return; }
          cached = { fileID: audio.fileID, energyCost: audio.energyCost, attached: false };
          rememberLetterVoice(owner.userId, paper.dreamId, segment, cached);
        }
        if (!cached.attached) {
          stage = 'save';
          const input = { dreamId: paper.dreamId, paperId: paper.paperId, blockId: segment.blockId,
            segmentHash: segment.segmentHash, voiceVersion: segment.voiceVersion, fileID: cached.fileID,
            requestId: segment.requestId };
          const attachment = await api.attachVoiceSegment(input);
          if (!stillOwned()) { ownerLost = true; return; }
          const persistentFileID = typeof attachment?.fileID === 'string' && attachment.fileID.startsWith('cloud://')
            ? attachment.fileID : cached.fileID;
          cached = { ...cached, fileID: persistentFileID, attached: true };
          rememberLetterVoice(owner.userId, paper.dreamId, segment, cached);
        }
        const done = { ...segment, fileID: cached.fileID };
        ready.push(done);
        try { onReady?.(done); } catch (_) { /* Player callbacks never break generation. */ }
      } catch (error) {
        failed.push({ ...segment, stage, error });
        // These failures apply to the whole voice, not just one sentence.
        // Let already-started requests settle, but do not launch the rest of the letter.
        if (['VOICE_MODEL_NOT_READY', 'VOICE_VERSION_CHANGED', 'SESSION_EXPIRED'].includes(error?.code)) voiceUnavailable = true;
      }
    };
    const runner = async () => { while (!ownerLost && !voiceUnavailable && next < queue.length) await work(queue[next++]); };
    await Promise.all(Array.from({ length: Math.max(1, Math.min(Number(concurrency) || 1, queue.length)) }, runner));
    if (ownerLost) throw new Error('账号或梦角已切换');
    return { ...quote, ready, failed };
  }

  async function playLetterVoice({ userId, dreamId, segment, button, onEnded, onError,
    currentUser: readUser = currentUser, currentDream } = {}) {
    if (typeof currentDream !== 'function') return false;
    const guard = () => readUser()?.userId === userId && currentDream() === dreamId;
    if (!guard() || !segment || !button) return false;
    const cached = cachedLetterVoice(userId, dreamId, segment);
    if (!cached?.attached || !cached.fileID || cached.fileID !== segment.fileID) return false;
    const played = await playFile(cached.fileID, button, { guard, letterOwner: { userId, dreamId }, onEnded, onError });
    return Boolean(played && guard());
  }

  function rememberLetterVoiceReference({ userId, dreamId, segment,
    currentUser: readUser = currentUser, currentDream } = {}) {
    if (!userId || !dreamId || typeof currentDream !== 'function' || readUser()?.userId !== userId || currentDream() !== dreamId
      || !segment?.paperId || !segment?.blockId || !/^[a-f0-9]{64}$/.test(String(segment.segmentHash || ''))
      || !Number.isSafeInteger(Number(segment.voiceVersion)) || !/^cloud:\/\/[^/]+\/.+/.test(String(segment.fileID || ''))) return false;
    rememberLetterVoice(userId, dreamId, segment, { fileID: segment.fileID, attached: true });
    return true;
  }

  function onLetterPartitionChange({ currentUser: readUser = currentUser, currentDream = () => null } = {}) {
    if (activeLetterOwner && (readUser()?.userId !== activeLetterOwner.userId
      || currentDream() !== activeLetterOwner.dreamId)) stopActiveAudio();
  }
  function stopLetterVoice() {
    if (activeLetterOwner) stopActiveAudio();
    else if (pendingLetterEpoch && pendingLetterEpoch === activeLetterEpoch) activeLetterEpoch += 1;
    pendingLetterEpoch = 0;
  }

  function isCharacterAIMessage(message = {}) {
    return message.sourceType === 'ai' && message.sourceRoute === 'character_ai';
  }

  function speechTextForMessage(message = {}) {
    const prepare = value => window.SHEXVoicePolicy?.prepareSpeechText(value, normalizeText) || '';
    if (!isCharacterAIMessage(message)) return prepare(message.text);
    if (!Array.isArray(message.segments)) return '';
    return prepare(message.segments
      .filter((segment) => String(segment?.type || '').trim().toLowerCase() === 'dialogue')
      .map((segment) => String(segment?.text || '').trim())
      .filter(Boolean)
      .join(' '));
  }

  function isEligibleMessage(message, active) {
    return Boolean(
      active?.kind === 'single'
      && active?.dream?.id
      && message?.role === 'ta'
      && message?.text
      && !message?.sticker
      && !message?.stickerId
      && !message?.image
      && !message?.media
      && message?.type !== 'notice'
      && message?.kind !== 'notice'
      && !message?.notice
      && !message?.revoked
    );
  }

  function dreamById(dreamId) {
    return bridge()?.readState?.().dreams?.find((item) => String(item?.id || '') === String(dreamId || '')) || null;
  }

  function updateDreamVoice(dreamId, patch) {
    bridge()?.updateState?.((draft) => {
      const dream = draft.dreams?.find((item) => String(item?.id || '') === String(dreamId || ''));
      if (dream) {
        Object.assign(dream, patch, { updatedAt: Date.now() });
        window.SHEXCharacterProfileSync?.touchGroup?.(dream, 'instanceSettings', dream.updatedAt);
      }
      return draft;
    });
  }

  function messageFor(dreamId, messageId) {
    return bridge()?.readState?.().singleChats?.[dreamId]?.find((item) => String(item?.id || '') === String(messageId || '')) || null;
  }

  function updateMessageVoice(dreamId, messageId, patch = {}) {
    const updatePresentationState = bridge()?.updateLocalPresentationState || bridge()?.updateState;
    updatePresentationState?.((draft) => {
      const messages = draft.singleChats?.[dreamId];
      const message = Array.isArray(messages) ? messages.find((item) => String(item?.id || '') === String(messageId || '')) : null;
      if (message) {
        message.voiceAudio = {
          ...(message.voiceAudio && typeof message.voiceAudio === 'object' ? message.voiceAudio : {}),
          ...patch,
          updatedAt: Date.now()
        };
      }
      return draft;
    });
    refreshRenderedVoiceControl(dreamId, messageId);
  }

  async function cloudCall(data) {
    const user = currentUser();
    if (!user?.userId || !user?.sessionToken) throw Object.assign(new Error('请先登录后使用梦角声音'), { code: 'SESSION_EXPIRED' });
    const app = await bridge()?.getCloudApp?.();
    if (!app?.callFunction) throw new Error('声音服务暂时不可用');
    const result = await app.callFunction({
      name: 'shexVoice',
      data: { ...data, userId: user.userId, sessionToken: user.sessionToken },
      // shexVoice allows createVoiceModel to run for up to 180 seconds. Keep
      // the client response window slightly longer so a completed model is
      // not reported as a generic network failure at the 120-second mark.
      timeout: data?.action === 'createVoiceModel' ? CREATE_MODEL_TIMEOUT_MS : 90000
    });
    const payload = result?.result || result || {};
    if (!payload.ok) throw Object.assign(new Error(payload.message || '声音服务暂时不可用'), {
      code: payload.code || 'VOICE_FAILED', supportCode: payload.supportCode || '',
      voiceStage: payload.voiceStage || payload.step || '', diagnosticTraceId: payload.diagnosticTraceId || data.diagnosticTraceId || ''
    });
    return payload;
  }

  function refreshEnergySilently() {
    void window.SHEXAuth?.getMyPlan?.().catch(() => {});
  }

  function cleanupExpiredAudioOncePerDay() {
    const user = currentUser();
    if (!user?.userId) return;
    const key = `shex_voice_cleanup_${user.userId}`;
    const lastRun = Number(localStorage.getItem(key) || 0);
    if (Date.now() - lastRun < 24 * 60 * 60 * 1000) return;
    localStorage.setItem(key, String(Date.now()));
    void cloudCall({ action: 'cleanupExpiredAudio' }).catch(() => localStorage.removeItem(key));
  }

  function requestIdForMessage(dreamId, messageId) {
    return `voice_msg_${String(dreamId || '').replace(/[^a-zA-Z0-9_-]/g, '_')}_${String(messageId || '').replace(/[^a-zA-Z0-9_-]/g, '_')}`.slice(0, 180);
  }

  function voiceDiagnosticTraceId() {
    const random = globalThis.crypto?.randomUUID?.().replace(/-/g, '') || `${Date.now()}${Math.random().toString(36).slice(2)}`;
    return `voice_tts_${String(random).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48)}`;
  }

  function isAmbiguousVoiceMutationError(error) {
    return /network request error|networkerror|network error|request timeout|timed out|timeout|abort(?:ed)?|econnreset|etimedout/i.test(
      `${String(error?.code || '')} ${String(error?.message || error || '')}`
    );
  }

  function friendlyVoiceError(error) {
    return window.SHEXVoicePolicy?.describeFailure(error).message || '语音暂时不可用，请点播放重试（V999）。请截图给管理员';
  }

  async function playMessageVoice(dreamId, messageId, button) {
    const ownerId = currentUser()?.userId;
    try {
      const data = await requestMessageVoice(dreamId, messageId, 'chat_reply', { manual: true });
      const active = bridge()?.requireActiveConversation?.();
      if (ownerId !== currentUser()?.userId || active && (active.kind !== 'single' || active.dream?.id !== dreamId)) return false;
      return data?.fileID ? playFile(data.fileID, renderedVoiceButton(messageId) || button) : false;
    } catch (error) {
      bridge()?.showToast?.(friendlyVoiceError(error));
      return false;
    }
  }

  async function requestMessageVoice(dreamId, messageId, sourceType = 'chat_reply', options = {}) {
    const key = `${dreamId}:${messageId}`;
    if (options.manual) autoPlayIntents.delete(key);
    if (options.autoPlay === true) autoPlayIntents.add(key);
    if (inFlight.has(key)) return inFlight.get(key);
    const message = messageFor(dreamId, messageId);
    if (!message) {
      autoPlayIntents.delete(key);
      return null;
    }
    // Validate before local history reuse: old nonverbal audio must never play.
    const speechText = speechTextForMessage(message);
    if (!speechText) {
      autoPlayIntents.delete(key);
      if (options.manual) bridge()?.showToast?.(friendlyVoiceError({ code: 'VOICE_TEXT_EMPTY' }));
      return null;
    }
    if (message.voiceAudio?.status === 'ready' && message.voiceAudio?.fileID) {
      autoPlayIntents.delete(key);
      return {
        ok: true,
        fileID: message.voiceAudio.fileID,
        energyCost: Number(message.voiceAudio.energyCost || 0),
        cacheHit: Boolean(message.voiceAudio.cacheHit),
        idempotent: true,
        localReady: true
      };
    }
    const cost = energyCost(speechText);
    const diagnosticTraceId = voiceDiagnosticTraceId();
    const diagnosticStartedAt = performance.now();
    const dialogueSegmentCount = isCharacterAIMessage(message)
      ? message.segments.filter((segment) => String(segment?.type || '').toLowerCase() === 'dialogue').length
      : 1;
    if (!cost) {
      updateMessageVoice(dreamId, messageId, { status: 'unsupported', errorCode: 'VOICE_TEXT_TOO_LONG', errorMessage: `超过${MAX_TTS_CHARS}字，暂不生成语音` });
      autoPlayIntents.delete(key);
      return null;
    }
    console.info('[SHEXVoice][performance] request_start', {
      traceId: diagnosticTraceId,
      sourceType: isCharacterAIMessage(message) ? 'character_ai' : sourceType,
      readableLength: readableLength(speechText),
      dialogueSegmentCount
    });
    updateMessageVoice(dreamId, messageId, { status: 'pending', energyCost: cost, errorCode: '', errorStage: '', errorMessage: '' });
    const task = cloudCall({
      action: 'synthesizeSpeech',
      dreamId,
      messageId,
      requestId: requestIdForMessage(dreamId, messageId),
      sourceType: isCharacterAIMessage(message) ? 'character_ai' : sourceType,
      text: speechText,
      narrationText: isCharacterAIMessage(message) ? undefined : String(message.text || '').slice(0, 16384),
      segments: isCharacterAIMessage(message) ? message.segments : undefined,
      diagnosticTraceId
    }).then((data) => {
      if (!String(data.fileID || '').trim()) throw Object.assign(new Error('没有收到可用音频'), { code: 'VOICE_AUDIO_MISSING' });
      console.info('[SHEXVoice][performance] request_complete', {
        traceId: diagnosticTraceId,
        browserElapsedMs: Math.round(performance.now() - diagnosticStartedAt),
        cacheHit: Boolean(data.cacheHit),
        idempotent: Boolean(data.idempotent),
        serverTimingMs: data.timingMs || null
      });
      updateMessageVoice(dreamId, messageId, {
        status: 'ready',
        fileID: data.fileID || '',
        energyCost: Number(data.energyCost || cost),
        readableLength: Number(data.readableLength || readableLength(speechText)),
        cacheHit: Boolean(data.cacheHit),
        supportCode: '',
        errorCode: '',
        errorStage: '',
        errorMessage: ''
      });
      refreshEnergySilently();
      if (autoPlayIntents.delete(key) && data.fileID) {
        (window.queueMicrotask || ((callback) => window.setTimeout(callback, 0)))(() => {
          void autoPlayReadyMessage(dreamId, messageId, data.fileID);
        });
      }
      return data;
    }).catch((error) => {
      error.diagnosticTraceId = error.diagnosticTraceId || diagnosticTraceId;
      const failure = window.SHEXVoicePolicy?.describeFailure(error, diagnosticTraceId);
      console.warn('[SHEXVoice][performance] request_failed', {
        traceId: diagnosticTraceId,
        browserElapsedMs: Math.round(performance.now() - diagnosticStartedAt),
        code: String(error?.code || 'VOICE_FAILED'), supportCode: failure?.supportCode || 'V999',
        stage: String(error?.voiceStage || 'client_request')
      });
      updateMessageVoice(dreamId, messageId, {
        status: 'failed',
        energyCost: cost,
        errorCode: error?.code || 'VOICE_FAILED',
        // 云函数返回的失败阶段；V999 时显示在按钮旁，便于定位是哪一步出错。
        errorStage: String(error?.voiceStage || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40),
        supportCode: failure?.supportCode || 'V999',
        errorMessage: friendlyVoiceError(error)
      });
      autoPlayIntents.delete(key);
      throw error;
    }).finally(() => inFlight.delete(key));
    inFlight.set(key, task);
    return task;
  }

  function queueAutoMessageVoice(dreamId, messageId) {
    const key = `${dreamId}:${messageId}`;
    if (queuedAutoMessages.has(key)) return queuedAutoMessages.get(key);
    const task = autoVoiceQueue
      .catch(() => null)
      .then(() => requestMessageVoice(dreamId, messageId, 'chat_reply', { autoPlay: true }))
      .finally(() => queuedAutoMessages.delete(key));
    queuedAutoMessages.set(key, task);
    autoVoiceQueue = task.catch(() => null);
    return task;
  }

  function stopActiveAudio() {
    if (activeLetterOwner) activeLetterEpoch += 1;
    if (activeAudio) {
      activeAudio.pause();
      if (activeLetterOwner) activeAudio.src = '';
      activeAudio = null;
    }
    if (activeAudioButton) {
      setVoiceButtonIcon(activeAudioButton, 'play', '播放语音');
      activeAudioButton.classList.remove('is-playing');
      activeAudioButton = null;
    }
    activeLetterOwner = null;
  }

  function ensureAutoPlaybackAudio() {
    if (!autoPlaybackAudio) {
      autoPlaybackAudio = new Audio();
      autoPlaybackAudio.preload = 'auto';
      autoPlaybackAudio.playsInline = true;
    }
    return autoPlaybackAudio;
  }

  function createSilentWavUrl() {
    const sampleRate = 8000;
    const sampleCount = 800;
    const bytes = new Uint8Array(44 + sampleCount);
    const view = new DataView(bytes.buffer);
    const write = (offset, text) => Array.from(text).forEach((char, index) => { bytes[offset + index] = char.charCodeAt(0); });
    write(0, 'RIFF');
    view.setUint32(4, 36 + sampleCount, true);
    write(8, 'WAVE');
    write(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate, true);
    view.setUint16(32, 1, true);
    view.setUint16(34, 8, true);
    write(36, 'data');
    view.setUint32(40, sampleCount, true);
    bytes.fill(128, 44);
    return URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }));
  }

  function primeAutoPlayback() {
    if (autoPlaybackUnlocked || autoPlaybackPrimeTask || (activeAudio === autoPlaybackAudio && !autoPlaybackAudio?.paused)) return;
    const audio = ensureAutoPlaybackAudio();
    const silentUrl = createSilentWavUrl();
    audio.src = silentUrl;
    audio.loop = false;
    audio.currentTime = 0;
    autoPlaybackPrimeTask = Promise.resolve(audio.play())
      .then(() => {
        audio.pause();
        audio.currentTime = 0;
        autoPlaybackUnlocked = true;
        return true;
      })
      .catch(() => false)
      .finally(() => {
        URL.revokeObjectURL(silentUrl);
        autoPlaybackPrimeTask = null;
      });
  }

  function renderedVoiceButton(messageId) {
    const immersive = Array.from(document.querySelectorAll('#xChatImmersiveCard .x-chat-immersive-voice-button'))
      .find((node) => String(node.dataset.voiceMessageId || '') === String(messageId || ''));
    if (immersive) return immersive;
    const controls = Array.from(document.querySelectorAll('#ixLog .x-message-voice-controls'))
      .find((node) => String(node.dataset.voiceMessageId || '') === String(messageId || ''));
    return controls?.querySelector?.('.x-message-voice-button') || null;
  }

  function isCurrentAutoVoiceDream(dreamId) {
    const active = bridge()?.requireActiveConversation?.();
    const dream = dreamById(dreamId);
    return Boolean(
      active?.kind === 'single'
      && String(active?.dream?.id || '') === String(dreamId || '')
      && dream?.voiceMode === 'auto'
      && dream?.voiceHasModel === true
    );
  }

  async function autoPlayReadyMessage(dreamId, messageId, fileID) {
    if (!isCurrentAutoVoiceDream(dreamId)) return false;
    if (!speechTextForMessage(messageFor(dreamId, messageId) || {})) return false;
    const button = renderedVoiceButton(messageId);
    if (!button) return false;
    return playFile(fileID, button, { automatic: true });
  }

  // 预先加载接下来要播的信笺语音片段（最多留 3 个），轮到它时直接开播。
  const letterPreloads = new Map();
  function takePreloadedAudio(url) {
    const audio = letterPreloads.get(url);
    if (audio) letterPreloads.delete(url);
    return audio || null;
  }
  async function prefetchLetterVoice({ userId, dreamId, segment, currentUser: readUser = currentUser, currentDream } = {}) {
    try {
      if (typeof currentDream !== 'function' || readUser()?.userId !== userId || currentDream() !== dreamId) return false;
      const cached = cachedLetterVoice(userId, dreamId, segment);
      if (!cached?.attached || !cached.fileID) return false;
      const url = await bridge()?.resolveCloudTempFileUrl?.(cached.fileID);
      if (!url || letterPreloads.has(url)) return Boolean(url);
      const audio = new Audio();
      audio.preload = 'auto'; audio.src = url; audio.load?.();
      letterPreloads.set(url, audio);
      while (letterPreloads.size > 3) { const oldest = letterPreloads.keys().next().value; const old = letterPreloads.get(oldest); letterPreloads.delete(oldest); if (old) old.src = ''; }
      return true;
    } catch (_) { return false; }
  }
  function knownLetterVoice({ userId, dreamId, segment } = {}) {
    const cached = segment ? cachedLetterVoice(userId, dreamId, segment) : null;
    return cached?.attached && /^cloud:\/\/[^/]+\/.+/.test(String(cached.fileID || '')) ? cached.fileID : '';
  }

  async function playFile(fileID, button, options = {}) {
    if (!fileID) return;
    if (options.guard && !options.guard()) return false;
    if (activeAudioButton === button && activeAudio) {
      if (!activeAudio.paused) {
        activeAudio.pause();
        setVoiceButtonIcon(button, 'play', '播放语音');
        button.classList.remove('is-playing');
        return false;
      }
      try {
        const resumedAudio = activeAudio;
        const epoch = activeLetterEpoch;
        await resumedAudio.play();
        if (options.letterOwner && (epoch !== activeLetterEpoch || !options.guard() || activeAudio !== resumedAudio)) {
          resumedAudio.pause();
          resumedAudio.src = '';
          if (activeAudio === resumedAudio) stopActiveAudio();
          return false;
        }
        return true;
      } catch (error) {
        bridge()?.showToast?.(friendlyVoiceError(error));
        return false;
      }
    }
    activeLetterEpoch += 1;
    stopActiveAudio();
    const requestEpoch = activeLetterEpoch;
    pendingLetterEpoch = options.letterOwner ? requestEpoch : 0;
    button.disabled = true;
    setVoiceButtonIcon(button, 'loading', '正在加载语音');
    let initiatedAudio = null;
    try {
      const url = await bridge()?.resolveCloudTempFileUrl?.(fileID);
      if (requestEpoch !== activeLetterEpoch || options.guard && !options.guard()) {
        if (activeAudioButton !== button) {
          button.disabled = false;
          setVoiceButtonIcon(button, 'play', '播放语音');
        }
        return false;
      }
      if (!url) throw Object.assign(new Error('语音链接暂不可用'), { code: 'CLOUD_FILE_TEMP_URL_UNAVAILABLE' });
      if (pendingLetterEpoch === requestEpoch) pendingLetterEpoch = 0;
      if (activeAudio) stopActiveAudio();
      const audio = options.automatic === true ? ensureAutoPlaybackAudio() : (options.letterOwner && takePreloadedAudio(url)) || new Audio();
      initiatedAudio = audio;
      if (audio.src !== url) audio.src = url;
      activeAudio = audio;
      activeAudioButton = button;
      if (options.letterOwner) activeLetterOwner = options.letterOwner;
      const epoch = activeLetterEpoch;
      audio.preload = 'auto';
      audio.onloadedmetadata = () => window.SHEXChatVoicePresentation?.setDuration(button, audio.duration);
      audio.ondurationchange = audio.onloadedmetadata;
      if (audio.readyState >= 1) audio.onloadedmetadata();
      audio.onplay = () => {
        button.disabled = false;
        setVoiceButtonIcon(button, 'pause', '暂停语音');
        button.classList.add('is-playing');
      };
      audio.onpause = () => {
        if (activeAudioButton !== button) return;
        setVoiceButtonIcon(button, 'play', '播放语音');
        button.classList.remove('is-playing');
      };
      audio.onended = () => {
        if (options.letterOwner && activeAudio !== audio) return;
        const completed = activeAudio === audio && (!options.guard || options.guard());
        stopActiveAudio();
        if (completed) options.onEnded?.();
      };
      audio.onerror = () => {
        if (options.letterOwner && activeAudio !== audio) return;
        const report = activeAudio === audio && (!options.guard || options.guard());
        stopActiveAudio();
        if (report) options.onError?.();
        if (options.automatic !== true) bridge()?.showToast?.(friendlyVoiceError({ code: 'VOICE_AUDIO_PLAYBACK_FAILED' }));
      };
      await audio.play();
      if (options.letterOwner && (epoch !== activeLetterEpoch || !options.guard() || activeAudio !== audio)) {
        audio.pause();
        audio.src = '';
        if (activeAudio === audio) stopActiveAudio();
        return false;
      }
      if (options.automatic === true) autoPlaybackUnlocked = true;
      return true;
    } catch (error) {
      if (activeAudio === initiatedAudio) stopActiveAudio();
      else if (initiatedAudio) { initiatedAudio.pause(); initiatedAudio.src = ''; }
      button.disabled = false;
      setVoiceButtonIcon(button, 'play', '播放语音');
      button.classList.remove('is-playing');
      const blocked = options.automatic === true && ['NotAllowedError', 'AbortError'].includes(String(error?.name || ''));
      if (blocked) {
        autoPlaybackUnlocked = false;
        if (!autoPlaybackBlockedNotified) {
          autoPlaybackBlockedNotified = true;
          bridge()?.showToast?.(friendlyVoiceError({ code: 'VOICE_PLAYBACK_BLOCKED' }));
        }
      } else {
        bridge()?.showToast?.(friendlyVoiceError(error));
      }
      return false;
    }
  }

  function buildVoiceControls(message, dream) {
    const voice = message.voiceAudio && typeof message.voiceAudio === 'object' ? message.voiceAudio : {};
    const canGenerate = dream?.voiceHasModel === true && normalizedVoiceMode(dream.voiceMode) === 'auto';
    if (!canGenerate && voice.status !== 'ready') return null;
    const speechText = speechTextForMessage(message);
    const cost = Number(voice.energyCost || energyCost(speechText));
    if (speechText && !cost && voice.status !== 'ready') return null;
    const controls = document.createElement('div');
    controls.className = 'x-message-voice-controls';
    controls.dataset.voiceMessageId = String(message.id || '');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'x-message-voice-button x-message-voice-bar';
    if (!speechText) {
      setVoiceButtonIcon(button, 'play', '没有可朗读内容');
      button.addEventListener('click', () => void playMessageVoice(dream.id, message.id, button));
    } else if (voice.status === 'pending') {
      setVoiceButtonIcon(button, 'loading', '语音生成中');
      button.disabled = true;
    } else if (voice.status === 'ready' && voice.fileID) {
      setVoiceButtonIcon(button, 'play', '播放语音');
      button.addEventListener('click', () => void playMessageVoice(dream.id, message.id, button));
    } else {
      setVoiceButtonIcon(button, 'play', voice.status === 'failed' ? '重新生成语音' : `生成语音，消耗${cost}点X能量`);
      button.addEventListener('click', () => void playMessageVoice(dream.id, message.id, button));
    }
    controls.append(button);
    if (speechText && voice.status === 'failed') {
      const failure = window.SHEXVoicePolicy?.describeFailure({ code: voice.errorCode, supportCode: voice.supportCode });
      if (failure) {
        const hint = document.createElement('span');
        hint.className = 'x-voice-error-code';
        const detail = /^V999/.test(failure.supportCode)
          ? String(voice.errorStage || (voice.errorCode && voice.errorCode !== 'VOICE_FAILED' ? voice.errorCode : '')).slice(0, 40) : '';
        hint.textContent = `${failure.supportCode}${detail ? `·${detail}` : ''} 请截图给管理员`;
        hint.title = failure.message;
        hint.setAttribute('role', 'status');
        hint.setAttribute('aria-label', failure.message);
        button.title = failure.message;
        controls.append(hint);
      }
    }
    window.SHEXChatVoicePresentation?.addTextToggle(controls, JSON.stringify([currentUser()?.userId || '', dream.id, message.id]));
    return controls;
  }

  function syncImmersiveControl(turn, message, dream) {
    if (!turn) return;
    let button = $('.x-chat-immersive-voice-button', turn);
    const voice = message?.voiceAudio && typeof message.voiceAudio === 'object' ? message.voiceAudio : {};
    const canGenerate = dream?.voiceHasModel === true && normalizedVoiceMode(dream.voiceMode) === 'auto';
    const speechText = message ? speechTextForMessage(message) : '';
    const cost = Number(voice.energyCost || energyCost(speechText));
    const shouldShow = Boolean(message && isEligibleMessage(message, { kind: 'single', dream })
      && (canGenerate && (!speechText || cost > 0) || voice.status === 'ready' && voice.fileID));
    if (!shouldShow) {
      if (button && activeAudioButton === button) stopActiveAudio();
      button?.remove();
      return;
    }
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = 'x-message-voice-button x-chat-immersive-voice-button';
      const name = $('.x-chat-immersive-name', turn);
      if (name) name.insertAdjacentElement('afterend', button);
      else turn.prepend(button);
    }
    const messageId = String(message.id || '');
    if (button.dataset.voiceMessageId && button.dataset.voiceMessageId !== messageId && activeAudioButton === button) stopActiveAudio();
    button.dataset.voiceMessageId = messageId;
    delete button.dataset.voiceSupportCode;
    button.disabled = false;
    button.onclick = null;
    if (!speechText) {
      setVoiceButtonIcon(button, 'play', '没有可朗读内容');
      button.classList.remove('is-playing');
      button.onclick = () => void playMessageVoice(dream.id, message.id, button);
    } else if (voice.status === 'pending') {
      setVoiceButtonIcon(button, 'loading', '语音生成中');
      button.disabled = true;
    } else if (voice.status === 'ready' && voice.fileID) {
      if (activeAudioButton === button && activeAudio && !activeAudio.paused) {
        setVoiceButtonIcon(button, 'pause', '暂停语音');
        button.classList.add('is-playing');
      } else {
        setVoiceButtonIcon(button, 'play', '播放语音');
        button.classList.remove('is-playing');
      }
      button.onclick = () => void playMessageVoice(dream.id, message.id, button);
    } else {
      setVoiceButtonIcon(button, 'play', voice.status === 'failed' ? '重新生成语音' : `生成语音，消耗${cost}点X能量`);
      button.classList.remove('is-playing');
      button.onclick = () => void playMessageVoice(dream.id, message.id, button);
    }
    if (speechText && voice.status === 'failed') {
      const failure = window.SHEXVoicePolicy?.describeFailure({ code: voice.errorCode, supportCode: voice.supportCode });
      if (failure) {
        button.dataset.voiceSupportCode = failure.supportCode;
        button.title = failure.message;
        button.setAttribute('aria-label', failure.message);
      }
    }
  }

  function refreshRenderedImmersiveVoiceControl(dreamId, messageId) {
    const turn = Array.from(document.querySelectorAll('#xChatImmersiveCard .x-chat-immersive-turn.is-ta'))
      .find((item) => String(item.dataset.messageId || '') === String(messageId || ''));
    if (!turn) return;
    syncImmersiveControl(turn, messageFor(dreamId, messageId), dreamById(dreamId));
  }

  function refreshRenderedVoiceControl(dreamId, messageId) {
    const bubble = Array.from(document.querySelectorAll('#ixLog [data-id]'))
      .find((node) => String(node.dataset.id || '') === String(messageId || ''));
    const message = messageFor(dreamId, messageId);
    const dream = dreamById(dreamId);
    if (!message || !dream) return;
    if (bubble) {
      const previous = bubble.querySelector('.x-message-voice-controls');
      const next = buildVoiceControls(message, dream);
      if (previous && next) {
        // Keep the mounted control container stable. Only swap its button
        // contents/listeners so the surrounding chat bubble never relayouts or
        // replays an entry animation while voice status changes.
        previous.className = next.className;
        previous.dataset.voiceMessageId = next.dataset.voiceMessageId || '';
        previous.dataset.voicePresentationKey = next.dataset.voicePresentationKey || '';
        previous.replaceChildren(...Array.from(next.childNodes));
      }
      else if (previous) previous.remove();
      else if (next) window.SHEXChatVoicePresentation?.mount(bubble.querySelector('.ix-bubble') || bubble, next);
      window.SHEXChatVoicePresentation?.syncRoot(bubble);
    }
    refreshRenderedImmersiveVoiceControl(dreamId, messageId);
  }

  function decorateMessage(wrap, message, state, active) {
    if (!isEligibleMessage(message, active)) return;
    const dream = active.dream;
    const voiceControls = buildVoiceControls(message, dream);
    if (voiceControls) window.SHEXChatVoicePresentation?.mount(wrap, voiceControls);
  }

  function onMessageCommitted(payload = {}) {
    const dreamId = String(payload.dreamId || '');
    const message = payload.message || {};
    if (!dreamId || message.role !== 'ta' || !message.text || message.sticker || message.image || message.media || message.type === 'notice') return;
    if (message.sourceType === 'opening' || message.fixedOpening === true) return;
    const speechText = speechTextForMessage(message);
    if (!speechText) return;
    const dream = dreamById(dreamId);
    if (!dream || dream.voiceMode !== 'auto' || dream.voiceHasModel !== true) return;
    if (!energyCost(speechText)) {
      updateMessageVoice(dreamId, message.id, { status: 'unsupported', errorCode: 'VOICE_TEXT_TOO_LONG', errorMessage: `超过${MAX_TTS_CHARS}字，暂不生成语音` });
      return;
    }
    void queueAutoMessageVoice(dreamId, message.id).catch(() => {});
  }

  function setSettingsStatus(mask, message, isError = false) {
    const node = $('#xVoiceOperationStatus', mask);
    if (!node) return;
    node.textContent = message || '';
    node.classList.toggle('is-error', Boolean(isError));
  }

  function normalizedVoiceMode(value) {
    return ['manual', 'auto'].includes(String(value || '')) ? String(value) : 'off';
  }

  function syncVoiceModeControls(mask, dream) {
    if (!mask || !dream) return;
    const currentMode = normalizedVoiceMode(dream.voiceMode) === 'auto' ? 'auto' : 'off';
    mask.querySelectorAll('[data-voice-mode]').forEach((button) => {
      const active = button.dataset.voiceMode === currentMode;
      button.disabled = false;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    const settingsBody = $('#xVoiceSettingsBody', mask);
    if (settingsBody) settingsBody.hidden = currentMode !== 'auto';
  }

  function saveVoiceMode(mask, dream, nextMode) {
    const currentMode = normalizedVoiceMode(dream?.voiceMode);
    const normalized = normalizedVoiceMode(nextMode);
    const patch = { voiceMode: normalized };
    if (normalized !== 'off') patch.voiceLastEnabledMode = normalized;
    else if (currentMode !== 'off') patch.voiceLastEnabledMode = currentMode;
    updateDreamVoice(dream.id, patch);
    syncVoiceModeControls(mask, dreamById(dream.id) || { ...dream, ...patch });
    void bridge()?.syncUserDataAfterResourceChange?.('语音回复模式已保存');
  }

  function applyProfileToSettings(mask, dream, profile = {}) {
    const binding = window.SHEXVoiceLinkState?.bindingPresentation?.(profile) || {
      hasVoice: Boolean(profile.hasVoice),
      status: profile.status || (profile.hasVoice ? 'ready' : 'none'),
      label: profile.hasVoice ? '已绑定' : profile.hasPending ? '等待完成绑定' : '未设置'
    };
    const hasVoice = binding.hasVoice;
    updateDreamVoice(dream.id, {
      voiceHasModel: hasVoice,
      voiceStatus: binding.status,
      voiceVersion: Number(profile.version || 0),
      voiceCreatedAt: Number(profile.voiceCreatedAt || 0)
    });
    const freshDream = dreamById(dream.id) || dream;
    const status = $('#xVoiceProfileStatus', mask);
    if (status) status.textContent = binding.label;
    if (status && hasVoice && profile.source === 'fish_public') {
      status.textContent = `公开音色 · ${profile.voiceTitle || 'Fish 音色'}`;
    } else if (status && !hasVoice && window.SHEXVoiceLinkState?.templateVoiceBinding?.(dream)) {
      status.textContent = '角色版本已携带公开音色，首次开启时自动绑定';
    }
    syncVoiceModeControls(mask, freshDream);
    const create = $('#xCreateVoiceModel', mask);
    if (create) create.textContent = `${hasVoice ? '更换声音' : profile.hasPending ? '完成绑定' : '赋予TA专属声音'} · ${modelCost()}点`;
    const preview = $('#xPreviewVoice', mask);
    const remove = $('#xDeleteVoice', mask);
    if (preview) preview.hidden = !hasVoice;
    if (remove) remove.hidden = !hasVoice && !profile.hasPending;
    mask.dataset.voiceHasModel = String(hasVoice);
    mask.dataset.voiceHasPending = String(Boolean(profile.hasPending));
    mask.dataset.voiceVersion = String(Number(profile.version || 0));
    mask.dataset.voiceSource = String(profile.source || '');
  }

  async function fetchProfile(mask, dream) {
    setSettingsStatus(mask, '正在读取声音状态…');
    try {
      const data = await cloudCall({ action: 'getVoiceProfile', dreamId: dream.id });
      applyProfileToSettings(mask, dream, data.profile || {});
      cleanupExpiredAudioOncePerDay();
      setSettingsStatus(mask, '');
      return data.profile || {};
    } catch (error) {
      setSettingsStatus(mask, friendlyVoiceError(error), true);
      return null;
    }
  }

  function refreshSettings(mask, active) {
    if (!mask || active?.kind !== 'single' || !active.dream) return;
    bindSettings();
    mask.dataset.voiceDreamId = active.dream.id;
    const publicVoiceBind = $('#xPublicVoiceBind', mask);
    if (publicVoiceBind) publicVoiceBind.hidden = !currentUser()?.userId;
    const title = $('#xVoiceDreamName', mask);
    if (title) title.textContent = `正在为【${active.dream.name || '当前梦角'}】设置专属声音。Fish 只负责把 SHE.X 已生成的文字转换成声音。`;
    syncVoiceModeControls(mask, active.dream);
    const status = $('#xVoiceProfileStatus', mask);
    if (status) status.textContent = active.dream.voiceHasModel ? '已绑定' : '未设置';
    void fetchProfile(mask, active.dream);
    void enforceVoicePlanState(mask, active.dream);
  }

  function clearVoiceSourceForm(mask) {
    const fileInput = $('#xVoiceSourceInput', mask);
    if (fileInput) fileInput.value = '';
    const consentInput = $('#xVoiceConsentInput', mask);
    if (consentInput) consentInput.checked = false;
    const fileName = $('#xVoiceFileName', mask);
    if (fileName) fileName.textContent = '支持 MP3、WAV、M4A，文件不超过20MB。';
  }

  async function syncVoiceStateBestEffort(message) {
    try {
      return await bridge()?.syncUserDataAfterResourceChange?.(message);
    } catch (error) {
      console.warn('[SHEXVoice] voice state sync will retry in background', {
        code: String(error?.code || ''),
        detail: String(error?.message || error || '')
      });
      return false;
    }
  }

  async function recoverCompletedVoiceBinding(mask, dream, baselineVersion, options = {}) {
    const extended = options.extended === true;
    const delays = extended ? EXTENDED_RECOVERY_DELAYS_MS : SHORT_RECOVERY_DELAYS_MS;
    if (extended) setSettingsStatus(mask, '网络响应中断，正在确认后台是否已经完成绑定…');
    for (const delayMs of delays) {
      await new Promise((resolve) => window.setTimeout(resolve, delayMs));
      try {
        const data = await cloudCall({ action: 'getVoiceProfile', dreamId: dream.id });
        const profile = data.profile || {};
        if (profile.hasVoice === true && Number(profile.version || 0) > Number(baselineVersion || 0)) {
          applyProfileToSettings(mask, dream, profile);
          setSettingsStatus(mask, `专属声音已绑定，已消耗 ${modelCost()} X能量。`);
          clearVoiceSourceForm(mask);
          refreshEnergySilently();
          void syncVoiceStateBestEffort('梦角专属声音已绑定');
          return true;
        }
      } catch (_) {
        // The original mutation must never be repeated here. A read-only
        // profile check is retried so a lost success response does not become
        // a false red failure message on mobile networks.
      }
    }
    return false;
  }

  function unresolvedVoiceMutationMessage(error) {
    return isAmbiguousVoiceMutationError(error)
      ? '本次请求结果暂时无法确认。请退出聊天设置后重新进入查看；如果仍未绑定，请联系管理员。'
      : friendlyVoiceError(error);
  }

  function logUnresolvedVoiceMutation(mask, dreamId, error, action) {
    console.warn('[SHEXVoice] voice mutation response unavailable', {
      action,
      dreamId,
      requestId: String(mask?.dataset?.voicePendingRequestId || ''),
      code: String(error?.code || ''),
      detail: String(error?.message || error || '')
    });
  }

  function openVoiceSourceGuide(mask) {
    const overlay = $('#xVoiceGuideOverlay', mask);
    if (!overlay) return Promise.resolve(true);
    return new Promise((resolve) => {
      const closeButton = $('#xVoiceGuideClose', overlay);
      const cancelButton = $('#xVoiceGuideCancel', overlay);
      const continueButton = $('#xVoiceGuideContinue', overlay);
      let settled = false;
      const finish = (accepted) => {
        if (settled) return;
        settled = true;
        overlay.hidden = true;
        document.removeEventListener('keydown', onKeyDown, true);
        overlay.removeEventListener('click', onOverlayClick);
        closeButton?.removeEventListener('click', onCancel);
        cancelButton?.removeEventListener('click', onCancel);
        continueButton?.removeEventListener('click', onContinue);
        resolve(accepted);
      };
      const onCancel = () => finish(false);
      const onContinue = () => finish(true);
      const onOverlayClick = (event) => {
        if (event.target === overlay) finish(false);
      };
      const onKeyDown = (event) => {
        if (event.key === 'Escape') finish(false);
      };
      overlay.hidden = false;
      document.addEventListener('keydown', onKeyDown, true);
      overlay.addEventListener('click', onOverlayClick);
      closeButton?.addEventListener('click', onCancel);
      cancelButton?.addEventListener('click', onCancel);
      continueButton?.addEventListener('click', onContinue);
      window.setTimeout(() => continueButton?.focus?.(), 0);
    });
  }

  async function createOrReplaceVoice(mask) {
    if (!await requirePaidVoicePlan()) return;
    const dreamId = String(mask.dataset.voiceDreamId || '');
    const dream = dreamById(dreamId);
    if (!dream) return;
    const baselineVersion = Number(dream.voiceVersion || mask.dataset.voiceVersion || 0);
    const button = $('#xCreateVoiceModel', mask);
    if (mask.dataset.voiceHasPending === 'true') {
      if (!window.confirm(`完成【${dream.name || '当前梦角'}】专属声音的绑定，将消耗 ${modelCost()} X能量。是否继续？`)) return;
      if (button) button.disabled = true;
      setSettingsStatus(mask, '声音已经生成，正在完成能量扣除与绑定…');
      try {
        const data = await cloudCall({ action: 'finalizeVoiceModel', dreamId });
        applyProfileToSettings(mask, dream, data.profile || {});
        setSettingsStatus(mask, `专属声音已绑定，已消耗 ${data.energyCost || modelCost()} X能量。`);
        refreshEnergySilently();
        void syncVoiceStateBestEffort('梦角专属声音已绑定');
      } catch (error) {
        const ambiguous = isAmbiguousVoiceMutationError(error);
        logUnresolvedVoiceMutation(mask, dreamId, error, 'finalizeVoiceModel');
        if (!await recoverCompletedVoiceBinding(mask, dream, baselineVersion, { extended: ambiguous })) {
          setSettingsStatus(mask, unresolvedVoiceMutationMessage(error), true);
        }
      } finally {
        if (button) button.disabled = false;
      }
      return;
    }
    const fileInput = $('#xVoiceSourceInput', mask);
    const file = fileInput?.files?.[0];
    const consent = $('#xVoiceConsentInput', mask)?.checked === true;
    if (!file) {
      bridge()?.showToast?.('请先选择 MP3、WAV 或 M4A 声音素材');
      return;
    }
    if (!consent) {
      bridge()?.showToast?.('请先确认拥有声音素材的使用权限');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      bridge()?.showToast?.('声音素材不能超过20MB');
      return;
    }
    if (!window.confirm(`为【${dream.name || '当前梦角'}】生成专属声音，成功后将消耗 ${modelCost()} X能量。是否继续？`)) return;
    if (button) button.disabled = true;
    setSettingsStatus(mask, '正在上传声音素材…');
    try {
      if (!window.SHEXCloudStorage?.uploadFile) throw new Error('声音上传服务暂时不可用');
      const asset = await window.SHEXCloudStorage.uploadFile(file, 'voice-sources', { allowLocalFallback: false });
      if (!asset?.fileID) throw new Error('声音素材上传失败，请检查网络后重试');
      setSettingsStatus(mask, '正在为TA生成专属声音，请不要关闭页面…');
      const requestId = `voice_model_${dreamId.replace(/[^a-zA-Z0-9_-]/g, '_')}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`.slice(0, 180);
      mask.dataset.voicePendingRequestId = requestId;
      const data = await cloudCall({
        action: 'createVoiceModel',
        dreamId,
        requestId,
        sourceFileId: asset.fileID,
        filename: file.name,
        mimeType: file.type,
        size: file.size,
        consentAccepted: true
      });
      applyProfileToSettings(mask, dream, data.profile || {});
      setSettingsStatus(mask, `专属声音已绑定，已消耗 ${data.energyCost || modelCost()} X能量。`);
      clearVoiceSourceForm(mask);
      refreshEnergySilently();
      void syncVoiceStateBestEffort('梦角专属声音已绑定');
    } catch (error) {
      const ambiguous = isAmbiguousVoiceMutationError(error);
      logUnresolvedVoiceMutation(mask, dreamId, error, 'createVoiceModel');
      if (!await recoverCompletedVoiceBinding(mask, dream, baselineVersion, { extended: ambiguous })) {
        setSettingsStatus(mask, unresolvedVoiceMutationMessage(error), true);
      }
    } finally {
      if (button) button.disabled = false;
    }
  }

  async function deleteVoice(mask) {
    const dreamId = String(mask.dataset.voiceDreamId || '');
    const dream = dreamById(dreamId);
    if (dream && mask.dataset.voiceSource === 'fish_public') {
      if (!window.confirm(`解除【${dream.name || '当前梦角'}】与当前 Fish 公开音色的绑定？不会删除 Fish 公共音色，历史语音可能无法继续播放。`)) return;
      setSettingsStatus(mask, '正在解除公开音色绑定…');
      try {
        const data = await cloudCall({ action: 'deleteVoiceModel', dreamId });
        updateDreamVoice(dreamId, { voiceMode: 'off', voiceHasModel: false, voiceStatus: 'none', voiceVersion: 0, voiceCreatedAt: 0 });
        applyProfileToSettings(mask, dreamById(dreamId) || dream, data.profile || {});
        setSettingsStatus(mask, '公开音色绑定已解除，Fish 公共音色未被删除。');
        await syncVoiceStateBestEffort('梦角公开音色绑定已解除');
      } catch (error) {
        setSettingsStatus(mask, friendlyVoiceError(error), true);
      }
      return;
    }
    if (!dream || !window.confirm(`删除【${dream.name || '当前梦角'}】的专属声音？已消耗的 X能量不会退还，历史语音可能无法继续播放。`)) return;
    setSettingsStatus(mask, '正在删除专属声音…');
    try {
      const data = await cloudCall({ action: 'deleteVoiceModel', dreamId });
      updateDreamVoice(dreamId, { voiceMode: 'off', voiceHasModel: false, voiceStatus: 'none', voiceVersion: 0, voiceCreatedAt: 0 });
      applyProfileToSettings(mask, dreamById(dreamId) || dream, data.profile || {});
      setSettingsStatus(mask, '专属声音已删除。');
      await bridge()?.syncUserDataAfterResourceChange?.('梦角专属声音已删除');
    } catch (error) {
      setSettingsStatus(mask, friendlyVoiceError(error), true);
    }
  }

  async function bindPublicVoice(mask) {
    const dreamId = String(mask.dataset.voiceDreamId || '');
    const dream = dreamById(dreamId);
    const input = $('#xPublicVoiceReference', mask);
    const publicVoiceReference = String(input?.value || '').trim();
    if (!dream || !publicVoiceReference) {
      bridge()?.showToast?.('请先粘贴 Fish 公开音色链接或音色ID');
      return;
    }
    if (!window.confirm(`将验证并为【${dream.name || '当前梦角'}】绑定这个 Fish 公开音色。绑定本身不消耗X能量，之后生成语音仍按字数扣除X能量。是否继续？`)) return;
    const button = $('#xBindPublicVoice', mask);
    if (button) button.disabled = true;
    setSettingsStatus(mask, '正在验证 Fish 公开音色并绑定…');
    try {
      const data = await cloudCall({ action: 'bindPublicVoice', dreamId, publicVoiceReference });
      applyProfileToSettings(mask, dream, data.profile || {});
      if (input) input.value = '';
      setSettingsStatus(mask, `公开音色【${data.profile?.voiceTitle || 'Fish 音色'}】已绑定，未扣除X能量。`);
      void syncVoiceStateBestEffort('梦角公开音色已绑定');
    } catch (error) {
      setSettingsStatus(mask, friendlyVoiceError(error), true);
    } finally {
      if (button) button.disabled = false;
    }
  }

  async function previewVoice(mask) {
    if (!await requirePaidVoicePlan()) return;
    const dreamId = String(mask.dataset.voiceDreamId || '');
    const dream = dreamById(dreamId);
    if (!dream?.voiceHasModel) return;
    const version = Number(dream.voiceVersion || mask.dataset.voiceVersion || 0);
    const button = $('#xPreviewVoice', mask);
    if (button) button.disabled = true;
    setSettingsStatus(mask, '正在准备试听声音…');
    try {
      const data = await cloudCall({
        action: 'synthesizeSpeech',
        dreamId,
        messageId: `preview_${version}`,
        requestId: `voice_preview_${dreamId.replace(/[^a-zA-Z0-9_-]/g, '_')}_${version}`.slice(0, 180),
        sourceType: 'voice_preview',
        text: `${dream.name || '我'}会一直陪着你。`
      });
      const played = await playFile(data.fileID, button);
      setSettingsStatus(mask, played
        ? `试听已准备，首次生成消耗 ${data.energyCost || 1} X能量，重复试听不扣费。`
        : '声音已绑定，试听音频也已生成；当前播放链接暂时不可用，可稍后再点试听。');
      refreshEnergySilently();
    } catch (error) {
      setSettingsStatus(mask, friendlyVoiceError(error), true);
    } finally {
      if (button) button.disabled = false;
    }
  }

  function bindSettings() {
    if (settingsBound) return;
    settingsBound = true;
    document.addEventListener('pointerdown', (event) => {
      const autoModeButton = event.target?.closest?.('[data-voice-mode="auto"]');
      const active = bridge()?.requireActiveConversation?.();
      if (autoModeButton || (active?.kind === 'single' && dreamById(active?.dream?.id)?.voiceMode === 'auto')) {
        primeAutoPlayback();
      }
    }, { capture: true });
    document.addEventListener('keydown', () => {
      const active = bridge()?.requireActiveConversation?.();
      if (active?.kind === 'single' && dreamById(active?.dream?.id)?.voiceMode === 'auto') primeAutoPlayback();
    }, { capture: true });
    document.addEventListener('change', (event) => {
      const mask = event.target?.closest?.('#ixSettingsMask');
      if (!mask) return;
      if (event.target.id === 'xVoiceSourceInput') {
        const file = event.target.files?.[0];
        const node = $('#xVoiceFileName', mask);
        if (node) node.textContent = file ? `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)}MB` : '支持 MP3、WAV、M4A，文件不超过20MB。';
      }
    });
    document.addEventListener('click', async (event) => {
      const mask = event.target?.closest?.('#ixSettingsMask');
      if (!mask) return;
      const modeButton = event.target.closest('[data-voice-mode]');
      if (modeButton) {
        let dream = dreamById(String(mask.dataset.voiceDreamId || ''));
        if (!dream) return;
        const nextMode = normalizedVoiceMode(modeButton.dataset.voiceMode);
        if (nextMode === 'auto') {
          modeButton.disabled = true;
          const allowed = await requirePaidVoicePlan();
          modeButton.disabled = false;
          if (!allowed) {
            syncVoiceModeControls(mask, dream);
            return;
          }
          if (window.SHEXVoiceLinkState?.shouldActivateTemplateVoice?.(dream, { hasVoice: dream.voiceHasModel === true })) {
            modeButton.disabled = true;
            setSettingsStatus(mask, '正在启用角色版本携带的公开音色…');
            try {
              const data = await cloudCall({ action: 'activateTemplatePublicVoice', dreamId: dream.id });
              applyProfileToSettings(mask, dream, data.profile || {});
              dream = dreamById(dream.id) || dream;
              setSettingsStatus(mask, data.preservedUserVoice ? '继续使用你为这个角色设置的声音。' : '角色公开音色已启用；尚未生成语音，也未扣除X能量。');
            } catch (error) {
              setSettingsStatus(mask, friendlyVoiceError(error), true);
              syncVoiceModeControls(mask, dream);
              modeButton.disabled = false;
              return;
            }
            modeButton.disabled = false;
          }
        }
        if (nextMode === 'auto' && dream.voiceMode !== 'auto' && !window.confirm('开启全语音模式后，TA每条不超过240字的新文字回复都会自动生成并播放语音，同时按长度消耗 1～14 X能量。若浏览器阻止自动播放，仍可点播放按钮。是否开启？')) return;
        saveVoiceMode(mask, dream, nextMode);
        return;
      }
      if (event.target.closest('#xCreateVoiceModel')) {
        const mayContinue = mask.dataset.voiceHasPending === 'true' || await openVoiceSourceGuide(mask);
        if (mayContinue) void createOrReplaceVoice(mask);
        return;
      }
      if (event.target.closest('#xBindPublicVoice')) void bindPublicVoice(mask);
      if (event.target.closest('#xPreviewVoice')) void previewVoice(mask);
      if (event.target.closest('#xDeleteVoice')) void deleteVoice(mask);
    });
  }

  window.SHEXVoice = {
    decorateMessage,
    wrapMessage: node => window.SHEXChatVoicePresentation?.wrapMessage(node) || node,
    onMessageCommitted,
    refreshSettings,
    requestMessageVoice,
    requestTextVoice,
    normalizeLetterText,
    planLetterVoice,
    requestLetterVoice,
    playLetterVoice,
    prefetchLetterVoice,
    knownLetterVoice,
    stopLetterVoice,
    rememberLetterVoiceReference,
    onLetterPartitionChange,
    syncImmersiveControl,
    energyCost,
    readableLength,
    speechTextForMessage,
    failureMessage: friendlyVoiceError
  };

  (window.queueMicrotask || ((callback) => window.setTimeout(callback, 0)))(() => {
    const turns = Array.from(document.querySelectorAll('#xChatImmersiveCard .x-chat-immersive-turn.is-ta'));
    const turn = turns[turns.length - 1] || null;
    const active = bridge()?.requireActiveConversation?.();
    if (!turn || active?.kind !== 'single') return;
    const messageId = String(turn.dataset.messageId || '');
    syncImmersiveControl(turn, messageFor(active.dream?.id, messageId), active.dream);
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindSettings, { once: true });
  else bindSettings();
})();
