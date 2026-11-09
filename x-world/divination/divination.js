(() => {
  'use strict';

  const MAJOR_ARCANA = [
    'major_00_fool', 'major_01_magician', 'major_02_high_priestess', 'major_03_empress',
    'major_04_emperor', 'major_05_hierophant', 'major_06_lovers', 'major_07_chariot',
    'major_08_strength', 'major_09_hermit', 'major_10_wheel_of_fortune', 'major_11_justice',
    'major_12_hanged_man', 'major_13_death', 'major_14_temperance', 'major_15_devil',
    'major_16_tower', 'major_17_star', 'major_18_moon', 'major_19_sun',
    'major_20_judgement', 'major_21_world'
  ];
  const MINOR_RANKS = ['ace', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'page', 'knight', 'queen', 'king'];
  const TAROT_CARD_IDS = [
    ...MAJOR_ARCANA,
    ...['wands', 'cups', 'swords', 'pentacles'].flatMap((suit) => MINOR_RANKS.map((rank) => `minor_${suit}_${rank}`))
  ];
  const MAJOR_CARD_NAMES = {
    major_00_fool: '愚者', major_01_magician: '魔术师', major_02_high_priestess: '女祭司', major_03_empress: '皇后',
    major_04_emperor: '皇帝', major_05_hierophant: '教皇', major_06_lovers: '恋人', major_07_chariot: '战车',
    major_08_strength: '力量', major_09_hermit: '隐士', major_10_wheel_of_fortune: '命运之轮', major_11_justice: '正义',
    major_12_hanged_man: '吊人', major_13_death: '死神', major_14_temperance: '节制', major_15_devil: '恶魔',
    major_16_tower: '高塔', major_17_star: '星星', major_18_moon: '月亮', major_19_sun: '太阳',
    major_20_judgement: '审判', major_21_world: '世界'
  };
  const MINOR_SUIT_NAMES = { wands: '权杖', cups: '圣杯', swords: '宝剑', pentacles: '星币' };
  const MINOR_RANK_NAMES = { ace: '王牌', 2: '二', 3: '三', 4: '四', 5: '五', 6: '六', 7: '七', 8: '八', 9: '九', 10: '十', page: '侍从', knight: '骑士', queen: '王后', king: '国王' };
  const DIVINATION_AUDIO_SRC = './audio/divination-music.mp3';
  const DIVINATION_AUDIO_MUTED_KEY = 'shex_divination_audio_muted_v1';
  const DIVINATION_DRAFT_STORAGE_VERSION = 2;
  const DIVINATION_INTERPRET_TIMEOUT_MS = 55000;
  const DIVINATION_STATUS_POLL_MS = 2500;
  const DIVINATION_STATUS_POLL_MAX_MS = 4 * 60 * 1000;
  const DIVINATION_DETERMINISTIC_ERROR_CODES = new Set([
    'SESSION_EXPIRED',
    'PLAN_REQUIRED',
    'ENERGY_NOT_ENOUGH',
    'DIVINATION_DAILY_LIMIT_REACHED',
    'DIVINATION_DAILY_LIMIT_CHECK_FAILED',
    'INVALID_DIVINATION_PARAMS',
    'INVALID_REQUEST_ID',
    'DREAM_NOT_FOUND',
    'DIVINATION_REQUEST_CONFLICT',
    'DIVINATION_REQUEST_NOT_FOUND',
    'DIVINATION_DATA_UNAVAILABLE',
    'DIVINATION_CLAIM_FAILED',
    'PLAN_CHECK_FAILED',
    'AI_REQUEST_FAILED',
    'AI_TIMEOUT',
    'AI_EMPTY_RESPONSE'
  ]);
  const DIVINATION_HELP_CONTENT = Object.freeze({
    question: Object.freeze({
      title: '如何提问？',
      body: '好问题是好解读的起点。抽牌前先想清楚这次想问什么，只问一个具体的问题，不要把好几个疑虑揉在一起问。问题本身尽量用一句话讲清楚——背景信息可以详细复杂，但问题要简洁明确，并说清楚是关于谁、关于什么事。尽量避免用否定句或预设答案的方式提问，比如“他是不是不爱我了”，可以换成更开放的问法，比如“我们目前的关系状态是怎样的”。如果问的是运势走向，最好给一个具体的时间范围，比如“接下来三个月”，而不是笼统地问“以后会怎样”。想清楚这几点，牌面才更容易给你真正想要的答案，千万不要打错字'
    }),
    background: Object.freeze({
      title: '如何补充背景？',
      body: '背景信息是帮助他更好理解你此刻处境的补充说明，说清楚你这份疑虑或在意，究竟是从哪里来的。可以想一想：是因为看到了什么具体的事、他说过的某句话、还是他最近的某个举动，让你心里生出了这种感受？是哪一次互动之后开始不安的？也可以写写你们最近的相处频率、发生的具体小事，或者让你在意的细节。不需要长篇大论，抓住让你此刻最在意的那个点说清楚就好，比如“最近他回复变慢了，我总忍不住去想是不是自己做错了什么，越想越不安”，这样会比“我们最近关系一般”这种笼统说法更有帮助。背景信息不是必填项，暂时想不清楚也可以先不写，千万不要打错字'
    })
  });
  const CARD_REVEAL_IMAGE_BASE = './images/tarot-cards-reveal/';
  const drafts = new Map();
  let activeFlow = null;
  let activeDraft = null;
  let dragState = null;
  let divinationCloudApp = null;
  let revealTimers = [];
  let interpretationStatusTimer = null;
  let interpretationStatusFadeTimer = null;
  let viewportLayoutFrame = 0;
  let divinationAudio = null;
  const revealImageCache = new Map();
  const interpretationPollStates = new Map();
  const INTERPRETATION_LOADING_TEXTS = Object.freeze([
    '正在为你解读...',
    '正在梳理牌面线索...',
    '讯息即将浮现...'
  ]);

  function shuffleCards() {
    const deck = TAROT_CARD_IDS.map((id) => ({
      id,
      imagePath: `${CARD_REVEAL_IMAGE_BASE}${id}.webp`,
      revealImagePath: `${CARD_REVEAL_IMAGE_BASE}${id}.webp`
    }));
    for (let index = deck.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [deck[index], deck[swapIndex]] = [deck[swapIndex], deck[index]];
    }
    return deck;
  }

  function currentDivinationUserId() {
    return String(window.SHEXAuth?.current?.()?.userId || 'guest').trim() || 'guest';
  }

  function divinationDraftStorageKey(dreamId) {
    const userId = currentDivinationUserId().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80) || 'guest';
    const safeDreamId = String(dreamId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 120) || 'unknown';
    return `shex_divination_draft_${userId}_${safeDreamId}_v${DIVINATION_DRAFT_STORAGE_VERSION}`;
  }

  function emptyDraft() {
    return {
      targetFullName: '',
      questionText: '',
      backgroundText: '',
      screen: 'question',
      deck: [],
      selectedIds: [],
      orientations: {},
      deckRotation: 0,
      revealPreloadKey: '',
      revealPreloadPromise: null,
      interpretation: null,
      interpretationPending: false,
      interpretationRequestId: '',
      interpretationStatus: '',
      historyRecords: [],
      historyDetail: null,
      historyLoading: false,
      historyError: ''
    };
  }

  function restoreDraft(dreamId) {
    let stored = null;
    try {
      stored = JSON.parse(localStorage.getItem(divinationDraftStorageKey(dreamId)) || 'null');
    } catch (_) {
      stored = null;
    }
    const draft = emptyDraft();
    if (!stored || typeof stored !== 'object') return draft;
    const deckIds = Array.isArray(stored.deckIds) ? stored.deckIds.filter((id) => TAROT_CARD_IDS.includes(id)) : [];
    draft.targetFullName = String(stored.targetFullName || '').slice(0, 80);
    draft.questionText = String(stored.questionText || '').slice(0, 1200);
    draft.backgroundText = String(stored.backgroundText || '').slice(0, 2400);
    draft.screen = ['question', 'meditate', 'select', 'reveal', 'history'].includes(stored.screen) ? stored.screen : 'question';
    draft.deck = deckIds.map((id) => ({ id, imagePath: `${CARD_REVEAL_IMAGE_BASE}${id}.webp`, revealImagePath: `${CARD_REVEAL_IMAGE_BASE}${id}.webp` }));
    draft.selectedIds = Array.isArray(stored.selectedIds) ? stored.selectedIds.filter((id) => deckIds.includes(id)).slice(0, 3) : [];
    draft.orientations = stored.orientations && typeof stored.orientations === 'object' ? stored.orientations : {};
    draft.deckRotation = Number(stored.deckRotation || 0) || 0;
    draft.interpretation = String(stored.interpretation || '').trim() || null;
    draft.interpretationRequestId = String(stored.interpretationRequestId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 240);
    draft.interpretationStatus = String(stored.interpretationStatus || '');
    draft.interpretationPending = Boolean(draft.interpretationRequestId && !draft.interpretation && ['processing', 'generated', 'charged'].includes(draft.interpretationStatus));
    if (draft.screen === 'reveal' && (draft.selectedIds.length !== 3 || !draft.deck.length)) draft.screen = 'question';
    return draft;
  }

  function persistDraft(dreamId, draft) {
    if (!draft) return;
    try {
      localStorage.setItem(divinationDraftStorageKey(dreamId), JSON.stringify({
        version: DIVINATION_DRAFT_STORAGE_VERSION,
        targetFullName: draft.targetFullName,
        questionText: draft.questionText,
        backgroundText: draft.backgroundText,
        screen: draft.screen,
        deckIds: draft.deck.map((card) => card.id),
        selectedIds: draft.selectedIds,
        orientations: draft.orientations,
        deckRotation: draft.deckRotation,
        interpretation: draft.interpretation || '',
        interpretationRequestId: draft.interpretationRequestId || '',
        interpretationStatus: draft.interpretationStatus || '',
        updatedAt: Date.now()
      }));
    } catch (_) {}
  }

  function clearPersistedDraft(dreamId) {
    try { localStorage.removeItem(divinationDraftStorageKey(dreamId)); } catch (_) {}
  }

  function getDraft(dreamId) {
    const key = String(dreamId || '');
    if (!drafts.has(key)) {
      drafts.set(key, restoreDraft(key));
    }
    return drafts.get(key);
  }

  function resetDraftForNewQuestion(draft, options = {}) {
    if (!draft) return;
    clearRevealTimers();
    draft.targetFullName = '';
    draft.questionText = '';
    draft.backgroundText = '';
    draft.screen = 'question';
    draft.deck = [];
    draft.selectedIds = [];
    draft.orientations = {};
    draft.deckRotation = 0;
    draft.revealPreloadKey = '';
    draft.revealPreloadPromise = null;
    draft.interpretation = null;
    draft.interpretationPending = false;
    draft.interpretationRequestId = '';
    draft.interpretationStatus = '';
    draft.historyDetail = null;
    draft.historyLoading = false;
    draft.historyError = '';
    if (options.clearHistory) draft.historyRecords = [];
  }

  function resetActiveDraftForExit() {
    if (activeDraft && activeDraft.deck.length && !activeDraft.interpretation) {
      // 已抽牌但尚未成功解读：保留草稿，方便用户之后（比如去开通套餐）回来继续解读
      clearRevealTimers();
      if (activeFlow) {
        activeFlow.classList.remove('is-interpreting');
        setInterpretationStatus(activeFlow);
      }
      return;
    }
    resetDraftForNewQuestion(activeDraft);
    if (activeFlow) clearPersistedDraft(activeFlow.dataset.divinationDreamId || '');
    if (activeFlow && activeDraft) {
      activeFlow.classList.remove('is-reveal-complete', 'has-interpretation', 'is-interpreting');
      setFlowScreen(activeFlow, activeDraft, 'question');
      setInterpretationStatus(activeFlow);
    }
  }

  function confirmLeaveWhileInterpreting(onConfirmLeave) {
    if (typeof window.openCustomCardConfirm === 'function') {
      window.openCustomCardConfirm({
        title: '解读还在进行中',
        body: '这次梦占仍在服务器处理中。现在离开不会取消请求，结果生成后仍可能正常消耗 X能量；稍后重新进入可以继续查看。',
        confirmText: '仍要离开',
        onConfirm: onConfirmLeave
      });
      return;
    }
    if (typeof window.confirm === 'function' && !window.confirm('解读仍在处理中，离开不会取消请求，确定要离开吗？')) return;
    onConfirmLeave();
  }

  function performReturnToWorld() {
    stopDivinationAudio();
    resetActiveDraftForExit();
    if (typeof window.SHEXReturnToXWorldHome === 'function') {
      window.SHEXReturnToXWorldHome();
      return;
    }
    if (window.location.hash !== '#x-world') {
      window.location.hash = '#x-world';
      return;
    }
    try {
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    } catch (_) {
      window.dispatchEvent(new Event('hashchange'));
    }
  }

  function returnToWorld() {
    if (activeDraft?.interpretationPending) {
      confirmLeaveWhileInterpreting(performReturnToWorld);
      return;
    }
    performReturnToWorld();
  }

  function readDivinationAudioMuted() {
    try {
      return localStorage.getItem(DIVINATION_AUDIO_MUTED_KEY) === '1';
    } catch (_) {
      return false;
    }
  }

  function writeDivinationAudioMuted(muted) {
    try {
      localStorage.setItem(DIVINATION_AUDIO_MUTED_KEY, muted ? '1' : '0');
    } catch (_) {}
  }

  function isDivinationViewActive() {
    const panel = document.querySelector('#xDivinationPanel');
    return document.body?.dataset?.xPage === 'divination'
      && panel
      && panel.style.display !== 'none'
      && panel.classList.contains('show');
  }

  function ensureDivinationAudio() {
    if (divinationAudio) return divinationAudio;
    divinationAudio = document.querySelector('audio[data-divination-audio]');
    if (!divinationAudio) {
      divinationAudio = document.createElement('audio');
      divinationAudio.dataset.divinationAudio = 'true';
      divinationAudio.style.display = 'none';
      document.body.appendChild(divinationAudio);
    }
    divinationAudio.src = DIVINATION_AUDIO_SRC;
    divinationAudio.loop = true;
    divinationAudio.preload = 'auto';
    divinationAudio.volume = 0.42;
    divinationAudio.muted = readDivinationAudioMuted();
    return divinationAudio;
  }

  function updateDivinationAudioToggle() {
    const muted = readDivinationAudioMuted();
    document.querySelectorAll('[data-divination-audio-toggle]').forEach((button) => {
      button.classList.toggle('is-muted', muted);
      button.setAttribute('aria-pressed', String(!muted));
      button.setAttribute('aria-label', muted ? '打开梦占音乐' : '静音梦占音乐');
      button.setAttribute('title', muted ? '打开音乐' : '静音');
    });
  }

  function playDivinationAudio(reason = 'open') {
    const audio = ensureDivinationAudio();
    audio.muted = readDivinationAudioMuted();
    updateDivinationAudioToggle();
    if (audio.muted || !isDivinationViewActive()) {
      audio.pause();
      return;
    }
    const playTask = audio.play();
    if (playTask?.catch) {
      playTask.catch((error) => {
        console.warn('[SHEX_DIVINATION_AUDIO_PLAY_BLOCKED]', { reason, message: error?.message || String(error || '') });
      });
    }
  }

  function stopDivinationAudio() {
    if (!divinationAudio) return;
    divinationAudio.pause();
    try {
      divinationAudio.currentTime = 0;
    } catch (_) {}
  }

  function setDivinationAudioMuted(muted) {
    writeDivinationAudioMuted(muted);
    const audio = ensureDivinationAudio();
    audio.muted = muted;
    if (muted) {
      audio.pause();
    } else {
      playDivinationAudio('toggle');
    }
    updateDivinationAudioToggle();
  }

  function divinationAudioToggleMarkup() {
    const muted = readDivinationAudioMuted();
    return `
      <button class="shex-divination-audio-toggle${muted ? ' is-muted' : ''}" type="button" data-divination-audio-toggle aria-pressed="${muted ? 'false' : 'true'}" aria-label="${muted ? '打开梦占音乐' : '静音梦占音乐'}" title="${muted ? '打开音乐' : '静音'}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M4 9.5v5h3.5L13 19V5L7.5 9.5H4Z"></path>
          <path class="shex-divination-audio-wave" d="M16.2 8.6a4.1 4.1 0 0 1 0 6.8"></path>
          <path class="shex-divination-audio-wave" d="M18.8 6a7.7 7.7 0 0 1 0 12"></path>
          <path class="shex-divination-audio-slash" d="M5 20 20 5"></path>
        </svg>
      </button>
    `;
  }

  function currentUserTimeZone() {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    } catch (_) {
      return '';
    }
  }

  function syncDivinationViewport() {
    const height = Math.max(1, Math.round(
      window.visualViewport?.height
      || window.innerHeight
      || document.documentElement.clientHeight
      || 1
    ));
    document.documentElement.style.setProperty('--shex-divination-vh', `${height}px`);

    if (activeFlow && activeDraft?.screen === 'select') {
      cancelAnimationFrame(viewportLayoutFrame);
      viewportLayoutFrame = requestAnimationFrame(() => layoutDeck(activeFlow, activeDraft));
    }
  }

  function setFlowScreen(flow, draft, screen) {
    draft.screen = screen;
    flow.classList.toggle('to-meditate', screen === 'meditate');
    flow.classList.toggle('to-select', screen === 'select');
    flow.classList.toggle('to-reveal', screen === 'reveal');
    flow.classList.toggle('to-history', screen === 'history');
    flow.closest('#xDivinationPanel')?.querySelector('.shex-divination-back')?.classList.toggle('is-history-back', screen === 'history');
    flow.closest('#xDivinationPanel')?.querySelector('.shex-divination-back')?.classList.toggle('is-dark-step-back', screen === 'meditate' || screen === 'select' || screen === 'reveal');
    persistDraft(flow.dataset.divinationDreamId || '', draft);
  }

  function clearRevealTimers() {
    revealTimers.forEach((timer) => clearTimeout(timer));
    revealTimers = [];
  }

  function clearInterpretationStatusTimer() {
    if (interpretationStatusTimer) {
      clearInterval(interpretationStatusTimer);
      interpretationStatusTimer = null;
    }
    if (interpretationStatusFadeTimer) {
      clearTimeout(interpretationStatusFadeTimer);
      interpretationStatusFadeTimer = null;
    }
  }

  function startInterpretationLoadingTextCycle(host) {
    clearInterpretationStatusTimer();
    const text = host.querySelector('[data-divination-loading-text]');
    if (!text) return;
    let index = 0;
    interpretationStatusTimer = setInterval(() => {
      if (!document.body.contains(host)) {
        clearInterpretationStatusTimer();
        return;
      }
      index = (index + 1) % INTERPRETATION_LOADING_TEXTS.length;
      text.classList.add('is-switching');
      if (interpretationStatusFadeTimer) clearTimeout(interpretationStatusFadeTimer);
      interpretationStatusFadeTimer = setTimeout(() => {
        text.textContent = INTERPRETATION_LOADING_TEXTS[index];
        text.classList.remove('is-switching');
        interpretationStatusFadeTimer = null;
      }, 220);
    }, 2600);
  }

  document.addEventListener('click', (event) => {
    const backButton = event.target.closest?.('[data-divination-back]');
    if (!backButton) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    if (!activeFlow || !activeDraft) {
      returnToWorld();
      return;
    }
    if (activeDraft.screen === 'history') {
      if (activeDraft.historyDetail) {
        activeDraft.historyDetail = null;
        renderHistory(activeFlow, activeDraft);
      } else {
        setFlowScreen(activeFlow, activeDraft, 'question');
      }
      return;
    }
    if (activeFlow.classList.contains('to-reveal') && activeFlow.classList.contains('has-interpretation')) {
      returnToWorld();
      return;
    }
    if (activeFlow.classList.contains('to-reveal')) {
      clearRevealTimers();
      setFlowScreen(activeFlow, activeDraft, 'select');
      return;
    }
    if (activeFlow.classList.contains('to-select')) {
      setFlowScreen(activeFlow, activeDraft, 'meditate');
      return;
    }
    if (activeFlow.classList.contains('to-meditate')) {
      setFlowScreen(activeFlow, activeDraft, 'question');
      return;
    }
    returnToWorld();
  }, true);

  function bindBackButton(panel) {
    const backButton = panel.querySelector('.x-subpage-back');
    if (!backButton) return;

    backButton.removeAttribute('data-x-home-back');
    backButton.classList.add('shex-divination-back');
    backButton.dataset.divinationBack = 'true';
    backButton.setAttribute('aria-label', '返回');
  }

  function updateContinueState(flow, draft) {
    const continueButton = flow.querySelector('[data-divination-continue]');
    if (!continueButton) return;
    const enabled = Boolean(draft.targetFullName.trim() && draft.questionText.trim());
    continueButton.disabled = false;
    continueButton.setAttribute('aria-disabled', String(!enabled));
  }

  function showValidationMessage(message) {
    if (typeof window.openCustomCardConfirm === 'function') {
      window.openCustomCardConfirm({
        title: message,
        body: '',
        confirmText: '知道了'
      });
      return;
    }
    if (typeof window.alert === 'function') {
      window.alert(message);
      return;
    }
    console.warn('[SHEX_DIVINATION_VALIDATE]', message);
  }

  function updateSelectionUi(flow, draft) {
    const count = draft.selectedIds.length;
    const progress = flow.querySelector('[data-divination-progress]');
    const confirmButton = flow.querySelector('[data-divination-confirm]');
    if (progress) progress.textContent = `已选 ${count} / 3 张`;
    if (confirmButton) {
      const ready = count === 3;
      confirmButton.disabled = !ready;
      confirmButton.setAttribute('aria-disabled', String(!ready));
    }
    flow.querySelectorAll('[data-divination-card-id]').forEach((card) => {
      const selected = draft.selectedIds.includes(card.dataset.divinationCardId);
      card.classList.toggle('is-selected', selected);
      card.setAttribute('aria-pressed', String(selected));
    });
  }

  function updateDeckRotation(flow, draft) {
    const rotor = flow.querySelector('[data-divination-deck-rotor]');
    if (rotor) rotor.style.transform = `rotate(${draft.deckRotation}deg)`;
  }

  function cardName(cardId) {
    if (MAJOR_CARD_NAMES[cardId]) return MAJOR_CARD_NAMES[cardId];
    const [, suit, rank] = String(cardId || '').split('_');
    return `${MINOR_SUIT_NAMES[suit] || ''}${MINOR_RANK_NAMES[rank] || ''}` || '未知牌面';
  }

  function cardIdForName(name) {
    const rawTarget = String(name || '').trim();
    const target = ({ 愚人: '愚者', 女皇: '皇后', 倒吊人: '吊人' })[rawTarget] || rawTarget;
    return TAROT_CARD_IDS.find((id) => cardName(id) === target) || '';
  }

  function cardRevealImagePath(name) {
    const id = cardIdForName(name);
    return id ? `${CARD_REVEAL_IMAGE_BASE}${id}.webp` : '';
  }

  function isReversed(orientation) {
    return String(orientation || '').trim() === '逆位' || /^reversed?$/i.test(String(orientation || '').trim());
  }

  function historyOrientationLabel(orientation) {
    return isReversed(orientation) ? '逆位' : '正位';
  }

  function formatHistoryTime(value) {
    const timestamp = Number(value || 0);
    if (!Number.isFinite(timestamp) || timestamp <= 0) return '时间未知';
    try {
      return new Intl.DateTimeFormat('zh-CN', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      }).format(new Date(timestamp)).replace(/\//g, '-');
    } catch (_) {
      return new Date(timestamp).toLocaleString('zh-CN');
    }
  }

  function layoutDeck(flow, draft) {
    const viewport = flow.querySelector('[data-divination-deck-viewport]');
    const rotor = flow.querySelector('[data-divination-deck-rotor]');
    if (!viewport || !rotor || !draft.deck.length) return;

    const rect = viewport.getBoundingClientRect();
    const radius = Math.max(520, Math.round(rect.width * 0.84));
    const arcTop = Math.min(168, Math.max(22, Math.round(rect.height * 0.3)));
    const centerY = radius + arcTop;
    rotor.style.top = `${centerY}px`;
    rotor.innerHTML = draft.deck.map((card, index) => {
      const angle = -90 + (index * 360) / draft.deck.length;
      const radians = (angle * Math.PI) / 180;
      const x = Math.round(Math.cos(radians) * radius);
      const y = Math.round(Math.sin(radians) * radius);
      const zIndex = Math.round(y + radius);
      return `
        <button class="shex-divination-card" type="button" data-divination-card-id="${card.id}" aria-label="第 ${index + 1} 张牌" aria-pressed="false" style="left:${x}px;top:${y}px;z-index:${zIndex};transform:translate(-50%,-50%) rotate(${angle + 90}deg)">
          <span class="shex-divination-card-lift">
            <span class="shex-divination-card-back" aria-hidden="true">
              <span class="shex-divination-card-radiance"></span>
              <span class="shex-divination-card-moon"></span>
            </span>
          </span>
        </button>
      `;
    }).join('');
    updateDeckRotation(flow, draft);
    updateSelectionUi(flow, draft);
  }

  function toggleCardSelection(flow, draft, cardId) {
    const selectedIndex = draft.selectedIds.indexOf(cardId);
    if (selectedIndex >= 0) {
      draft.selectedIds.splice(selectedIndex, 1);
      delete draft.orientations[cardId];
    } else if (draft.selectedIds.length < 3) {
      draft.selectedIds.push(cardId);
      draft.orientations[cardId] = Math.random() < 0.5 ? 'upright' : 'reversed';
    } else {
      return;
    }
    updateSelectionUi(flow, draft);
    if (draft.selectedIds.length === 3) {
      void preloadSelectedRevealImages(draft);
    } else {
      draft.revealPreloadKey = '';
      draft.revealPreloadPromise = null;
    }
    persistDraft(flow.dataset.divinationDreamId || '', draft);
  }

  function bindDeckGestures(flow, draft) {
    const viewport = flow.querySelector('[data-divination-deck-viewport]');
    if (!viewport) return;

    viewport.addEventListener('pointerdown', (event) => {
      const card = event.target.closest?.('[data-divination-card-id]');
      dragState = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startRotation: draft.deckRotation,
        moved: false,
        cardId: card?.dataset.divinationCardId || ''
      };
      viewport.setPointerCapture?.(event.pointerId);
      viewport.classList.add('is-dragging');
    });
    viewport.addEventListener('pointermove', (event) => {
      if (!dragState || dragState.pointerId !== event.pointerId) return;
      const deltaX = event.clientX - dragState.startX;
      if (Math.abs(deltaX) > 6) dragState.moved = true;
      draft.deckRotation = dragState.startRotation + deltaX * 0.18;
      updateDeckRotation(flow, draft);
    });
    const endDrag = (event) => {
      if (!dragState || dragState.pointerId !== event.pointerId) return;
      const { cardId, moved } = dragState;
      viewport.releasePointerCapture?.(event.pointerId);
      viewport.classList.remove('is-dragging');
      dragState = null;
      if (cardId && !moved) toggleCardSelection(flow, draft, cardId);
    };
    viewport.addEventListener('pointerup', endDrag);
    viewport.addEventListener('pointercancel', endDrag);
  }

  function selectedCards(draft) {
    return draft.selectedIds
      .map((id) => {
        const card = draft.deck.find((item) => item.id === id);
        if (!card) return null;
        return {
          ...card,
          name: cardName(card.id),
          orientation: draft.orientations[card.id] || 'upright'
        };
      })
      .filter(Boolean);
  }

  function preloadSelectedRevealImages(draft) {
    const cards = selectedCards(draft);
    if (cards.length !== 3) return Promise.resolve();

    const key = cards.map((card) => card.id).join('|');
    if (draft.revealPreloadKey === key && draft.revealPreloadPromise) {
      return draft.revealPreloadPromise;
    }

    const preload = Promise.all(cards.map((card) => new Promise((resolve) => {
      const image = new Image();
      image.decoding = 'async';
      image.onload = async () => {
        try {
          await image.decode();
        } catch (_) {}
        resolve();
      };
      image.onerror = () => resolve();
      image.src = card.revealImagePath;
      revealImageCache.set(card.revealImagePath, image);
    })));
    draft.revealPreloadKey = key;
    draft.revealPreloadPromise = preload;
    return preload;
  }

  function escapeHtml(value = '') {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function dreamNameForQuestionPlaceholder(dreamId) {
    try {
      const raw = localStorage.getItem('shex_x_multi_state_v1');
      const state = raw ? JSON.parse(raw) : null;
      const dreams = Array.isArray(state?.dreams) ? state.dreams : [];
      const dream = dreams.find((item) => String(item?.id || '') === String(dreamId || ''));
      const name = String(dream?.name || '').trim();
      return name || 'TA';
    } catch (_) {
      return 'TA';
    }
  }

  function renderRevealCards(flow, draft) {
    const row = flow.querySelector('[data-divination-reveal-cards]');
    if (!row) return;
    row.innerHTML = selectedCards(draft).map((card, index) => {
      const label = `${card.name}${card.orientation === 'reversed' ? '（逆位）' : ''}`;
      return `
        <article class="shex-divination-reveal-card" data-divination-reveal-card>
          <div class="shex-divination-reveal-card-inner">
            <div class="shex-divination-reveal-card-face shex-divination-reveal-card-back" aria-hidden="true">
              <span class="shex-divination-card-radiance"></span>
              <span class="shex-divination-card-moon"></span>
            </div>
            <div class="shex-divination-reveal-card-face shex-divination-reveal-card-front">
              <img src="${card.revealImagePath}" alt="${escapeHtml(label)}" class="${card.orientation === 'reversed' ? 'is-reversed' : ''}">
            </div>
          </div>
          <p>${escapeHtml(label)}</p>
        </article>
      `;
    }).join('');
  }

  function interpretationResultMarkup(text, extraClass = '') {
    const paragraphs = String(text || '').split(/\n+/).map((item) => item.trim()).filter(Boolean);
    const body = paragraphs.length
      ? paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('')
      : '<p>这次的解读暂时没有返回内容，请稍后再试。</p>';
    return `
      <div class="shex-divination-interpretation-result ${extraClass}">
        ${body}
        <button type="button" class="shex-divination-result-home" data-divination-home>返回主页</button>
      </div>
    `;
  }

  function setInterpretationStatus(flow, state = null) {
    const host = flow.querySelector('[data-divination-interpretation-state]');
    clearInterpretationStatusTimer();
    if (!host) return;
    if (!state) {
      host.innerHTML = '';
      host.className = 'shex-divination-interpretation-state';
      return;
    }
    if (state.type === 'loading') {
      host.className = 'shex-divination-interpretation-state is-loading';
      host.innerHTML = '<div class="shex-divination-interpret-loading-orb" aria-hidden="true"></div><p class="shex-divination-loading-text" data-divination-loading-text>正在为你解读...</p>';
      startInterpretationLoadingTextCycle(host);
      return;
    }
    if (state.type === 'revealing') {
      host.className = 'shex-divination-interpretation-state is-revealing';
      host.innerHTML = `
        <div class="shex-divination-interpret-loading-orb is-dispersing" aria-hidden="true"></div>
        ${interpretationResultMarkup(state.text || '', 'is-entering')}
      `;
      return;
    }
    if (state.type === 'success') {
      host.className = 'shex-divination-interpretation-state is-success';
      host.innerHTML = interpretationResultMarkup(state.text || '');
      return;
    }
    host.className = 'shex-divination-interpretation-state is-error';
    host.innerHTML = `<p>${escapeHtml(state.text || '解读暂时失败，请稍后重试')}</p>`;
  }

  function startReveal(flow, draft) {
    clearRevealTimers();
    draft.interpretation = null;
    draft.interpretationPending = false;
    draft.interpretationRequestId = '';
    draft.interpretationStatus = '';
    renderRevealCards(flow, draft);
    setInterpretationStatus(flow);
    flow.classList.remove('is-reveal-complete', 'has-interpretation');
    setFlowScreen(flow, draft, 'reveal');
    persistDraft(flow.dataset.divinationDreamId || '', draft);
    const cards = Array.from(flow.querySelectorAll('[data-divination-reveal-card]'));
    cards.forEach((card, index) => {
      revealTimers.push(setTimeout(() => card.classList.add('is-flipped'), 280 + index * 500));
    });
    revealTimers.push(setTimeout(() => flow.classList.add('is-reveal-complete'), 280 + cards.length * 500 + 180));
  }

  function loadCloudbaseSdk() {
    if (window.cloudbase) return Promise.resolve();
    const config = window.SHEX_CLOUDBASE_CONFIG || {};
    const src = config.sdkUrl || 'https://static.cloudbase.net/cloudbase-js-sdk/2.9.0/cloudbase.full.js';
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${src}"]`);
      if (existing) {
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', reject, { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error('CloudBase SDK 加载失败'));
      document.head.appendChild(script);
    });
  }

  async function getDivinationCloudApp() {
    if (divinationCloudApp) return divinationCloudApp;
    const config = window.SHEX_CLOUDBASE_CONFIG || {};
    if (!config.envId) throw new Error('CloudBase 环境未配置');
    await loadCloudbaseSdk();
    const app = window.cloudbase.init({ env: config.envId, region: config.region || 'ap-shanghai' });
    const auth = app.auth({ persistence: 'local' });
    try {
      const state = await auth.getLoginState();
      if (!state && typeof auth.signInAnonymously === 'function') await auth.signInAnonymously();
      else if (!state && typeof auth.anonymousAuthProvider === 'function') await auth.anonymousAuthProvider().signIn();
    } catch (error) {
      console.warn('[SHEX Divination] CloudBase anonymous auth failed:', error);
    }
    divinationCloudApp = app;
    return app;
  }

  function divinationRequestId() {
    return `xworld_divination_interpret_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
  }

  function ensureDivinationRequestId(draft) {
    if (!draft.interpretationRequestId) draft.interpretationRequestId = divinationRequestId();
    return draft.interpretationRequestId;
  }

  function divinationInterpretTimeoutError() {
    const error = new Error('解读请求等待时间较长');
    error.code = 'DIVINATION_TIMEOUT';
    return error;
  }

  function withDivinationTimeout(promise, timeoutMs = DIVINATION_INTERPRET_TIMEOUT_MS) {
    let timeoutId = null;
    const timeout = new Promise((_, reject) => {
      timeoutId = window.setTimeout(() => reject(divinationInterpretTimeoutError()), timeoutMs);
    });
    return Promise.race([promise, timeout]).finally(() => {
      if (timeoutId !== null) window.clearTimeout(timeoutId);
    });
  }

  function currentDivinationSession() {
    const current = window.SHEXAuth?.current?.();
    if (!current?.userId || !current?.sessionToken) {
      const error = new Error('登录状态已失效，请重新登录后再试');
      error.code = 'SESSION_EXPIRED';
      throw error;
    }
    return current;
  }

  async function callDivinationAction(data) {
    const app = await getDivinationCloudApp();
    const result = await app.callFunction({ name: 'shexXWorldAI', data });
    const response = result?.result || result;
    if (!response?.ok) {
      const error = new Error(response?.message || response?.detail || '梦占服务暂时不可用，请稍后重试');
      error.code = response?.code || 'DIVINATION_FAILED';
      error.response = response || null;
      throw error;
    }
    return response;
  }

  async function requestInterpretation(dreamId, draft) {
    const current = currentDivinationSession();
    return callDivinationAction({
      action: 'divinationInterpret',
      userId: current.userId,
      sessionToken: current.sessionToken,
      dreamId,
      targetFullName: draft.targetFullName,
      questionText: draft.questionText,
      backgroundText: draft.backgroundText,
      cards: selectedCards(draft).map((card) => ({ name: card.name, orientation: card.orientation })),
      timeZone: currentUserTimeZone(),
      requestId: ensureDivinationRequestId(draft)
    });
  }

  async function requestInterpretationStatus(dreamId, requestId) {
    const current = currentDivinationSession();
    return callDivinationAction({
      action: 'divinationInterpretStatus',
      userId: current.userId,
      sessionToken: current.sessionToken,
      dreamId,
      requestId
    });
  }

  async function requestInterpretationResume(dreamId, requestId) {
    const current = currentDivinationSession();
    return callDivinationAction({
      action: 'divinationInterpretResume',
      userId: current.userId,
      sessionToken: current.sessionToken,
      dreamId,
      requestId
    });
  }

  async function requestHistory(dreamId) {
    const current = currentDivinationSession();
    return callDivinationAction({
      action: 'divinationHistory',
      userId: current.userId,
      sessionToken: current.sessionToken,
      dreamId
    });
  }

  async function requestHistoryDetail(dreamId, recordId) {
    const current = currentDivinationSession();
    return callDivinationAction({
      action: 'divinationHistoryDetail',
      userId: current.userId,
      sessionToken: current.sessionToken,
      dreamId,
      recordId
    });
  }

  function interpretationErrorText(error) {
    if (error?.code === 'SESSION_EXPIRED') return '登录状态已失效，请重新登录后再试。';
    if (error?.code === 'PLAN_REQUIRED') return '套餐状态暂时无法确认，请稍后重试。';
    if (error?.code === 'ENERGY_NOT_ENOUGH') return 'X能量不足，请充值后再试。';
    if (error?.code === 'DIVINATION_DAILY_LIMIT_REACHED') return '梦占服务尚未更新，请联系管理员更新后台后再试。';
    if (error?.code === 'DIVINATION_TIMEOUT' || error?.code === 'DIVINATION_IN_PROGRESS') return '这次解读仍在处理中，请不要重复提交。结果生成后会自动显示，也可以稍后重新进入查看。';
    return '解读结果暂时没有返回，可以在当前页面重试。系统会沿用同一请求，不会重复扣除 X能量。';
  }

  function isDeterministicInterpretationError(error) {
    return DIVINATION_DETERMINISTIC_ERROR_CODES.has(String(error?.code || ''));
  }

  function stopInterpretationStatusPoll(requestId) {
    const state = interpretationPollStates.get(requestId);
    if (!state) return;
    state.stopped = true;
    if (state.nextTimer) window.clearTimeout(state.nextTimer);
    if (state.watchdogTimer) window.clearTimeout(state.watchdogTimer);
    state.nextTimer = null;
    state.watchdogTimer = null;
    if (!state.inFlight) interpretationPollStates.delete(requestId);
  }

  function finishInterpretationWithError(flow, dreamId, draft, error, fallbackText = '') {
    draft.interpretationPending = false;
    draft.interpretationStatus = 'failed';
    persistDraft(dreamId, draft);
    stopInterpretationStatusPoll(draft.interpretationRequestId);
    const liveFlow = activeDraft === draft && activeFlow ? activeFlow : null;
    liveFlow?.classList.remove('is-interpreting');
    const button = liveFlow?.querySelector('[data-divination-interpret]');
    if (button) button.disabled = false;
    const text = fallbackText || (isDeterministicInterpretationError(error) ? String(error?.message || '') : '') || interpretationErrorText(error);
    if (liveFlow) setInterpretationStatus(liveFlow, { type: 'error', text });
  }

  function applyRecoveredRequestContext(draft, data) {
    if (!draft || !data?.recoveredPrevious) return false;
    draft.targetFullName = String(data.targetFullName || draft.targetFullName || '').slice(0, 80);
    draft.questionText = String(data.questionText || draft.questionText || '').slice(0, 1200);
    draft.backgroundText = String(data.backgroundText || draft.backgroundText || '').slice(0, 2400);
    const recoveredCards = Array.isArray(data.cards) ? data.cards.slice(0, 3) : [];
    const recoveredIds = recoveredCards.map((card) => cardIdForName(card?.name));
    if (recoveredCards.length === 3 && recoveredIds.every(Boolean) && new Set(recoveredIds).size === 3) {
      draft.deck = recoveredIds.map((id) => ({ id, imagePath: `${CARD_REVEAL_IMAGE_BASE}${id}.webp`, revealImagePath: `${CARD_REVEAL_IMAGE_BASE}${id}.webp` }));
      draft.selectedIds = recoveredIds;
      draft.orientations = {};
      recoveredCards.forEach((card, index) => {
        draft.orientations[recoveredIds[index]] = isReversed(card?.orientation) ? 'reversed' : 'upright';
      });
      draft.screen = 'reveal';
    }
    return true;
  }

  function adoptInterpretationResponse(dreamId, draft, data) {
    if (!draft || !data) return;
    const canonicalRequestId = String(data.requestId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 240);
    if (canonicalRequestId && canonicalRequestId !== draft.interpretationRequestId) {
      stopInterpretationStatusPoll(draft.interpretationRequestId);
      draft.interpretationRequestId = canonicalRequestId;
    }
    applyRecoveredRequestContext(draft, data);
    persistDraft(dreamId, draft);
  }

  function applyInterpretationResult(flow, dreamId, draft, data) {
    const interpretation = String(data?.interpretationResult || '').trim();
    if (!interpretation) return false;
    adoptInterpretationResponse(dreamId, draft, data);
    draft.interpretation = interpretation;
    draft.interpretationPending = false;
    draft.interpretationStatus = 'completed';
    persistDraft(dreamId, draft);
    stopInterpretationStatusPoll(draft.interpretationRequestId);
    const liveFlow = activeDraft === draft && activeFlow ? activeFlow : null;
    if (liveFlow) {
      if (data?.recoveredPrevious && draft.selectedIds.length === 3) {
        renderRevealCards(liveFlow, draft);
        liveFlow.querySelectorAll('[data-divination-reveal-card]').forEach((card) => card.classList.add('is-flipped'));
        liveFlow.classList.add('is-reveal-complete');
      }
      liveFlow.classList.remove('is-interpreting');
      liveFlow.classList.add('has-interpretation');
      setInterpretationStatus(liveFlow, { type: 'success', text: interpretation });
      if (data?.recoveredPrevious) {
        const host = liveFlow.querySelector('[data-divination-interpretation-state]');
        host?.insertAdjacentHTML('afterbegin', '<p class="shex-divination-recovery-note">已恢复并完成上一轮尚未交付的梦占解读</p>');
      }
    }
    return true;
  }

  function scheduleInterpretationStatusPoll(flow, dreamId, draft) {
    const requestId = draft.interpretationRequestId;
    if (!requestId || !draft.interpretationPending || draft.interpretation || interpretationPollStates.has(requestId)) return;
    const state = {
      stopped: false,
      inFlight: false,
      nextTimer: null,
      watchdogTimer: null,
      notFoundCount: 0
    };
    interpretationPollStates.set(requestId, state);

    const markUncertain = () => {
      if (state.stopped) return;
      if (draft.interpretation || draft.interpretationRequestId !== requestId) {
        stopInterpretationStatusPoll(requestId);
        return;
      }
      state.stopped = true;
      if (state.nextTimer) window.clearTimeout(state.nextTimer);
      state.nextTimer = null;
      state.watchdogTimer = null;
      if (!state.inFlight) interpretationPollStates.delete(requestId);
      draft.interpretationPending = false;
      draft.interpretationStatus = 'uncertain';
      persistDraft(dreamId, draft);
      const liveFlow = activeDraft === draft && activeFlow ? activeFlow : null;
      liveFlow?.classList.remove('is-interpreting');
      const button = liveFlow?.querySelector('[data-divination-interpret]');
      if (button) button.disabled = false;
      if (liveFlow) {
        setInterpretationStatus(liveFlow, {
          type: 'error',
          text: '这次解读可能仍在处理中，请稍后在梦占历史里查看；也可以继续使用当前请求重试，系统不会重复扣费。'
        });
      }
    };

    const scheduleNext = (delayMs) => {
      if (state.stopped || state.inFlight || !draft.interpretationPending || draft.interpretationRequestId !== requestId) return;
      state.nextTimer = window.setTimeout(() => {
        state.nextTimer = null;
        void poll();
      }, delayMs);
    };

    const poll = async () => {
      if (state.stopped || state.inFlight) return;
      if (!draft.interpretationPending || draft.interpretation || draft.interpretationRequestId !== requestId) {
        stopInterpretationStatusPoll(requestId);
        return;
      }
      state.inFlight = true;
      try {
        let data = await requestInterpretationStatus(dreamId, requestId);
        if (draft.interpretationRequestId !== requestId || draft.interpretation) return;
        let status = String(data?.status || '');
        if (status === 'not_found') {
          state.notFoundCount += 1;
          if (state.notFoundCount >= 3) {
            const error = new Error('原解读请求没有在云端登记成功，请重新提交。本次不会扣除 X能量。');
            error.code = 'DIVINATION_REQUEST_NOT_FOUND';
            finishInterpretationWithError(flow, dreamId, draft, error, error.message);
          }
          return;
        }
        state.notFoundCount = 0;
        if (["generated", "charged"].includes(status) && data?.recoveryAvailable) {
          data = await requestInterpretationResume(dreamId, requestId);
          adoptInterpretationResponse(dreamId, draft, data);
          status = String(data?.status || '');
        }
        draft.interpretationStatus = status;
        if (status === 'completed' && applyInterpretationResult(flow, dreamId, draft, data)) return;
        if (status === 'failed') {
          const error = new Error(data?.message || '解读暂时失败');
          error.code = data?.code || 'DIVINATION_FAILED';
          finishInterpretationWithError(flow, dreamId, draft, error, data?.message || '解读暂时失败，可以使用原请求重新尝试。本次未重复扣费。');
        }
      } catch (error) {
        if (isDeterministicInterpretationError(error)) {
          finishInterpretationWithError(flow, dreamId, draft, error);
        }
      } finally {
        state.inFlight = false;
        if (state.stopped) {
          interpretationPollStates.delete(requestId);
          return;
        }
        if (!draft.interpretationPending || draft.interpretation || draft.interpretationRequestId !== requestId) {
          stopInterpretationStatusPoll(requestId);
          return;
        }
        scheduleNext(DIVINATION_STATUS_POLL_MS);
      }
    };

    state.watchdogTimer = window.setTimeout(markUncertain, DIVINATION_STATUS_POLL_MAX_MS);
    scheduleNext(300);
  }
  function captureLateInterpretationResult(flow, dreamId, draft, requestPromise) {
    requestPromise.then((data) => {
      adoptInterpretationResponse(dreamId, draft, data);
      if (applyInterpretationResult(flow, dreamId, draft, data)) return;
      if (data?.status === 'processing') scheduleInterpretationStatusPoll(flow, dreamId, draft);
    }).catch((error) => {
      adoptInterpretationResponse(dreamId, draft, error?.response);
      if (isDeterministicInterpretationError(error)) {
        finishInterpretationWithError(flow, dreamId, draft, error);
        return;
      }
      if (!draft.interpretationPending || draft.interpretationStatus === 'uncertain') return;
      draft.interpretationStatus = 'processing';
      persistDraft(dreamId, draft);
      scheduleInterpretationStatusPoll(flow, dreamId, draft);
    });
  }

  async function interpretReveal(flow, dreamId, draft, interpretButton) {
    if (draft.interpretationPending || draft.selectedIds.length !== 3) return;
    draft.interpretationPending = true;
    draft.interpretationStatus = 'processing';
    ensureDivinationRequestId(draft);
    persistDraft(dreamId, draft);
    flow.classList.add('is-interpreting');
    setInterpretationStatus(flow, { type: 'loading' });
    const requestPromise = requestInterpretation(dreamId, draft);
    captureLateInterpretationResult(flow, dreamId, draft, requestPromise);
    try {
      const data = await withDivinationTimeout(requestPromise);
      adoptInterpretationResponse(dreamId, draft, data);
      if (!applyInterpretationResult(flow, dreamId, draft, data) && data?.status === 'processing') {
        scheduleInterpretationStatusPoll(flow, dreamId, draft);
      }
    } catch (error) {
      adoptInterpretationResponse(dreamId, draft, error?.response);
      if (isDeterministicInterpretationError(error)) {
        finishInterpretationWithError(flow, dreamId, draft, error);
      } else {
        draft.interpretationPending = true;
        draft.interpretationStatus = 'processing';
        persistDraft(dreamId, draft);
        setInterpretationStatus(flow, { type: 'error', text: '这次解读仍在处理中，结果生成后会自动显示，请不要重复提交。' });
        scheduleInterpretationStatusPoll(flow, dreamId, draft);
      }
    } finally {
      if (interpretButton) interpretButton.disabled = Boolean(draft.interpretationPending || draft.interpretation);
    }
  }

  function renderHistory(flow, draft) {
    const host = flow.querySelector('[data-divination-history-content]');
    if (!host) return;

    if (draft.historyLoading) {
      host.innerHTML = '<div class="shex-divination-history-state is-loading"><div class="shex-divination-interpret-loading-orb" aria-hidden="true"></div><p>正在读取梦占历史...</p></div>';
      return;
    }

    if (draft.historyError) {
      host.innerHTML = `<div class="shex-divination-history-state is-error"><p>${escapeHtml(draft.historyError)}</p><button type="button" data-divination-history-retry>重新读取</button></div>`;
      host.querySelector('[data-divination-history-retry]')?.addEventListener('click', () => {
        const dreamId = flow.dataset.divinationDreamId || '';
        void openHistory(flow, dreamId, draft, true);
      });
      return;
    }

    if (draft.historyDetail) {
      const record = draft.historyDetail;
      const cards = Array.isArray(record.cards) ? record.cards : [];
      const cardMarkup = cards.map((card) => {
        const reversed = isReversed(card.orientation);
        const label = `${String(card.name || '未知牌面')}${reversed ? '（逆位）' : ''}`;
        const imagePath = cardRevealImagePath(card.name);
        return `
          <article class="shex-divination-history-card">
            <div class="shex-divination-history-card-image">
              ${imagePath ? `<img src="${imagePath}" alt="${escapeHtml(label)}" class="${reversed ? 'is-reversed' : ''}">` : '<span>牌面</span>'}
            </div>
            <p>${escapeHtml(label)}</p>
          </article>
        `;
      }).join('');
      const paragraphs = String(record.interpretationResult || '').split(/\n+/).map((item) => item.trim()).filter(Boolean);
      host.innerHTML = `
        <article class="shex-divination-history-detail">
          <p class="shex-divination-history-time">${escapeHtml(formatHistoryTime(record.completedAt || record.createdAt))}</p>
            ${record.targetFullName ? `<section><h2>TA的名字</h2><p>${escapeHtml(record.targetFullName)}</p></section>` : ''}
          <section><h2>当时的问题</h2><p>${escapeHtml(record.questionText || '未记录问题')}</p></section>
          <section><h2>背景信息</h2><p>${escapeHtml(record.backgroundText || '当时未补充背景信息')}</p></section>
          <section><h2>抽到的三张牌</h2><div class="shex-divination-history-cards">${cardMarkup}</div></section>
          <section class="shex-divination-history-result"><h2>这次的解读</h2>${paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('')}</section>
        </article>
      `;
      return;
    }

    if (!draft.historyRecords.length) {
      host.innerHTML = '<div class="shex-divination-history-state"><p>这个梦角还没有梦占记录</p></div>';
      return;
    }

    host.innerHTML = `<div class="shex-divination-history-list">${draft.historyRecords.map((record) => `
      <button type="button" class="shex-divination-history-item" data-divination-history-record="${escapeHtml(record.recordId)}">
        <time>${escapeHtml(formatHistoryTime(record.createdAt))}</time>
        <span>${escapeHtml(record.questionText || '未记录问题')}</span>
        <b aria-hidden="true">›</b>
      </button>
    `).join('')}</div>`;
    host.querySelectorAll('[data-divination-history-record]').forEach((button) => {
      button.addEventListener('click', () => {
        const dreamId = flow.dataset.divinationDreamId || '';
        void openHistoryDetail(flow, dreamId, draft, button.dataset.divinationHistoryRecord || '');
      });
    });
  }

  async function openHistory(flow, dreamId, draft, forceReload = false) {
    clearRevealTimers();
    draft.historyDetail = null;
    draft.historyError = '';
    setFlowScreen(flow, draft, 'history');
    if (!forceReload && draft.historyRecords.length) {
      renderHistory(flow, draft);
      return;
    }
    draft.historyLoading = true;
    renderHistory(flow, draft);
    try {
      const data = await requestHistory(dreamId);
      draft.historyRecords = Array.isArray(data.records) ? data.records : [];
    } catch (error) {
      draft.historyError = error?.message || '梦占历史暂时无法读取，请稍后重试';
    } finally {
      draft.historyLoading = false;
      if (draft.screen === 'history' && !draft.historyDetail) renderHistory(flow, draft);
    }
  }

  async function openHistoryDetail(flow, dreamId, draft, recordId) {
    if (!recordId || draft.historyLoading) return;
    draft.historyError = '';
    draft.historyLoading = true;
    renderHistory(flow, draft);
    try {
      const data = await requestHistoryDetail(dreamId, recordId);
      draft.historyDetail = data.record || null;
      if (!draft.historyDetail) draft.historyError = '这条梦占记录暂时无法读取';
    } catch (error) {
      draft.historyError = error?.message || '这条梦占记录暂时无法读取，请稍后重试';
    } finally {
      draft.historyLoading = false;
      if (draft.screen === 'history') renderHistory(flow, draft);
    }
  }

  function render(dreamId) {
    const panel = document.querySelector('#xDivinationPanel');
    const content = panel?.querySelector('[data-divination-page-content]');
    if (!panel || !content) return;

    const draft = getDraft(dreamId);
    const dreamName = dreamNameForQuestionPlaceholder(dreamId);
    content.innerHTML = `
      <section class="shex-divination-flow" data-divination-flow data-divination-dream-id="${escapeHtml(dreamId)}">
        ${divinationAudioToggleMarkup()}
        <div class="shex-divination-question-layer">
          <div class="shex-divination-question-ornaments" aria-hidden="true">
            <svg class="shex-divination-zodiac shex-divination-zodiac-taurus" viewBox="0 0 120 90" role="img" aria-label="金牛座星象线稿">
              <polyline points="18,30 38,44 60,40 78,52 100,62" />
              <polyline points="60,40 70,24 84,16" />
              <circle cx="18" cy="30" r="3.2" /><circle cx="38" cy="44" r="3.2" /><circle cx="60" cy="40" r="3.4" /><circle cx="78" cy="52" r="3.1" /><circle cx="100" cy="62" r="3.2" /><circle cx="70" cy="24" r="2.8" /><circle cx="84" cy="16" r="2.8" />
            </svg>
            <svg class="shex-divination-zodiac shex-divination-zodiac-aquarius" viewBox="0 0 120 92" role="img" aria-label="水瓶座星象线稿">
              <polyline points="78,12 62,34 42,46 34,64 48,76 70,66 92,72" />
              <polyline points="42,46 60,54 70,66" />
              <circle cx="78" cy="12" r="3.2" /><circle cx="62" cy="34" r="3" /><circle cx="42" cy="46" r="3.2" /><circle cx="34" cy="64" r="2.8" /><circle cx="48" cy="76" r="3" /><circle cx="70" cy="66" r="3.2" /><circle cx="92" cy="72" r="3" /><circle cx="60" cy="54" r="2.6" />
            </svg>
            <svg class="shex-divination-zodiac shex-divination-zodiac-pisces" viewBox="0 0 118 96" role="img" aria-label="双鱼座星象线稿">
              <polyline points="88,14 72,32 58,54 42,70" />
              <polyline points="58,54 40,44 28,28" />
              <circle cx="88" cy="14" r="3" /><circle cx="72" cy="32" r="2.8" /><circle cx="58" cy="54" r="3.4" /><circle cx="42" cy="70" r="3" /><circle cx="40" cy="44" r="2.8" /><circle cx="28" cy="28" r="3" />
            </svg>
            <svg class="shex-divination-zodiac shex-divination-zodiac-aries" viewBox="0 0 116 82" role="img" aria-label="白羊座星象线稿">
              <polyline points="18,66 34,48 42,28 66,20 92,18" />
              <polyline points="92,18 104,28" />
              <circle cx="18" cy="66" r="3" /><circle cx="34" cy="48" r="3" /><circle cx="42" cy="28" r="3.2" /><circle cx="66" cy="20" r="2.8" /><circle cx="92" cy="18" r="3.2" /><circle cx="104" cy="28" r="2.8" />
            </svg>
            <svg class="shex-divination-zodiac shex-divination-zodiac-small-one" viewBox="0 0 74 44" role="img" aria-label="三点星象线稿">
              <polyline points="10,30 34,16 62,26" />
              <circle cx="10" cy="30" r="3" /><circle cx="34" cy="16" r="3.2" /><circle cx="62" cy="26" r="3" />
            </svg>
            <svg class="shex-divination-zodiac shex-divination-zodiac-small-two" viewBox="0 0 58 28" role="img" aria-label="两点星象线稿">
              <polyline points="10,16 48,10" />
              <circle cx="10" cy="16" r="3" /><circle cx="48" cy="10" r="3.2" />
            </svg>
          </div>
          <div class="shex-divination-question-heading"><p>梦占</p></div>
          <div class="shex-divination-cards">
            <article class="shex-divination-input-card" data-divination-field="target-full-name">
              <div class="shex-divination-card-heading">
                <h2>TA的名字</h2>
              </div>
          <label><textarea data-divination-target-full-name rows="1" aria-label="TA的名字" placeholder="请输入${escapeHtml(dreamName || 'TA')}的全名" required></textarea></label>
            </article>
            <article class="shex-divination-input-card" data-divination-field="question">
              <div class="shex-divination-card-heading">
                <h2>你想问的问题</h2>
                <button type="button" class="shex-divination-help" data-divination-help="question">如何提问？</button>
              </div>
              <label><textarea data-divination-question rows="2" aria-label="你想问的问题" placeholder="想知道关于${escapeHtml(dreamName)}的什么" required></textarea></label>
            </article>
            <article class="shex-divination-input-card" data-divination-field="background">
              <div class="shex-divination-card-heading">
                <h2>背景信息</h2>
                <button type="button" class="shex-divination-help" data-divination-help="background">如何补充？</button>
              </div>
              <label><textarea data-divination-background rows="2" aria-label="背景信息" placeholder="写一些想要补充的背景信息"></textarea></label>
            </article>
          </div>
          <button class="shex-divination-continue" type="button" data-divination-continue disabled>继续</button>
          <button class="shex-divination-history-entry" type="button" data-divination-history>历史</button>
        </div>
        <div class="shex-divination-orb-motion" aria-hidden="true"><div class="shex-divination-orb"></div></div>
        <div class="shex-divination-meditate-layer" aria-live="polite">
          <div class="shex-divination-meditate-copy">
            <p>深呼吸，让心静下来</p>
            <p>把注意力交给此刻的自己</p>
            <p>他会借由牌面回应你</p>
          </div>
          <button class="shex-divination-enter" type="button" data-divination-enter>进入选牌</button>
          <p class="shex-divination-enter-note">准备好了随时可以点击进入</p>
        </div>
        <div class="shex-divination-select-layer" aria-live="polite">
          <div class="shex-divination-select-header">
            <p class="shex-divination-select-progress" data-divination-progress>已选 0 / 3 张</p>
            <p class="shex-divination-select-hint">从以下牌面中选出三张，凭直觉选择</p>
            <button class="shex-divination-confirm" type="button" data-divination-confirm disabled>确认</button>
          </div>
          <div class="shex-divination-deck-viewport" data-divination-deck-viewport aria-label="塔罗牌圆弧牌堆">
            <div class="shex-divination-deck-rotor" data-divination-deck-rotor></div>
          </div>
        </div>
        <div class="shex-divination-reveal-layer" aria-live="polite">
          <header class="shex-divination-reveal-heading">
            <h1>牌面如下</h1>
          </header>
          <div class="shex-divination-reveal-cards" data-divination-reveal-cards></div>
          <div class="shex-divination-interpretation-state" data-divination-interpretation-state></div>
          <section class="shex-divination-interpret-confirm" data-divination-interpret-confirm>
            <h2>开启这次梦占解读</h2>
            <p>${window.SHEXAuth?.featurePriceLabel?.('divination_interpret', 50, 39) || '本次消耗 50 X能量'}，不限每日梦占次数，解读成功后才会扣除能量。此次是由小舌调教的智能体解读，相信科学，仅供参考</p>
            <div>
              <button type="button" class="shex-divination-home" data-divination-home>返回主页</button>
              <button type="button" class="shex-divination-interpret" data-divination-interpret>确认解读</button>
            </div>
          </section>
        </div>
        <div class="shex-divination-history-layer" aria-live="polite">
          <header class="shex-divination-history-heading"><h1>梦占历史</h1><p>只显示与当前梦角有关的记录</p></header>
          <div class="shex-divination-history-content" data-divination-history-content></div>
        </div>
      </section>
    `;

    const flow = content.querySelector('[data-divination-flow]');
    activeFlow = flow;
    activeDraft = draft;
    const targetFullNameInput = flow.querySelector('[data-divination-target-full-name]');
    const questionInput = flow.querySelector('[data-divination-question]');
    const backgroundInput = flow.querySelector('[data-divination-background]');
    updateDivinationAudioToggle();
    targetFullNameInput.value = draft.targetFullName;
    questionInput.value = draft.questionText;
    backgroundInput.value = draft.backgroundText;
    const updateQuestionPlaceholder = () => {
      const name = draft.targetFullName.trim() || dreamName || 'TA';
      questionInput.placeholder = `想知道关于${name}的什么`;
    };
    updateQuestionPlaceholder();

    targetFullNameInput.addEventListener('input', () => {
      draft.targetFullName = targetFullNameInput.value;
      updateQuestionPlaceholder();
      updateContinueState(flow, draft);
      persistDraft(dreamId, draft);
    });
    questionInput.addEventListener('input', () => {
      draft.questionText = questionInput.value;
      updateContinueState(flow, draft);
      persistDraft(dreamId, draft);
    });
    backgroundInput.addEventListener('input', () => {
      draft.backgroundText = backgroundInput.value;
      persistDraft(dreamId, draft);
    });
    flow.querySelectorAll('[data-divination-help]').forEach((button) => {
      button.addEventListener('click', () => {
        const help = DIVINATION_HELP_CONTENT[button.dataset.divinationHelp];
        if (!help || typeof window.openCustomCardConfirm !== 'function') return;
        window.openCustomCardConfirm({
          title: help.title,
          body: help.body,
          confirmText: '知道了'
        });
      });
    });
    flow.querySelector('[data-divination-audio-toggle]')?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      setDivinationAudioMuted(!readDivinationAudioMuted());
    });
    flow.querySelector('[data-divination-continue]').addEventListener('click', () => {
        if (!draft.targetFullName.trim() || !draft.questionText.trim()) {
          showValidationMessage('请先补全信息');
          (draft.targetFullName.trim() ? questionInput : targetFullNameInput).focus();
          return;
        }
      draft.deck = shuffleCards();
      draft.selectedIds = [];
      draft.orientations = {};
      draft.deckRotation = 0;
      draft.interpretation = null;
      draft.interpretationPending = false;
      draft.interpretationRequestId = '';
      draft.interpretationStatus = '';
      persistDraft(dreamId, draft);
      layoutDeck(flow, draft);
      setFlowScreen(flow, draft, 'meditate');
    });
    flow.querySelector('[data-divination-enter]').addEventListener('click', () => {
      if (!draft.deck.length) return;
      setFlowScreen(flow, draft, 'select');
      requestAnimationFrame(() => layoutDeck(flow, draft));
    });
    flow.querySelector('[data-divination-confirm]').addEventListener('click', async (event) => {
      if (draft.selectedIds.length !== 3) return;
      const confirmButton = event.currentTarget;
      confirmButton.disabled = true;
      await preloadSelectedRevealImages(draft);
      if (draft.selectedIds.length !== 3) {
        updateSelectionUi(flow, draft);
        return;
      }
      startReveal(flow, draft);
    });
    flow.addEventListener('click', (event) => {
      if (!event.target.closest?.('[data-divination-home]')) return;
      event.preventDefault();
      returnToWorld();
    });
    flow.querySelector('[data-divination-interpret]').addEventListener('click', (event) => {
      const interpretButton = event.currentTarget;
      if (interpretButton.disabled) return;
      interpretButton.disabled = true;
      void interpretReveal(flow, dreamId, draft, interpretButton);
    });
    flow.querySelector('[data-divination-history]').addEventListener('click', () => {
      void openHistory(flow, dreamId, draft);
    });

    bindDeckGestures(flow, draft);
    bindBackButton(panel);
    updateContinueState(flow, draft);
    if (draft.deck.length) layoutDeck(flow, draft);
    setFlowScreen(flow, draft, draft.screen);
    if (draft.screen === 'reveal' && draft.selectedIds.length === 3) {
      renderRevealCards(flow, draft);
      flow.querySelectorAll('[data-divination-reveal-card]').forEach((card) => card.classList.add('is-flipped'));
      flow.classList.add('is-reveal-complete');
      if (draft.interpretation) {
        setInterpretationStatus(flow, { type: 'success', text: draft.interpretation });
        flow.classList.add('has-interpretation');
      } else if (draft.interpretationPending && draft.interpretationRequestId) {
        flow.classList.add('is-interpreting');
        setInterpretationStatus(flow, { type: 'loading' });
        const pendingButton = flow.querySelector('[data-divination-interpret]');
        if (pendingButton) pendingButton.disabled = true;
        scheduleInterpretationStatusPoll(flow, dreamId, draft);
      }
    }
    if (draft.screen === 'history') renderHistory(flow, draft);
  }

  window.addEventListener('resize', syncDivinationViewport, { passive: true });
  window.addEventListener('orientationchange', syncDivinationViewport, { passive: true });
  window.visualViewport?.addEventListener('resize', syncDivinationViewport, { passive: true });
  window.addEventListener('pageshow', syncDivinationViewport, { passive: true });
  window.addEventListener('hashchange', () => {
    if (location.hash !== '#x-divination') stopDivinationAudio();
  }, { passive: true });
  window.addEventListener('pagehide', stopDivinationAudio, { passive: true });
  syncDivinationViewport();

  window.ShexDivination = window.ShexDivination || {};
  window.ShexDivination.stopAudio = stopDivinationAudio;
  window.ShexDivination.syncAudioForView = (view) => {
    if (view === 'divination') playDivinationAudio('view-sync');
    else stopDivinationAudio();
  };
  window.ShexDivination.open = (dreamId) => {
    const id = String(dreamId || '');
    syncDivinationViewport();
    playDivinationAudio('open');
    render(id);
  };
})();
