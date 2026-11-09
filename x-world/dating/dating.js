(() => {
  'use strict';

  const X_STATE_KEY = 'shex_x_multi_state_v1';
  const DATING_ACCESS_CODE = '2461350';
  const DATING_ACCESS_KEY = 'shex_dating_beta_access_v1';
  // Keep the existing gate implementation available for a future temporary rollout.
  const DATING_ACCESS_GATE_ENABLED = false;
  const DATING_INVITE_CHECK_KEY = 'shex_dating_invite_check_v1';
  const DATING_INVITE_PROBABILITY = 0.25;
  const DATING_AUDIO_SRC = './audio/dating-background.mp3';
  const DATING_AUDIO_MUTED_KEY = 'shex_dating_audio_muted_v1';
  const DATING_NARRATION_STYLES = Object.freeze([
    { value: 'ta_letter', label: 'TA写给你' },
    { value: 'third_person', label: '第三人称叙事' },
    { value: 'my_diary', label: '我的日记' }
  ]);

  function syncDatingViewport() {
    const height = Math.max(1, Math.round(
      window.visualViewport?.height
      || window.innerHeight
      || document.documentElement.clientHeight
      || 1
    ));
    document.documentElement.style.setProperty('--shex-dating-vh', `${height}px`);
  }

  function readDatingAudioMuted() {
    try {
      return localStorage.getItem(DATING_AUDIO_MUTED_KEY) === '1';
    } catch (_) {
      return false;
    }
  }

  function writeDatingAudioMuted(muted) {
    try {
      localStorage.setItem(DATING_AUDIO_MUTED_KEY, muted ? '1' : '0');
    } catch (_) {}
  }

  function isDatingViewActive() {
    const panel = document.querySelector('#xDatingPanel');
    return document.body?.dataset?.xPage === 'dating'
      && panel
      && panel.style.display !== 'none'
      && panel.classList.contains('show');
  }

  function ensureDatingAudio() {
    if (datingAudio) return datingAudio;
    datingAudio = document.querySelector('audio[data-dating-audio]');
    if (!datingAudio) {
      datingAudio = document.createElement('audio');
      datingAudio.dataset.datingAudio = 'true';
      datingAudio.style.display = 'none';
      document.body.appendChild(datingAudio);
    }
    datingAudio.src = DATING_AUDIO_SRC;
    datingAudio.loop = true;
    datingAudio.preload = 'auto';
    datingAudio.volume = 0.42;
    datingAudio.muted = readDatingAudioMuted();
    return datingAudio;
  }

  function updateDatingAudioToggle() {
    const muted = readDatingAudioMuted();
    document.querySelectorAll('[data-dating-audio-toggle]').forEach((button) => {
      button.classList.toggle('is-muted', muted);
      button.setAttribute('aria-pressed', String(!muted));
      button.setAttribute('aria-label', muted ? '打开X约会音乐' : '静音X约会音乐');
      button.setAttribute('title', muted ? '打开音乐' : '静音');
    });
  }

  function playDatingAudio(reason = 'open') {
    ensureDatingAudioToggle();
    const audio = ensureDatingAudio();
    audio.muted = readDatingAudioMuted();
    updateDatingAudioToggle();
    if (audio.muted || !isDatingViewActive()) {
      audio.pause();
      return;
    }
    const playTask = audio.play();
    if (playTask?.catch) playTask.catch(() => {});
  }

  function stopDatingAudio() {
    if (!datingAudio) return;
    datingAudio.pause();
    try {
      datingAudio.currentTime = 0;
    } catch (_) {}
  }

  function setDatingAudioMuted(muted) {
    writeDatingAudioMuted(muted);
    const audio = ensureDatingAudio();
    audio.muted = muted;
    if (muted) {
      audio.pause();
    } else {
      playDatingAudio('toggle');
    }
    updateDatingAudioToggle();
  }

  function datingAudioToggleMarkup() {
    const muted = readDatingAudioMuted();
    return `
      <button class="shex-dating-audio-toggle${muted ? ' is-muted' : ''}" type="button" data-dating-audio-toggle aria-pressed="${muted ? 'false' : 'true'}" aria-label="${muted ? '打开X约会音乐' : '静音X约会音乐'}" title="${muted ? '打开音乐' : '静音'}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M4 9.5v5h3.5L13 19V5L7.5 9.5H4Z"></path>
          <path class="shex-dating-audio-wave" d="M16.2 8.6a4.1 4.1 0 0 1 0 6.8"></path>
          <path class="shex-dating-audio-wave" d="M18.8 6a7.7 7.7 0 0 1 0 12"></path>
          <path class="shex-dating-audio-slash" d="M5 20 20 5"></path>
        </svg>
      </button>
    `;
  }

  function ensureDatingAudioToggle(panel = document.querySelector('#xDatingPanel')) {
    if (!panel) return null;
    let button = panel.querySelector('[data-dating-audio-toggle]');
    if (!button) {
      const backButton = panel.querySelector('.x-subpage-back');
      if (backButton) backButton.insertAdjacentHTML('afterend', datingAudioToggleMarkup());
      else panel.insertAdjacentHTML('afterbegin', datingAudioToggleMarkup());
      button = panel.querySelector('[data-dating-audio-toggle]');
    }
    if (button && button.dataset.datingAudioBound !== 'true') {
      button.dataset.datingAudioBound = 'true';
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        setDatingAudioMuted(!readDatingAudioMuted());
      });
    }
    updateDatingAudioToggle();
    return button;
  }

  function escapeHtml(value = '') {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function readXState() {
    try {
      const stored = JSON.parse(localStorage.getItem(X_STATE_KEY) || '{}');
      return stored && typeof stored === 'object' ? stored : {};
    } catch (_) {
      return {};
    }
  }

  function currentDatingDream(state, dreamId) {
    const dreams = Array.isArray(state?.dreams) ? state.dreams : [];
    return dreams.find((dream) => String(dream?.id || '') === String(dreamId || ''))
      || dreams.find((dream) => String(dream?.id || '') === String(state?.currentDreamId || ''))
      || dreams[0]
      || null;
  }

  function avatarMarkup(source, label, className) {
    const avatar = String(source || '').trim();
    const safeLabel = String(label || '你').trim() || '你';
    const isCloud = /^cloud:\/\//i.test(avatar);
    return `
      <span class="shex-dating-avatar ${className}" aria-label="${escapeHtml(safeLabel)}头像">
        <span class="shex-dating-avatar-fallback" aria-hidden="true">${escapeHtml(safeLabel.slice(0, 1))}</span>
        ${avatar ? `<img ${isCloud ? `data-dating-cloud-src="${escapeHtml(avatar)}"` : `src="${escapeHtml(avatar)}"`} alt="${escapeHtml(safeLabel)}头像">` : ''}
      </span>
    `;
  }

  async function resolveCloudAvatars(root) {
    const cloudImages = window.SHEXCloudImages;
    const images = Array.from(root.querySelectorAll('img[data-dating-cloud-src]'));
    if (cloudImages && typeof cloudImages.load === 'function') {
      await Promise.all(images.map(async (image) => {
        const source = image.dataset.datingCloudSrc || '';
        if (!source || image.dataset.datingResolving === source) return;
        image.dataset.datingResolving = source;
        try {
          await cloudImages.load(image, source);
        } finally {
          if (image.dataset.datingCloudSrc === source) delete image.dataset.datingResolving;
        }
      }));
      return;
    }
    const resolver = window.SHEXAuth?.getCloudFileTempUrl;
    if (typeof resolver !== 'function') return;
    await Promise.all(images.map(async (image) => {
      try {
        const url = await resolver(image.dataset.datingCloudSrc || '');
        if (url && image.isConnected) image.src = url;
      } catch (_) {}
    }));
  }

  function showComingSoon() {
    const showToast = window.SHEXDating?.showToast;
    if (typeof showToast === 'function') showToast('马上开放，敬请期待');
  }

  function hasDatingAccess() {
    try {
      return localStorage.getItem(DATING_ACCESS_KEY) === '1';
    } catch (_) {
      return false;
    }
  }

  function currentDatingDateKey() {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai';
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(new Date()).replace(/\//g, '-');
    } catch (_) {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(new Date()).replace(/\//g, '-');
    }
  }

  function readDatingInviteState() {
    const dateKey = currentDatingDateKey();
    try {
      const stored = JSON.parse(localStorage.getItem(DATING_INVITE_CHECK_KEY) || 'null');
      if (stored?.dateKey === dateKey && typeof stored.triggered === 'boolean') {
        return {
          dateKey,
          triggered: Boolean(stored.triggered),
          handled: Boolean(stored.handled),
          status: String(stored.status || '')
        };
      }
    } catch (_) {}
    const next = {
      dateKey,
      triggered: Math.random() < DATING_INVITE_PROBABILITY,
      handled: false,
      status: ''
    };
    try {
      localStorage.setItem(DATING_INVITE_CHECK_KEY, JSON.stringify(next));
    } catch (_) {}
    return next;
  }

  function writeDatingInviteState(patch = {}) {
    const current = readDatingInviteState();
    const next = { ...current, ...patch, dateKey: current.dateKey };
    try {
      localStorage.setItem(DATING_INVITE_CHECK_KEY, JSON.stringify(next));
    } catch (_) {}
    return next;
  }

  function hasPendingDatingInvite() {
    const state = readDatingInviteState();
    return Boolean(state.triggered && !state.handled);
  }

  function refreshDatingBadge() {
    const badge = document.querySelector('[data-dating-badge]');
    if (badge) badge.hidden = !hasPendingDatingInvite();
  }

  function renderDatingGate(dreamId) {
    const panel = document.querySelector('#xDatingPanel');
    const content = panel?.querySelector('[data-dating-page-content]');
    if (!panel || !content) return;

    content.innerHTML = `
      <section class="shex-dating-gate" aria-labelledby="shexDatingGateTitle">
        <form class="shex-dating-gate-sheet" data-dating-gate-form>
          <p class="shex-dating-gate-kicker">X Dating</p>
          <h1 id="shexDatingGateTitle">完善中</h1>
          <p>敬请期待，稍后回来看看</p>
          <label class="shex-dating-gate-field">
            <span>访问码</span>
            <input type="password" autocomplete="off" inputmode="numeric" data-dating-gate-code>
          </label>
          <p class="shex-dating-gate-error" data-dating-gate-error aria-live="polite"></p>
          <button type="submit">确认</button>
        </form>
      </section>
    `;
    resetDatingPanelScroll();

    const form = content.querySelector('[data-dating-gate-form]');
    const input = content.querySelector('[data-dating-gate-code]');
    const error = content.querySelector('[data-dating-gate-error]');
    form?.addEventListener('submit', (event) => {
      event.preventDefault();
      if (input?.value !== DATING_ACCESS_CODE) {
        if (error) error.textContent = '访问码不对，请再试一次';
        input?.focus?.({ preventScroll: true });
        input?.select();
        return;
      }
      try {
        localStorage.setItem(DATING_ACCESS_KEY, '1');
      } catch (_) {}
      render(dreamId);
    });
    requestAnimationFrame(() => {
      input?.focus?.({ preventScroll: true });
      resetDatingPanelScroll();
    });
  }

  const datingChoiceOptions = window.SHEXDatingPhoto?.choiceOptions?.OPTIONS;
  if (!['atmosphere', 'place', 'activity', 'item'].every((field) => Array.isArray(datingChoiceOptions?.[field]))) {
    console.warn('[SHEX Dating] dp-choice-options.js 未加载或不完整；缺失的建议已隐藏，自由填写和提交仍可使用。');
  }
  function datingSuggestions(field) {
    const options = datingChoiceOptions?.[field];
    return Array.isArray(options) ? options.map((option) => option?.label).filter((label) => typeof label === 'string' && label.trim()) : [];
  }

  const DATING_STEP_DEFS = Object.freeze([
    {
      key: 'mood',
      icon: 'heart',
      label: '约会氛围',
      questionLines: ['这一次，', '你想要怎样的感觉？'],
      placeholder: '例如：安静一点',
      suggestText: '看看氛围建议',
      suggestions: datingSuggestions('atmosphere')
    },
    {
      key: 'place',
      icon: 'pin',
      label: '想去的地方',
      questionLines: ['这一次，', '想去哪里走走？'],
      placeholder: '例如：海边、咖啡馆或小书店',
      suggestText: '看看地点建议',
      suggestions: datingSuggestions('place')
    },
    {
      key: 'activity',
      icon: 'list',
      label: '想做的事情',
      questionLines: ['这一次，', '想做点什么？'],
      placeholder: '例如：牵手散步，或一起听歌',
      suggestText: '看看活动建议',
      suggestions: datingSuggestions('activity')
    },
    {
      key: 'item',
      icon: 'gift',
      label: '想带的东西',
      questionLines: ['这一次，', '想带点什么？'],
      placeholder: '例如：一束花，或什么都不用带',
      suggestText: '看看清单建议',
      suggestions: datingSuggestions('item')
    }
  ]);

  const DATING_TA_ANSWERS = Object.freeze([
    '自由随性，想轻松一点',
    '郊外公路或安静的高处',
    '夜间兜风，听喜欢的音乐',
    '一张黑胶唱片'
  ]);
  const DATING_SUBMIT_TIMEOUT_MS = 35000;
  const DATING_RESULT_TIMEOUT_MS = 70000;
  const DATING_LOADING_TEXTS = Object.freeze([
    'TA正在为这场约会做准备…',
    '正在整理这次约会发生的一切…',
    '把你们的心意慢慢放在一起…',
    '就快出发了…'
  ]);

  let datingFlowState = null;
  let datingBackState = { mode: 'world', dreamId: '' };
  let datingOpenSource = null;
  let datingPhotoBack = null;
  let datingCloudApp = null;
  let datingAudio = null;

  function datingContent() {
    return document.querySelector('#xDatingPanel')?.querySelector('[data-dating-page-content]') || null;
  }

  // X约会：Free 20 / 会员 15，只显示当前用户自己的价格。
  function datingCostLabel() {
    return window.SHEXAuth?.featurePriceLabel?.('dating_result', 20, 15) || '本次消耗 20 X能量';
  }

  function loadDatingCloudbaseSdk() {
    if (window.cloudbase) return Promise.resolve();
    const config = window.SHEX_CLOUDBASE_CONFIG || {};
    const src = config.sdkUrl || 'https://static.cloudbase.net/cloudbase-js-sdk/2.9.0/cloudbase.full.js';
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${src}"]`);
      if (existing) {
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', () => reject(new Error('CloudBase SDK 加载失败')), { once: true });
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

  async function getDatingCloudApp() {
    if (datingCloudApp) return datingCloudApp;
    const config = window.SHEX_CLOUDBASE_CONFIG || {};
    if (!config.envId) throw new Error('CloudBase 环境未配置');
    await loadDatingCloudbaseSdk();
    const app = window.cloudbase.init({
      env: config.envId,
      region: config.region || 'ap-shanghai',
      timeout: DATING_RESULT_TIMEOUT_MS
    });
    const auth = app.auth({ persistence: 'local' });
    try {
      const state = await auth.getLoginState();
      if (!state && typeof auth.signInAnonymously === 'function') await auth.signInAnonymously();
      else if (!state && typeof auth.anonymousAuthProvider === 'function') await auth.anonymousAuthProvider().signIn();
    } catch (error) {
      console.warn('[SHEX Dating] CloudBase anonymous auth failed:', error);
    }
    datingCloudApp = app;
    return app;
  }

  function currentDatingSession() {
    const current = window.SHEXAuth?.current?.();
    if (!current?.userId || !current?.sessionToken) {
      const error = new Error('登录状态已失效，请重新登录后再试');
      error.code = 'SESSION_EXPIRED';
      throw error;
    }
    return current;
  }

  function datingRequestId(kind, userId, dreamId) {
    return `${kind}_${String(userId || 'user')}_${String(dreamId || 'dream')}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
      .replace(/[^a-zA-Z0-9_-]/g, '')
      .slice(0, 240);
  }

  async function callDatingAction(data, options = {}) {
    const app = await getDatingCloudApp();
    const timeoutMs = Number(options.timeoutMs || DATING_SUBMIT_TIMEOUT_MS);
    const startedAt = Date.now();
    let result;
    try {
      result = await app.callFunction({ name: 'shexDatingAI', data, timeout: timeoutMs });
    } catch (rawError) {
      const error = rawError instanceof Error ? rawError : new Error(String(rawError || 'X约会服务暂时不可用，请稍后重试'));
      if (!error.code && rawError?.code) error.code = rawError.code;
      console.error('[SHEX_DATING_CALL_FAILED]', {
        action: data?.action || '',
        timeoutMs,
        elapsedMs: Date.now() - startedAt,
        code: error.code || '',
        message: error.message || '',
        raw: rawError
      });
      throw error;
    }
    const response = result?.result || result;
    if (!response?.ok) {
      const error = new Error(response?.message || response?.detail || 'X约会服务暂时不可用，请稍后重试');
      error.code = response?.code || 'DATING_FAILED';
      // Photo deletion needs the server's affected-component list for its second confirmation.
      ['components', 'errors', 'step'].forEach((key) => {
        if (response?.[key] !== undefined) error[key] = response[key];
      });
      throw error;
    }
    return response;
  }

  function datingChoicesFromAnswers() {
    return {
      atmosphere: String(datingFlowState?.answers?.[0] || '').trim(),
      place: String(datingFlowState?.answers?.[1] || '').trim(),
      activity: String(datingFlowState?.answers?.[2] || '').trim(),
      item: String(datingFlowState?.answers?.[3] || '').trim()
    };
  }

  function choicesToAnswers(choices = {}) {
    return [
      choices.atmosphere || choices.mood || '',
      choices.place || '',
      choices.activity || '',
      choices.item || ''
    ].map((item) => String(item || '').trim());
  }

  function datingErrorText(error, fallback = '生成失败，请稍后重试') {
    if (error?.code === 'PLAN_REQUIRED') return '套餐状态暂时无法确认，请稍后重试';
    if (error?.code === 'ENERGY_NOT_ENOUGH') return 'X能量不足，请充值后再试';
    if (error?.code === 'SESSION_EXPIRED') return '登录状态已失效，请重新登录后再试';
    const message = String(error?.message || '').trim();
    if (!message || message.includes('FUNCTION_NOT_FOUND') || message.includes('OPERATION_FAIL') || message.startsWith('{')) {
      return fallback;
    }
    return message;
  }

  function showDatingToast(message, options = {}) {
    const content = datingContent() || document.body;
    const toast = document.createElement('div');
    toast.className = 'shex-dating-toast';
    toast.textContent = message;
    content.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('is-visible'));
    if (!options.persist) {
      window.setTimeout(() => {
        toast.classList.remove('is-visible');
        window.setTimeout(() => toast.remove(), 260);
      }, options.duration || 1600);
    }
    return toast;
  }

  function removeDatingToast(toast) {
    if (!toast) return;
    toast.classList.remove('is-visible');
    window.setTimeout(() => toast.remove(), 260);
  }

  function openSuggestionSheet(step, onPick) {
    const panel = document.querySelector('#xDatingPanel');
    const host = panel || document.body;
    const options = Array.isArray(step?.suggestions) ? step.suggestions : [];
    const sheet = document.createElement('div');
    sheet.className = 'shex-dating-suggest-pop';
    sheet.innerHTML = `
      <div class="shex-dating-suggest-pop-card" role="dialog" aria-modal="true" aria-label="${escapeHtml(step?.label || '约会建议')}">
        <button class="shex-dating-suggest-close" type="button" aria-label="关闭">×</button>
        <p>选一条感觉对的</p>
        <div class="shex-dating-suggest-options">
          ${options.map((option) => `<button type="button" data-dating-suggest-option="${escapeHtml(option)}">${escapeHtml(option)}</button>`).join('')}
        </div>
      </div>
    `;
    const close = () => sheet.remove();
    sheet.addEventListener('click', (event) => {
      if (event.target === sheet || event.target.closest('.shex-dating-suggest-close')) {
        close();
        return;
      }
      const button = event.target.closest('[data-dating-suggest-option]');
      if (!button) return;
      onPick?.(button.dataset.datingSuggestOption || button.textContent || '');
      close();
    });
    host.appendChild(sheet);
    requestAnimationFrame(() => sheet.classList.add('is-open'));
  }

  function resetDatingPanelScroll() {
    const panel = document.querySelector('#xDatingPanel');
    if (!panel) return;
    const shell = panel.querySelector('.x-status-page-shell');
    const content = panel.querySelector('.x-status-page-content');
    const flow = panel.querySelector('.shex-dating-flow, .shex-dating-home');
    panel.scrollTop = 0;
    if (shell) shell.scrollTop = 0;
    if (content) content.scrollTop = 0;
    if (flow) flow.scrollTop = 0;
  }

  function returnDatingToWorld() {
    datingFlowState = null;
    stopDatingAudio();
    if (typeof window.SHEXReturnToXWorldHome === 'function') {
      window.SHEXReturnToXWorldHome();
      return;
    }
    if (window.location.hash !== '#x-world') {
      window.location.hash = '#x-world';
    }
  }

  function setDatingBack(mode, dreamId) {
    if (mode !== 'photo') datingPhotoBack = null;
    datingBackState = { mode: mode || 'world', dreamId: String(dreamId || datingBackState?.dreamId || '') };
  }

  function bindBackButton(panel) {
    const backButton = panel?.querySelector?.('.x-subpage-back');
    if (!backButton) return;
    backButton.removeAttribute('data-x-home-back');
    backButton.classList.add('shex-dating-back');
    backButton.dataset.datingBack = 'true';
    backButton.setAttribute('aria-label', '返回');
  }

  function handleDatingBack() {
    const mode = datingBackState?.mode || 'world';
    const dreamId = String(datingBackState?.dreamId || datingFlowState?.dreamId || '');

    if (mode === 'photo' && datingPhotoBack) {
      datingPhotoBack();
      return;
    }
    if (mode === 'stories' || mode === 'photos') {
      renderDatingBook(dreamId, mode);
      return;
    }
    if (mode === 'home') {
      datingFlowState = null;
      render(dreamId);
      return;
    }
    if (mode === 'anniversaries') {
      renderDatingAnniversaries(dreamId);
      return;
    }
    if (mode === 'step') {
      if (datingFlowState && datingFlowState.stepIndex > 0) {
        datingFlowState.stepIndex -= 1;
        renderStep();
      } else {
        datingFlowState = null;
        render(dreamId);
      }
      return;
    }
    if (mode === 'confirm') {
      if (datingFlowState) datingFlowState.stepIndex = DATING_STEP_DEFS.length - 1;
      renderStep();
      return;
    }
    if (mode === 'reveal') {
      renderConfirm();
      return;
    }

    if (datingOpenSource?.source === 'chat' && typeof datingOpenSource.onReturn === 'function') {
      const source = datingOpenSource;datingOpenSource = null;source.onReturn();return;
    }
    returnDatingToWorld();
  }

  document.addEventListener('click', (event) => {
    const backButton = event.target.closest?.('[data-dating-back]');
    if (!backButton) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    handleDatingBack();
  }, true);

  document.addEventListener('click', (event) => {
    const revealButton = event.target.closest?.('#xDatingPanel [data-dating-reveal-final]');
    if (!revealButton) return;
    event.preventDefault();
    revealFinal();
  }, true);

  function answerText(index) {
    const answer = String(datingFlowState?.answers?.[index] || '').trim();
    return answer || '暂时还没想好';
  }

  function isDatingPhotoSource(value) {
    return /^(cloud:\/\/|data:image\/|https?:\/\/)/i.test(String(value || '').trim());
  }

  function datingAvatarPhoto(kind = 'dream', dreamId = '') {
    const normalizedKind = kind === 'user' ? 'user' : 'dream';
    const id = String(dreamId || datingFlowState?.dreamId || '');
    const api = window.SHEXDatingAvatarPhotos;
    if (api && typeof api.get === 'function') {
      const photo = api.get(normalizedKind, id);
      if (photo?.fileID || photo?.fileId || photo?.id) return photo;
    }
    const state = readXState();
    const dream = id
      ? (Array.isArray(state.dreams) ? state.dreams : []).find((item) => String(item?.id || '') === id)
      : currentDatingDream(state, id);
    if (!dream) return null;
    if (normalizedKind === 'user') {
      const ref = String(dream?.chatUserAvatar || state?.userAvatar || '').trim();
      return isDatingPhotoSource(ref) ? { id: ref, fileID: ref } : null;
    }
    const ref = String(dream?.avatar || '').trim();
    return isDatingPhotoSource(ref) ? { id: ref, fileID: ref } : null;
  }

  function datingAvatarImageMarkup(photo, label) {
    const fileID = String(photo?.fileID || photo?.fileId || photo?.id || '').trim();
    if (!isDatingPhotoSource(fileID)) return '';
    const safeFile = escapeHtml(fileID);
    const safeLabel = escapeHtml(label || '约会');
    const view = window.SHEXImageCropper?.normalizeView?.(photo?.view);
    const viewStyle = view
      ? ` style="object-position:${(view.focalX * 100).toFixed(3)}% ${(view.focalY * 100).toFixed(3)}%;transform:scale(${view.zoom}) rotate(${view.rotation}deg);transform-origin:${(view.focalX * 100).toFixed(3)}% ${(view.focalY * 100).toFixed(3)}%"`
      : '';
    if (/^cloud:\/\//i.test(fileID)) {
      return `<img class="shex-dating-avatar-photo x-cloud-image-loading" src="" data-dating-cloud-src="${safeFile}" aria-busy="true" alt="${safeLabel}头像"${viewStyle}>`;
    }
    return `<img class="shex-dating-avatar-photo is-loaded" src="${safeFile}" alt="${safeLabel}头像"${viewStyle}>`;
  }

  function datingAvatarFaceMarkup({ kind, dreamId, label, className, fallbackSvg }) {
    const photo = datingAvatarPhoto(kind, dreamId);
    const photoMarkup = datingAvatarImageMarkup(photo, label);
    const safeKind = kind === 'user' ? 'user' : 'dream';
    return `
      <button class="${className} shex-dating-avatar-pick${photoMarkup ? ' has-photo' : ''}" type="button" data-dating-avatar-pick="${safeKind}" aria-label="点击更换${escapeHtml(label || '约会')}头像" title="点击更换头像">
        ${photoMarkup || fallbackSvg}
      </button>
    `;
  }

  function homeDreamFaceSvg() {
    return `
      <svg viewBox="0 0 76 76" aria-hidden="true">
        <path d="M14 29c3-11 45-11 48 0" stroke="#8a5c66" stroke-width="5" fill="none" stroke-linecap="round"/>
        <circle cx="30" cy="37" r="2.6" fill="#4b363c"/><circle cx="46" cy="37" r="2.6" fill="#4b363c"/>
        <path d="M28 48c3.4 4 17 4 20.5 0" stroke="#4b363c" stroke-width="2.2" fill="none" stroke-linecap="round"/>
      </svg>
    `;
  }

  function homeUserFaceSvg() {
    return `
      <svg viewBox="0 0 76 76" aria-hidden="true">
        <circle cx="30" cy="35" r="2.6" fill="#5b3a40"/><circle cx="46" cy="35" r="2.6" fill="#5b3a40"/>
        <path d="M28 46c3.4 4 17 4 20.5 0" stroke="#5b3a40" stroke-width="2.2" fill="none" stroke-linecap="round"/>
        <circle cx="22" cy="43" r="4" fill="#f3a6ab" opacity=".5"/><circle cx="54" cy="43" r="4" fill="#f3a6ab" opacity=".5"/>
      </svg>
    `;
  }

  function miniDreamFaceSvg() {
    return `
      <svg viewBox="0 0 44 44" aria-hidden="true">
        <path d="M8 16c2-6 26-6 28 0" stroke="#8a5c66" stroke-width="3" fill="none" stroke-linecap="round"/>
        <circle cx="17" cy="20" r="1.6" fill="#4b363c"/><circle cx="27" cy="20" r="1.6" fill="#4b363c"/>
        <path d="M16 27c2 2.4 10 2.4 12 0" stroke="#4b363c" stroke-width="1.6" fill="none" stroke-linecap="round"/>
      </svg>
    `;
  }

  function miniUserFaceSvg() {
    return `
      <svg viewBox="0 0 44 44" aria-hidden="true">
        <circle cx="17" cy="19" r="1.6" fill="#5b3a40"/><circle cx="27" cy="19" r="1.6" fill="#5b3a40"/>
        <path d="M16 26c2 2.4 10 2.4 12 0" stroke="#5b3a40" stroke-width="1.6" fill="none" stroke-linecap="round"/>
      </svg>
    `;
  }

  function matchDreamFaceSvg() {
    return `
      <svg viewBox="0 0 56 56" aria-hidden="true">
        <path d="M11 21c3-8 34-8 37 0" stroke="#8a5c66" stroke-width="3.4" fill="none" stroke-linecap="round"/>
        <circle cx="22" cy="26" r="2" fill="#4b363c"/><circle cx="34" cy="26" r="2" fill="#4b363c"/>
        <path d="M21 35c3 3 11 3 14 0" stroke="#4b363c" stroke-width="1.9" fill="none" stroke-linecap="round"/>
      </svg>
    `;
  }

  function matchUserFaceSvg() {
    return `
      <svg viewBox="0 0 56 56" aria-hidden="true">
        <circle cx="22" cy="25" r="2" fill="#5b3a40"/><circle cx="34" cy="25" r="2" fill="#5b3a40"/>
        <path d="M21 34c3 3 11 3 14 0" stroke="#5b3a40" stroke-width="1.9" fill="none" stroke-linecap="round"/>
      </svg>
    `;
  }

  function daysTogetherText(dream) {
    const days = daysTogetherFromDate(dream?.datingTogetherSince || '');
    if (Number.isFinite(days)) return `在一起 ${days} 天`;
    return '记录你们的相处时光';
  }

  function daysTogetherNumber(dream) {
    return daysTogetherFromDate(dream?.datingTogetherSince || '');
  }

  function homeIllustrationPairMarkup(dreamName, userName, dreamId = '') {
    return `
      <div class="shex-dating-home-pair" aria-label="${escapeHtml(dreamName)}与${escapeHtml(userName)}">
        <div class="shex-dating-home-person">
          ${datingAvatarFaceMarkup({ kind: 'dream', dreamId, label: dreamName, className: 'shex-dating-home-face is-dream', fallbackSvg: homeDreamFaceSvg() })}
          <strong>${escapeHtml(dreamName)}</strong>
        </div>
        <div class="shex-dating-home-link" aria-hidden="true">
          <div></div>
          <span><svg width="14" height="14" viewBox="0 0 24 24" fill="var(--dating-rose-deep)"><path d="M12,21.35l-1.45-1.32C5.4,15.36,2,12.28,2,8.5 C2,5.42,4.42,3,7.5,3c1.74,0,3.41,0.81,4.5,2.09C13.09,3.81,14.76,3,16.5,3 C19.58,3,22,5.42,22,8.5c0,3.78-3.4,6.86-8.55,11.54L12,21.35z"/></svg></span>
          <div></div>
        </div>
        <div class="shex-dating-home-person">
          ${datingAvatarFaceMarkup({ kind: 'user', dreamId, label: userName, className: 'shex-dating-home-face is-user', fallbackSvg: homeUserFaceSvg() })}
          <strong>${escapeHtml(userName)}</strong>
        </div>
      </div>
    `;
  }

  function miniAvatarPairMarkup(dreamId = datingFlowState?.dreamId || '') {
    return `
      <div class="shex-dating-mini-pair" aria-label="约会头像">
        ${datingAvatarFaceMarkup({ kind: 'dream', dreamId, label: '梦角', className: 'shex-dating-mini-face is-dream', fallbackSvg: miniDreamFaceSvg() })}
        <div class="shex-dating-mini-link">
          <div></div>
          <span>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="var(--dating-rose-deep)"><path d="M12,21.35l-1.45-1.32C5.4,15.36,2,12.28,2,8.5 C2,5.42,4.42,3,7.5,3c1.74,0,3.41,0.81,4.5,2.09C13.09,3.81,14.76,3,16.5,3 C19.58,3,22,5.42,22,8.5c0,3.78-3.4,6.86-8.55,11.54L12,21.35z"/></svg>
          </span>
          <div></div>
        </div>
        ${datingAvatarFaceMarkup({ kind: 'user', dreamId, label: '你', className: 'shex-dating-mini-face is-user', fallbackSvg: miniUserFaceSvg() })}
      </div>
    `;
  }

  function revealCardDecorMarkup(mirror = false) {
    return `
      <svg class="shex-dating-reveal-decor${mirror ? ' is-mirror' : ''}" width="46" height="30" viewBox="0 0 46 30" fill="none" stroke="var(--dating-rose)" stroke-width="1.6" stroke-linecap="round" aria-hidden="true">
        <path d="M3 20c4-8 8 4 12-2s6-10 10-4 8 8 12 2"/>
        <path d="M20 10c1-2 3-2 4 0s-1 4-2 2-1-1 1-2" fill="var(--dating-rose)" stroke="none"/>
      </svg>
    `;
  }

  function revealDividerMarkup() {
    return `
      <div class="shex-dating-reveal-divider" aria-hidden="true">
        <div></div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="var(--dating-rose-deep)"><path d="M12 21s-7.5-4.6-10-9.5C.5 7 3 3 7 3c2 0 3.6 1 5 2.8C13.4 4 15 3 17 3c4 0 6.5 4 5 8.5C19.5 16.4 12 21 12 21z"/></svg>
      </div>
    `;
  }

  function largeAvatarPairMatchMarkup(dreamId = datingFlowState?.dreamId || '') {
    return `
      <div class="shex-dating-match-head" aria-label="约会匹配度">
        ${datingAvatarFaceMarkup({ kind: 'dream', dreamId, label: '梦角', className: 'shex-dating-match-face is-dream', fallbackSvg: matchDreamFaceSvg() })}
        <div class="shex-dating-match-ring">
          <svg width="68" height="68" viewBox="0 0 68 68">
            <circle cx="34" cy="34" r="28" fill="none" stroke="var(--dating-line)" stroke-width="5"/>
            <circle data-dating-match-ring cx="34" cy="34" r="28" fill="none" stroke="var(--dating-rose-deep)" stroke-width="5" stroke-linecap="round" stroke-dasharray="175.9" stroke-dashoffset="175.9"/>
          </svg>
          <div>
            <span data-dating-match-value>0%</span>
            <small>匹配度</small>
          </div>
        </div>
        ${datingAvatarFaceMarkup({ kind: 'user', dreamId, label: '你', className: 'shex-dating-match-face is-user', fallbackSvg: matchUserFaceSvg() })}
      </div>
    `;
  }

  function timelineIconMarkup(type) {
    const icons = {
      car: '<path d="M5 16h14l-1.8-5.1A2 2 0 0 0 15.3 9H8.7a2 2 0 0 0-1.9 1.9L5 16Z"/><path d="M4 16v3h2.3M17.7 19H20v-3"/><circle cx="8" cy="19" r="1.7"/><circle cx="16" cy="19" r="1.7"/><path d="M7 13h10"/>',
      mountain: '<path d="M3.5 18.5 9 10l4 6 2.2-3.4 5.3 5.9Z"/><path d="M9 10l1.5 2M15.2 12.6l1.1 1.6"/><path d="M4 20.5h16"/>',
      heart: '<path d="M12,21.35l-1.45-1.32C5.4,15.36,2,12.28,2,8.5 C2,5.42,4.42,3,7.5,3c1.74,0,3.41,0.81,4.5,2.09C13.09,3.81,14.76,3,16.5,3 C19.58,3,22,5.42,22,8.5c0,3.78-3.4,6.86-8.55,11.54L12,21.35z"/>',
      gift: '<path d="M4.5 10h15v10h-15Z"/><path d="M3.5 7h17v3h-17Z"/><path d="M12 7v13"/><path d="M12 7c-3.2 0-4.4-3-2-3 1.5 0 2 1.5 2 3Zm0 0c3.2 0 4.4-3 2-3-1.5 0-2 1.5-2 3Z"/>'
    };
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${icons[type] || icons.heart}</svg>`;
  }

  function stepIconMarkup(type) {
    const icons = {
      heart: '<path d="M12,21.35l-1.45-1.32C5.4,15.36,2,12.28,2,8.5 C2,5.42,4.42,3,7.5,3c1.74,0,3.41,0.81,4.5,2.09C13.09,3.81,14.76,3,16.5,3 C19.58,3,22,5.42,22,8.5c0,3.78-3.4,6.86-8.55,11.54L12,21.35z"/>',
      pin: '<path d="M12 21s6-5.2 6-11a6 6 0 1 0-12 0c0 5.8 6 11 6 11Z"/><circle cx="12" cy="10" r="2.2"/>',
      list: '<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>',
      gift: '<path d="M4.5 10h15v10h-15Z"/><path d="M3.5 7h17v3h-17Z"/><path d="M12 7v13"/><path d="M12 7c-3.2 0-4.4-3-2-3 1.5 0 2 1.5 2 3Zm0 0c3.2 0 4.4-3 2-3-1.5 0-2 1.5-2 3Z"/>'
    };
    return `
      <span class="shex-dating-step-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${icons[type] || icons.heart}</svg>
      </span>
    `;
  }

  function animateDatingMatchRing(root, targetPercent = 78) {
    const ring = root?.querySelector('[data-dating-match-ring]');
    const value = root?.querySelector('[data-dating-match-value]');
    if (!ring || !value) return;
    const total = 175.9;
    const numericTarget = Number(targetPercent);
    const target = Number.isFinite(numericTarget) ? Math.max(1, Math.min(99, Math.round(numericTarget))) : 78;
    const start = performance.now();
    const duration = 880;
    const tick = (now) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(target * eased);
      ring.style.strokeDashoffset = String(total * (1 - (target * eased) / 100));
      value.textContent = `${current}%`;
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  function setInviteResult(card, status) {
    const title = card.querySelector('[data-dating-invite-title]');
    const description = card.querySelector('[data-dating-invite-description]');
    const actions = card.querySelector('[data-dating-invite-actions]');
    if (status === 'declined') {
      if (title) title.textContent = '本次邀请已结束';
      if (description) description.textContent = '没有产生任何约会任务';
      card.classList.add('is-declined');
    }
    if (actions) actions.hidden = true;
  }

  function bindHomeInteractions(content, dreamId) {
    const inviteCard = content.querySelector('[data-dating-invite-card]');
    const planInfoButton = inviteCard?.querySelector('[data-dating-plan-info]');
    const planInfoPopover = inviteCard?.querySelector('[data-dating-plan-info-popover]');
    let closePlanInfoOnOutside = null;
    const closePlanInfo = () => {
      if (!planInfoButton || !planInfoPopover) return;
      planInfoPopover.hidden = true;
      planInfoButton.setAttribute('aria-expanded', 'false');
      if (closePlanInfoOnOutside) {
        document.removeEventListener('click', closePlanInfoOnOutside);
        closePlanInfoOnOutside = null;
      }
    };
    planInfoButton?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!planInfoPopover) return;
      const shouldOpen = planInfoPopover.hidden;
      closePlanInfo();
      if (!shouldOpen) return;
      planInfoPopover.hidden = false;
      planInfoButton.setAttribute('aria-expanded', 'true');
      closePlanInfoOnOutside = (outsideEvent) => {
        if (planInfoButton.contains(outsideEvent.target) || planInfoPopover.contains(outsideEvent.target)) return;
        closePlanInfo();
      };
      document.addEventListener('click', closePlanInfoOnOutside);
    });
    planInfoPopover?.addEventListener('click', (event) => event.stopPropagation());
    const startDatingFromInvite = async (button, acceptInvite = false) => {
      if (!button || button.disabled) return;
      button.disabled = true;
      let canStart = true;
      try {
        const current = currentDatingSession();
        const data = await callDatingAction({
          action: 'datingCheckStartAvailability',
          userId: current.userId,
          sessionToken: current.sessionToken,
          dreamId
        }, { timeoutMs: DATING_SUBMIT_TIMEOUT_MS });
        canStart = data.canStart !== false;
        if (!canStart) showDatingToast(data.message || '这个梦角今天暂时不能发起约会');
      } catch (error) {
        const blockingCodes = new Set([
          'PLAN_REQUIRED',
          'DATING_DAILY_LIMIT_REACHED',
          'SESSION_EXPIRED',
          'DREAM_NOT_FOUND',
          'INVALID_DATING_PARAMS'
        ]);
        if (blockingCodes.has(error?.code)) {
          canStart = false;
          showDatingToast(String(error?.message || '').trim() || datingErrorText(error, '这个梦角今天暂时不能发起约会'));
        } else {
          console.warn('[SHEX_DATING_START_CHECK_FAILED_OPEN]', error);
        }
      } finally {
        button.disabled = false;
      }
      if (!canStart) return;
      if (acceptInvite) {
        writeDatingInviteState({ handled: true, status: 'accepted' });
        refreshDatingBadge();
      }
      openStepFlow(dreamId);
    };
    const acceptButton = inviteCard?.querySelector('[data-dating-accept]');
    acceptButton?.addEventListener('click', () => startDatingFromInvite(acceptButton, true));
    const startButton = inviteCard?.querySelector('[data-dating-start]');
    startButton?.addEventListener('click', () => startDatingFromInvite(startButton));
    inviteCard?.querySelector('[data-dating-decline]')?.addEventListener('click', () => {
      writeDatingInviteState({ handled: true, status: 'declined' });
      refreshDatingBadge();
      setInviteResult(inviteCard, 'declined');
    });
    content.querySelectorAll('[data-dating-section]').forEach((button) => {
      button.addEventListener('click', () => {
        const section = button.dataset.datingSection || '';
        if (section === 'book') renderDatingBook(dreamId);
        else if (section === 'anniversary') renderDatingAnniversaries(dreamId);
        else if (section === 'persona') renderDatingPersonaSummary(dreamId);
        else showComingSoon();
      });
    });
    bindDatingPhotoButtons(content, dreamId);
  }

  function refreshCurrentDatingAvatarView(dreamId = '') {
    const content = datingContent();
    const id = String(dreamId || datingFlowState?.dreamId || datingBackState?.dreamId || '');
    if (!content) {
      render(id);
      return;
    }
    if (content.querySelector('.shex-dating-step-screen') && datingFlowState) {
      renderStep();
      return;
    }
    if (content.querySelector('.shex-dating-confirm-screen') && datingFlowState) {
      renderConfirm();
      return;
    }
    if (content.querySelector('.shex-dating-reveal-screen') && datingFlowState) {
      renderReveal();
      return;
    }
    if (content.querySelector('.shex-dating-final-screen') && datingFlowState) {
      renderFinalSummary();
      return;
    }
    render(id);
  }

  function bindDatingAvatarPickers(content, dreamId = '') {
    const avatarApi = window.SHEXDreamAvatarPhotos;
    content.querySelectorAll('[data-dating-avatar-pick]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const kind = button.dataset.datingAvatarPick === 'user' ? 'user' : 'dream';
        const id = String(dreamId || datingFlowState?.dreamId || datingBackState?.dreamId || '');
        if (!avatarApi || typeof avatarApi.open !== 'function') {
          showDatingToast('头像选择暂时不可用，请稍后再试');
          return;
        }
        avatarApi.open(kind, id, () => refreshCurrentDatingAvatarView(id));
      });
    });
  }

  function hydrateDatingAvatars(content, dreamId = '') {
    if (!content) return;
    resolveCloudAvatars(content);
    bindDatingAvatarPickers(content, dreamId);
  }

  function formatDatingDate(value) {
    const stamp = Number(value || 0);
    if (!Number.isFinite(stamp) || stamp <= 0) return '刚刚';
    const date = new Date(stamp);
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${month}月${day}日`;
  }

  function dateInputToday() {
    const date = new Date(Date.now() + 8 * 60 * 60 * 1000);
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function beijingCalendarDay(value = '') {
    const match = String(value || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const stamp = Date.UTC(year, month - 1, day);
    const parsed = new Date(stamp);
    return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
      ? Math.floor(stamp / 86400000)
      : null;
  }

  function daysTogetherFromDate(value = '', now = Date.now()) {
    const start = beijingCalendarDay(value);
    const today = beijingCalendarDay((() => {
      const date = new Date(Number(now) + 8 * 60 * 60 * 1000);
      return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
    })());
    if (start === null || today === null) return null;
    return Math.max(1, today - start + 1);
  }

  function datingHistoryResultToFlow(record = {}, dreamId = '', returnSource = 'stories') {
    const userChoices = record.userChoices || {};
    return {
      dreamId: String(record.dreamId || dreamId || ''),
      recordId: String(record.recordId || record.sessionId || ''),
      returnSource: returnSource === 'photos' ? 'photos' : 'stories',
      stepIndex: DATING_STEP_DEFS.length - 1,
      answers: choicesToAnswers(userChoices),
      userChoices,
      aiChoices: record.aiChoices || {},
      sessionId: record.sessionId || record.recordId || '',
      narrationStyle: record.narrationStyle || 'ta_letter',
      result: {
        resultTitle: record.resultTitle,
        matchPercent: record.matchPercent,
        chemistryTags: record.chemistryTags || [],
        individualNotes: record.individualNotes || [],
        timeline: record.timeline || [],
        suggestedItems: record.suggestedItems || [],
        giftSuggestion: record.giftSuggestion || {},
        fullStory: record.fullStory || '',
        consumedEnergy: record.consumedEnergy,
        narrationStyle: record.narrationStyle || 'ta_letter',
        completedAt: record.completedAt || 0
      }
    };
  }

  function currentDatingDreamData(dreamId = '') {
    const state = readXState();
    return currentDatingDream(state, dreamId);
  }

  function datingAnniversariesFor(dreamId = '') {
    const api = window.SHEXDatingProfileData;
    if (api && typeof api.getAnniversaries === 'function') {
      return api.getAnniversaries(dreamId) || [];
    }
    const dream = currentDatingDreamData(dreamId);
    return Array.isArray(dream?.datingAnniversaries) ? dream.datingAnniversaries : [];
  }

  async function saveDatingAnniversaries(dreamId = '', items = [], options = {}) {
    const api = window.SHEXDatingProfileData;
    if (!api || typeof api.setAnniversaries !== 'function') {
      showDatingToast('纪念日保存功能暂时不可用');
      return false;
    }
    return api.setAnniversaries(dreamId, items, options);
  }

  function datingTogetherSinceFor(dreamId = '') {
    const api = window.SHEXDatingProfileData;
    if (api && typeof api.getTogetherSince === 'function') {
      return String(api.getTogetherSince(dreamId) || '').trim();
    }
    const dream = currentDatingDreamData(dreamId);
    return String(dream?.datingTogetherSince || '').trim();
  }

  async function saveDatingTogetherSince(dreamId = '', value = '', options = {}) {
    const api = window.SHEXDatingProfileData;
    if (!api || typeof api.setTogetherSince !== 'function') {
      showDatingToast('在一起时间保存功能暂时不可用');
      return false;
    }
    return api.setTogetherSince(dreamId, value, options);
  }

  function datingHomeAnniversaryFor(dreamId = '') {
    const items = datingAnniversariesFor(dreamId)
      .filter((item) => item && typeof item === 'object')
      .filter((item) => String(item.title || item.date || '').trim());
    if (!items.length) return null;
    const withDate = items
      .filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(String(item.date || '')))
      .sort((a, b) => Math.abs(Date.parse(`${a.date}T00:00:00`) - Date.now()) - Math.abs(Date.parse(`${b.date}T00:00:00`) - Date.now()));
    const item = withDate[0] || items[0];
    const title = String(item.title || item.type || '纪念日').trim();
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(item.date || '')) ? formatDatingDate(Date.parse(`${item.date}T00:00:00`)) : String(item.date || '').trim();
    return {
      title,
      date
    };
  }

  function localDatingCompletedCount(dreamId = '') {
    const dream = currentDatingDreamData(dreamId);
    const candidates = [
      dream?.datingHistory,
      dream?.datingRecords,
      dream?.datingSessions
    ];
    for (const list of candidates) {
      if (Array.isArray(list)) {
        return list.filter((item) => !item?.status || item.status === 'completed').length;
      }
    }
    return 0;
  }

  async function refreshDatingCompletedCount(content, dreamId = '') {
    const target = content?.querySelector('[data-dating-count]');
    if (!target) return;
    try {
      const current = currentDatingSession();
      const data = await callDatingAction({
        action: 'datingHistory',
        userId: current.userId,
        sessionToken: current.sessionToken,
        dreamId
      }, { timeoutMs: DATING_SUBMIT_TIMEOUT_MS });
      const records = Array.isArray(data.records) ? data.records : [];
      if (target.isConnected) target.textContent = `${records.length} 次`;
    } catch (error) {
      console.warn('[SHEX_DATING_HISTORY_COUNT_FAILED]', error);
    }
  }

  function zodiacFromDate(value = '') {
    const match = String(value || '').match(/^\d{4}-(\d{2})-(\d{2})$/);
    if (!match) return '';
    const month = Number(match[1]);
    const day = Number(match[2]);
    const edge = [20, 19, 21, 20, 21, 21, 23, 23, 23, 23, 22, 22];
    const names = ['水瓶座', '双鱼座', '白羊座', '金牛座', '双子座', '巨蟹座', '狮子座', '处女座', '天秤座', '天蝎座', '射手座', '摩羯座'];
    return day < edge[month - 1] ? names[(month + 10) % 12] : names[(month + 11) % 12];
  }

  function render(dreamId) {
    const panel = document.querySelector('#xDatingPanel');
    const content = panel?.querySelector('[data-dating-page-content]');
    if (!panel || !content) return;
    bindBackButton(panel);
    setDatingBack('world', dreamId);

    datingFlowState = null;
    const state = readXState();
    const dream = currentDatingDream(state, dreamId);
    const dreamCall = String(dream?.userRelationProfile?.userCall || dream?.userCall || dream?.userNickname || '').trim();
    const globalCall = String(state?.userName || '').trim();
    const userName = (dreamCall && dreamCall !== '你') ? dreamCall : (globalCall || dreamCall || '你');
    const dreamName = String(dream?.characterProfile?.basic?.displayName || dream?.name || dream?.nickname || 'TA').trim() || 'TA';
    const togetherDays = daysTogetherNumber(dream);
    const inviteState = readDatingInviteState();
    const hasInvite = Boolean(inviteState.triggered && !inviteState.handled);
    const inviteTitle = hasInvite ? `${dreamName}向你发起了约会` : `邀请${dreamName}赴约`;
    const inviteDescription = hasInvite ? 'TA正在等待你的回应' : '这一次由你来发起邀请';
    const anniversary = datingHomeAnniversaryFor(String(dream?.id || dreamId || ''));
    const anniversaryMarkup = anniversary
      ? `<div><span>纪念日 · ${escapeHtml(anniversary.title)}</span><strong>${escapeHtml(anniversary.date || '已记录')}</strong></div>`
      : '';
    const localCount = localDatingCompletedCount(String(dream?.id || dreamId || ''));
    const inviteActions = hasInvite
      ? `
            <button class="is-primary" type="button" data-dating-accept>接受邀请</button>
            <button type="button" data-dating-decline>暂时拒绝</button>
        `
      : `
            <button class="is-primary" type="button" data-dating-start>发起邀请</button>
        `;
    content.innerHTML = `
      <main class="shex-dating-home" data-dating-home>
        <header class="shex-dating-header">
          <p class="shex-dating-kicker">Dating Space</p>
          <h1>X约会</h1>
          <p>把每一次靠近，都好好收藏。</p>
        </header>

        <section class="shex-dating-home-main">
          ${homeIllustrationPairMarkup(dreamName, userName, String(dream?.id || dreamId || ''))}
          <div class="shex-dating-stats-card" aria-label="约会统计">
            ${Number.isFinite(togetherDays) ? `<div><span>在一起</span><strong>${escapeHtml(togetherDays)} 天</strong></div>` : ''}
            ${anniversaryMarkup}
            <div><span>约会次数</span><strong data-dating-count>${escapeHtml(localCount)} 次</strong></div>
          </div>
        </section>

        <section class="shex-dating-home-main">
          <div class="shex-dating-invite" data-dating-invite-card aria-live="polite">
            <svg class="shex-dating-invite-watermark" width="140" height="140" viewBox="0 0 24 24" fill="var(--dating-rose)" aria-hidden="true"><path d="M12 21s-7.5-4.6-10-9.5C.5 7 3 3 7 3c2 0 3.6 1 5 2.8C13.4 4 15 3 17 3c4 0 6.5 4 5 8.5C19.5 16.4 12 21 12 21z"/></svg>
            <button class="shex-dating-invite-info" type="button" data-dating-plan-info aria-label="查看约会使用说明" aria-expanded="false" aria-controls="shexDatingPlanInfo">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.8 9a2.35 2.35 0 1 1 3.1 2.23c-.58.24-.9.72-.9 1.27v.5"/><path d="M12 17h.01"/></svg>
            </button>
            <div class="shex-dating-invite-info-popover" id="shexDatingPlanInfo" data-dating-plan-info-popover role="note" hidden>
              <p>不限每日约会次数，按每次实际使用消耗 X能量</p>
              <p>${datingCostLabel()}</p>
            </div>
            <span class="shex-dating-invite-icon" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="var(--dating-rose-deep)"><path d="M12 21s-7.5-4.6-10-9.5C.5 7 3 3 7 3c2 0 3.6 1 5 2.8C13.4 4 15 3 17 3c4 0 6.5 4 5 8.5C19.5 16.4 12 21 12 21z"/></svg>
            </span>
            <div class="shex-dating-invite-copy">
              <p>约会邀请</p>
              <h2 data-dating-invite-title>${escapeHtml(inviteTitle)}</h2>
              <span data-dating-invite-description>${escapeHtml(inviteDescription)}</span>
            </div>
            <div class="shex-dating-invite-actions" data-dating-invite-actions>
              ${inviteActions}
            </div>
          </div>
        </section>

        <nav class="shex-dating-entries" aria-label="X约会功能入口">
          <button type="button" data-dating-section="book">
            <span aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
                <path d="M4 5.5c0-.8.7-1.5 1.5-1.5H12v16H5.5c-.8 0-1.5.7-1.5 1.5v-16Z"/>
                <path d="M20 5.5c0-.8-.7-1.5-1.5-1.5H12v16h6.5c.8 0 1.5.7 1.5 1.5v-16Z"/>
              </svg>
            </span>
            <strong>X约会簿</strong>
          </button>
          <button type="button" data-dating-section="anniversary">
            <span aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 3.5l2.1 4.4 4.9.6-3.6 3.4.9 4.9-4.3-2.3-4.3 2.3.9-4.9-3.6-3.4 4.9-.6z"/>
              </svg>
            </span>
            <strong>纪念日</strong>
          </button>
          <button type="button" data-dating-section="persona">
            <span aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="8.3" r="3.3"/>
                <path d="M5 20c0-3.6 3.1-6.3 7-6.3s7 2.7 7 6.3"/>
              </svg>
            </span>
            <strong>人设</strong>
          </button>
          <button type="button" data-dating-photo-mode="studio">
            <span aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M8 5 9.5 3h5L16 5h4v15H4V5Z"/><circle cx="12" cy="12.5" r="4"/></svg></span>
            <strong>双人合影</strong>
          </button>
        </nav>
      </main>
    `;
    resetDatingPanelScroll();
    refreshDatingBadge();

    hydrateDatingAvatars(content, String(dream?.id || dreamId || ''));
    bindHomeInteractions(content, String(dreamId || ''));
    refreshDatingCompletedCount(content, String(dream?.id || dreamId || ''));
  }

  function datingSubpageHeaderMarkup(title) {
    return `
      <div class="shex-dating-subhead">
        <h1>${escapeHtml(title)}</h1>
      </div>
    `;
  }

  // T5 boundary: T6/T7 consume open({ mode, dreamId, storyRecordId, record,
  // returnSource, container?, api, onBack, onOpenStory(recordId) }); no photo data fetch here.
  async function openDatingPhoto(mode, dreamId = '', options = {}) {
    const content = datingContent();
    const id = String(dreamId || datingFlowState?.dreamId || '');
    // Use the same relationship-name precedence as the dating home page.
    const photoState = readXState();
    const photoDream = currentDatingDream(photoState, id);
    const photoCall = String(photoDream?.userRelationProfile?.userCall || photoDream?.userCall || photoDream?.userNickname || '').trim();
    const photoGlobalCall = String(photoState?.userName || '').trim();
    const photoMeName = (photoCall && photoCall !== '你') ? photoCall : (photoGlobalCall || photoCall || '你');
    const photoTaName = String(photoDream?.characterProfile?.basic?.displayName || photoDream?.name || photoDream?.nickname || 'TA').trim() || 'TA';
    const flow = datingFlowState?.dreamId === id ? datingFlowState : null;
    const article = Boolean(content?.querySelector('.shex-dating-article-screen'));
    const recordId = String(flow?.recordId || flow?.sessionId || '');
    const record = flow ? {
      ...flow.result,
      dreamId: id,
      recordId,
      sessionId: flow.sessionId || recordId,
      userChoices: flow.userChoices || datingChoicesFromAnswers(),
      aiChoices: flow.aiChoices || {}
    } : null;
    const onBack = () => {
      datingPhotoBack = null;
      if (options.onBack) return options.onBack();
      if (flow) {
        datingFlowState = flow;
        if (article) renderFinalArticle();
        else renderFinalSummary();
      } else render(id);
    };
    if (typeof window.SHEXDatingPhoto?.open !== 'function') {
      showDatingToast('即将开放');
      return;
    }
    if (!options.container) {
      setDatingBack('photo', id);
      datingPhotoBack = onBack;
    }
    try {
      await window.SHEXDatingPhoto?.open({
        mode,
        meName: photoMeName,
        taName: photoTaName,
        dreamId: id,
        storyRecordId: recordId || null,
        record,
        returnSource: options.returnSource || flow?.returnSource || 'home',
        container: options.container,
        api: {
          async call(data = {}) {
            const current = currentDatingSession();
            return callDatingAction({ ...data, userId: current.userId, sessionToken: current.sessionToken });
          },
          getUserId() {
            try { return String(window.SHEXAuth?.current?.()?.userId || '').trim(); }
            catch (_) { return ''; }
          }
        },
        onBack,
        onOpenStory: (storyId) => openDatingHistoryStory(id, storyId, 'photos')
      });
    } catch (_) {
      // Do not replace a view the user navigated to while the loader was pending.
      if (options.container ? options.container.isConnected : datingPhotoBack === onBack) {
        if (!options.container) onBack();
        showDatingToast('即将开放');
      }
    }
  }

  function bindDatingPhotoButtons(content, dreamId) {
    content.querySelectorAll('[data-dating-photo-mode]').forEach((button) => {
      button.addEventListener('click', async () => {
        if (button.disabled) return;
        button.disabled = true;
        try {
          await openDatingPhoto(button.dataset.datingPhotoMode, dreamId);
        } finally {
          button.disabled = false;
        }
      });
    });
  }

  async function openDatingHistoryStory(dreamId, recordId, returnSource = 'stories') {
    const content = datingContent();
    const sourceView = content?.firstElementChild;
    const id = String(recordId || '').trim();
    if (!content || !id) return false;
    try {
      const current = currentDatingSession();
      const detail = await callDatingAction({
        action: 'datingHistoryDetail',
        userId: current.userId,
        sessionToken: current.sessionToken,
        dreamId,
        recordId: id
      });
      if (content.firstElementChild !== sourceView || !isDatingViewActive()) return false;
      datingFlowState = datingHistoryResultToFlow({ ...detail.record, recordId: detail.record?.recordId || id }, dreamId, returnSource);
      renderFinalSummary();
      return true;
    } catch (error) {
      if (content.firstElementChild === sourceView) showDatingToast(datingErrorText(error, '约会记录暂时打不开，请稍后重试'));
      return false;
    }
  }

  async function renderDatingBook(dreamId, activeTab = 'stories') {
    const content = datingContent();
    if (!content) return;
    const id = String(dreamId || '');
    const tab = activeTab === 'photos' ? 'photos' : 'stories';
    datingFlowState = null;
    setDatingBack('home', id);
    content.innerHTML = `
      <main class="shex-dating-flow shex-dating-subpage shex-dating-book-page">
        ${datingSubpageHeaderMarkup('X约会簿')}
        <nav class="shex-dating-book-tabs" aria-label="约会簿分类">
          <button type="button" data-dating-book-tab="stories" aria-pressed="${tab === 'stories'}">约会故事</button>
          <button type="button" data-dating-book-tab="photos" aria-pressed="${tab === 'photos'}">约会照片</button>
        </nav>
        <p class="shex-dating-subnote">${tab === 'photos' ? '收藏你们的合影与纪念组件' : '你们每一次约会生成的故事，都会留在这里'}</p>
        <div class="shex-dating-record-list" data-dating-history-list>
          <div class="shex-dating-empty-card">${tab === 'photos' ? '即将开放' : '正在读取约会历史...'}</div>
        </div>
      </main>
    `;
    resetDatingPanelScroll();
    const list = content.querySelector('[data-dating-history-list]');
    content.querySelectorAll('[data-dating-book-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        if (button.dataset.datingBookTab !== tab) renderDatingBook(id, button.dataset.datingBookTab);
      });
    });
    if (tab === 'photos') {
      await openDatingPhoto('book', id, { container: list, returnSource: 'photos', onBack: () => render(id) });
      return;
    }
    try {
      const current = currentDatingSession();
      const data = await callDatingAction({
        action: 'datingHistory',
        userId: current.userId,
        sessionToken: current.sessionToken,
        dreamId: id
      });
      if (!list?.isConnected) return;
      const records = Array.isArray(data.records) ? data.records : [];
      if (!records.length) {
        if (list) list.innerHTML = '<div class="shex-dating-empty-card">还没有完成过约会。等你们赴约之后，故事会自动留在这里。</div>';
        return;
      }
      if (list) {
        list.innerHTML = records.map((record, index) => `
          <button class="shex-dating-record${index === 0 ? ' is-latest' : ''}" type="button" data-dating-history-record="${escapeHtml(record.recordId || record.sessionId || '')}">
            <span><strong>${index === 0 ? '最新' : escapeHtml(formatDatingDate(record.completedAt))}</strong><small>匹配${escapeHtml(record.matchPercent || 0)}%</small></span>
            <span><b>${escapeHtml(record.resultTitle || '未命名约会')}</b><em>${escapeHtml(record.summary || '点开看看这次约会的完整故事。')}</em></span>
          </button>
        `).join('');
      }
      list?.querySelectorAll('[data-dating-history-record]').forEach((button) => {
        button.addEventListener('click', async () => {
          const recordId = button.dataset.datingHistoryRecord || '';
          if (!recordId) return;
          button.disabled = true;
          const toast = showDatingToast('正在打开这次约会...', { persist: true });
          try {
            await openDatingHistoryStory(id, recordId, 'stories');
          } catch (error) {
            showDatingToast(datingErrorText(error, '约会记录暂时打不开，请稍后重试'));
          } finally {
            removeDatingToast(toast);
            button.disabled = false;
          }
        });
      });
    } catch (error) {
      if (list) list.innerHTML = `<div class="shex-dating-empty-card">${escapeHtml(datingErrorText(error, '约会历史暂时无法读取'))}</div>`;
    }
  }

  function datingProfileConflictState(dreamId, groupName) {
    const state = window.SHEXCharacterProfileData?.getGroupState?.(dreamId, groupName) || null;
    const conflicts = window.SHEXCharacterProfileData?.listConflicts?.(dreamId) || [];
    return {
      hasConflict: Boolean(state?.hasConflict),
      count: Array.isArray(conflicts)
        ? conflicts.filter((item) => item?.group === groupName && item?.resolved !== true).length
        : 0
    };
  }

  function datingProfileConflictBanner(label, conflictState) {
    if (!conflictState?.hasConflict) return '';
    const countText = conflictState.count > 1 ? `（共${conflictState.count}处）` : '';
    return `
      <section class="shex-dating-info-card shex-dating-profile-conflict" role="alert" data-dating-profile-conflict>
        <h2>检测到两台设备同时修改${countText}</h2>
        <p class="shex-dating-info-help">这份${escapeHtml(label)}的两个版本都已安全保留。当前页面暂时显示其中一份；为了避免覆盖另一份，解决冲突前不能编辑或保存。请到独立角色资料页选择要保留的版本。</p>
      </section>
    `;
  }

  function lockDatingProfileConflictEditor(content, selector) {
    content?.querySelectorAll?.(selector)?.forEach((control) => {
      control.disabled = true;
      control.setAttribute('aria-disabled', 'true');
      control.setAttribute('title', '请先解决两台设备的资料冲突');
    });
  }

  function renderDatingPersonaSummary(dreamId) {
    const content = datingContent();
    if (!content) return;
    const id = String(dreamId || '');
    setDatingBack('home', id);
    stopDatingAudio();
    const dream = currentDatingDreamData(id) || {};
    const persona = window.SHEXDatingProfileData?.getPersona?.(id) || {};
    const userProfile = window.SHEXDatingProfileData?.getUserProfile?.(id) || {};
    const personaFields = ['mbti', 'zodiac', 'personality', 'speechStyle', 'background', 'relationship', 'preferences', 'boundaries', 'exampleDialogue', 'freeform'];
    const personaFilled = personaFields.filter((key) => {
      const value = persona[key];
      return Array.isArray(value) ? value.length > 0 : Boolean(String(value || '').trim());
    }).length + (Array.isArray(persona.tags) && persona.tags.length ? 1 : 0);
    const userFields = ['mbti', 'zodiac', 'aboutMe'];
    const userFilled = userFields.filter((key) => Boolean(String(userProfile[key] || '').trim())).length
      + ((Array.isArray(userProfile.personalityTags) && userProfile.personalityTags.length)
        || String(userProfile.personalityCustom || '').trim() ? 1 : 0)
      + (String(userProfile.career || '').trim() || String(userProfile.careerCustom || '').trim() ? 1 : 0)
      + ((Array.isArray(userProfile.hobbies) && userProfile.hobbies.length)
        || String(userProfile.hobbiesCustom || '').trim() ? 1 : 0);
    const conflicts = window.SHEXCharacterProfileData?.listConflicts?.(id) || [];
    content.innerHTML = `
      <main class="shex-dating-flow shex-dating-subpage shex-dating-persona-summary-page">
        ${datingSubpageHeaderMarkup('角色资料')}
        <section class="shex-dating-info-card">
          <h2>角色资料已经独立</h2>
          <p class="shex-dating-info-help">固定人设、关系与开场、我的资料现在由同一个独立页面统一管理。X世界和X约会打开的是同一份资料，所有AI都从那里读取。</p>
        </section>
        ${conflicts.length ? `
          <section class="shex-dating-info-card shex-dating-profile-conflict" role="alert">
            <h2>有 ${conflicts.length} 处资料冲突待处理</h2>
            <p class="shex-dating-info-help">两个设备的版本都已保留，请进入角色资料页选择要留下的一份。</p>
          </section>
        ` : ''}
        <section class="shex-dating-info-card">
          <h2>${escapeHtml(String(dream.name || '梦角'))}的资料概览</h2>
          <div><span>TA的资料</span><strong>已填写 ${personaFilled} 项</strong></div>
          <div><span>我的资料</span><strong>已填写 ${userFilled} 项</strong></div>
          <div><span>纪念日</span><strong>${Array.isArray(dream.datingAnniversaries) ? dream.datingAnniversaries.length : 0} 条</strong></div>
        </section>
        <button class="shex-dating-primary-cta shex-dating-wide-cta" type="button" data-dating-open-character-profile>打开角色资料</button>
      </main>
    `;
    resetDatingPanelScroll();
    content.querySelector('[data-dating-open-character-profile]')?.addEventListener('click', () => {
      window.SHEXOpenCharacterProfile?.({ dreamId: id, tab: 'ta', backTarget: 'dating' });
    });
  }


  function renderDatingAnniversaries(dreamId) {
    const content = datingContent();
    if (!content) return;
    const id = String(dreamId || '');
    setDatingBack('home', id);
    const anniversaries = datingAnniversariesFor(id);
    const togetherSince = datingTogetherSinceFor(id);
    const relationshipBaseRevision = Number(window.SHEXCharacterProfileData?.getGroupState?.(id, 'datingRelationship')?.revision || 0);
    const relationshipConflict = datingProfileConflictState(id, 'datingRelationship');
    const togetherDays = daysTogetherFromDate(togetherSince);
    const userItems = anniversaries.map((item) => `
      <article class="is-user-added" data-dating-anniversary-id="${escapeHtml(item.id || '')}">
        <i>${escapeHtml(item.icon || anniversaryTypeIcon(item.type) || '✦')}</i>
        <div>
          <strong>${escapeHtml(item.title || item.name || '纪念日')}</strong>
          <span>${escapeHtml(item.date || item.type || '刚刚添加')}</span>
          ${item.note ? `<em>${escapeHtml(item.note)}</em>` : ''}
        </div>
        <button class="shex-dating-anniversary-delete" type="button" data-dating-delete-anniversary="${escapeHtml(item.id || '')}" aria-label="删除纪念日">删除</button>
      </article>
    `).join('');
    content.innerHTML = `
      <main class="shex-dating-flow shex-dating-subpage shex-dating-anniversary-page">
        ${datingSubpageHeaderMarkup('纪念日')}
        ${datingProfileConflictBanner('关系与纪念日资料', relationshipConflict)}
        <div class="shex-dating-anniversary-tip">
          <span>记下我们的每一次</span>
        </div>
        <section class="shex-dating-together-card">
          <div class="shex-dating-together-head">
            <i aria-hidden="true">♡</i>
            <div>
              <strong>在一起的时间</strong>
              <span>设置后首页会自动换算“在一起多少天”，这一项不会被删除。</span>
            </div>
          </div>
          <label class="shex-dating-together-date">
            <span>开始日期</span>
            <input type="date" value="${escapeHtml(togetherSince)}" data-dating-together-since>
          </label>
          <p>${togetherSince ? `已经在一起 ${escapeHtml(togetherDays)} 天` : '选择开始日期后，会自动显示在一起多少天'}</p>
          <button type="button" data-dating-save-together-since>保存在一起时间</button>
        </section>
        <div class="shex-dating-anniversary-list">
          ${userItems}
          ${userItems ? '' : '<div class="shex-dating-empty-card">还没有添加纪念日。先记下一个只属于这个梦角的小日子吧。</div>'}
        </div>
        <button class="shex-dating-add-anniversary" type="button">+ 添加纪念日</button>
      </main>
    `;
    resetDatingPanelScroll();
    if (relationshipConflict.hasConflict) {
      lockDatingProfileConflictEditor(content, '[data-dating-together-since], [data-dating-save-together-since], [data-dating-delete-anniversary], .shex-dating-add-anniversary');
    }
    content.querySelector('[data-dating-save-together-since]')?.addEventListener('click', async () => {
      const input = content.querySelector('[data-dating-together-since]');
      const value = String(input?.value || '').trim();
      if (!value) {
        showDatingToast('请先选择在一起的开始日期');
        return;
      }
      const button = content.querySelector('[data-dating-save-together-since]');
      if (button) button.disabled = true;
      try {
        const ok = await saveDatingTogetherSince(id, value, { baseRevision: relationshipBaseRevision });
        if (ok) {
          showDatingToast('在一起时间已保存');
          renderDatingAnniversaries(id);
        }
      } catch (error) {
        showDatingToast(error?.message || '在一起时间没有保存成功，请稍后重试');
        if (button) button.disabled = false;
      }
    });
    content.querySelectorAll('[data-dating-delete-anniversary]').forEach((button) => {
      button.addEventListener('click', async () => {
        const targetId = button.dataset.datingDeleteAnniversary || '';
        if (!targetId) return;
        button.disabled = true;
        const next = datingAnniversariesFor(id).filter((item) => String(item.id || '') !== targetId);
        try {
          const ok = await saveDatingAnniversaries(id, next, { baseRevision: relationshipBaseRevision });
          if (ok) {
            showDatingToast('纪念日已删除');
            renderDatingAnniversaries(id);
          }
        } catch (error) {
          showDatingToast(error?.message || '纪念日没有删除成功，请稍后重试');
          button.disabled = false;
        }
      });
    });
    content.querySelector('.shex-dating-add-anniversary')?.addEventListener('click', () => {
      renderDatingAddAnniversary(id);
    });
  }

  function anniversaryTypeIcon(type) {
    if (type === '生日') return '🎂';
    if (type === '相识') return '❤️';
    if (type === '特别') return '✦';
    return '📝';
  }

  function renderDatingAddAnniversary(dreamId) {
    const content = datingContent();
    if (!content) return;
    const id = String(dreamId || '');
    const relationshipBaseRevision = Number(window.SHEXCharacterProfileData?.getGroupState?.(id, 'datingRelationship')?.revision || 0);
    const relationshipConflict = datingProfileConflictState(id, 'datingRelationship');
    setDatingBack('anniversaries', id);
    content.innerHTML = `
      <main class="shex-dating-flow shex-dating-subpage shex-dating-add-anniversary-page">
        ${datingSubpageHeaderMarkup('添加纪念日')}
        ${datingProfileConflictBanner('关系与纪念日资料', relationshipConflict)}
        <div class="shex-dating-form-stack">
          <label class="shex-dating-form-field">
            <span>纪念日名称</span>
            <input type="text" data-dating-anniversary-name>
          </label>
          <label class="shex-dating-form-field">
            <span>日期</span>
            <input type="date" data-dating-anniversary-date>
          </label>
          <div class="shex-dating-form-field">
            <span>类型</span>
            <div class="shex-dating-type-tags" data-dating-anniversary-types>
              <button class="is-active" type="button" data-anniversary-type="生日">生日</button>
              <button type="button" data-anniversary-type="相识">相识/相恋</button>
              <button type="button" data-anniversary-type="特别">特别的一天</button>
              <button type="button" data-anniversary-type="其他">其他</button>
            </div>
          </div>
          <label class="shex-dating-form-field">
            <span>备注（可选）</span>
            <textarea placeholder="写点想记住的小事" data-dating-anniversary-note></textarea>
          </label>
        </div>
        <button class="shex-dating-primary-cta shex-dating-wide-cta" type="button" data-dating-save-anniversary>保存纪念日</button>
      </main>
    `;
    resetDatingPanelScroll();
    if (relationshipConflict.hasConflict) {
      lockDatingProfileConflictEditor(content, '[data-dating-anniversary-name], [data-dating-anniversary-date], [data-anniversary-type], [data-dating-anniversary-note], [data-dating-save-anniversary]');
    }

    content.querySelectorAll('[data-anniversary-type]').forEach((button) => {
      button.addEventListener('click', () => {
        content.querySelectorAll('[data-anniversary-type]').forEach((item) => item.classList.toggle('is-active', item === button));
      });
    });
    content.querySelector('[data-dating-save-anniversary]')?.addEventListener('click', () => {
      const name = String(content.querySelector('[data-dating-anniversary-name]')?.value || '').trim() || '新的纪念日';
      const date = String(content.querySelector('[data-dating-anniversary-date]')?.value || '').trim();
      const note = String(content.querySelector('[data-dating-anniversary-note]')?.value || '').trim();
      const type = String(content.querySelector('[data-anniversary-type].is-active')?.dataset.anniversaryType || '生日');
      const item = {
        id: `dating-anniversary-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        title: name,
        date: date || type,
        note,
        type,
        icon: anniversaryTypeIcon(type),
        remindByInvite: true,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      const saveButton = content.querySelector('[data-dating-save-anniversary]');
      if (saveButton) saveButton.disabled = true;
      saveDatingAnniversaries(id, [item].concat(datingAnniversariesFor(id)), { baseRevision: relationshipBaseRevision })
        .then((ok) => {
          if (ok) renderDatingAnniversaries(id);
        })
        .catch((error) => {
          showDatingToast(error?.message || '纪念日没有保存成功，请稍后重试');
          if (saveButton) saveButton.disabled = false;
        });
    });
  }

  function openStepFlow(dreamId) {
    datingFlowState = {
      dreamId: String(dreamId || ''),
      recordId: '',
      returnSource: 'home',
      stepIndex: 0,
      answers: ['', String(datingOpenSource?.prefill?.place || ''), String(datingOpenSource?.prefill?.activity || ''), ''],
      narrationStyle: 'ta_letter'
    };
    setDatingBack('step', dreamId);
    renderStep();
  }

  function renderStep() {
    const content = datingContent();
    if (!content || !datingFlowState) return;
    setDatingBack('step', datingFlowState.dreamId);

    const step = DATING_STEP_DEFS[datingFlowState.stepIndex] || DATING_STEP_DEFS[0];
    const currentValue = datingFlowState.answers[datingFlowState.stepIndex] || '';
    const isLast = datingFlowState.stepIndex === DATING_STEP_DEFS.length - 1;
    const questionMarkup = escapeHtml((step.questionLines || []).join(''));
    content.innerHTML = `
      <main class="shex-dating-flow shex-dating-step-screen" data-dating-step-screen>
        ${miniAvatarPairMarkup()}
        <p class="shex-dating-step-sync"><i aria-hidden="true"></i>梦角也在同步准备答案</p>
        <section class="shex-dating-step-card">
          ${stepIconMarkup(step.icon)}
          <p class="shex-dating-step-label">${escapeHtml(step.label)}</p>
          <h1 class="shex-dating-step-q">${questionMarkup}</h1>
          <label class="shex-dating-step-box">
            <span>写下你的想法</span>
            <textarea data-dating-step-input rows="5" placeholder="${escapeHtml(step.placeholder)}">${escapeHtml(currentValue)}</textarea>
          </label>
          <div class="shex-dating-suggest-row">
            <span>没想法？</span>
            ${step.suggestions.length ? `<button type="button" data-dating-suggest>${escapeHtml(step.suggestText || '看看建议')}</button>` : ''}
          </div>
        </section>
        <div class="shex-dating-flow-actions">
          ${datingFlowState.stepIndex > 0 ? '<button class="shex-dating-ghost-cta" type="button" data-dating-prev>上一步</button>' : '<button class="shex-dating-ghost-cta" type="button" data-dating-home>先不约了</button>'}
          <button class="shex-dating-primary-cta" type="button" data-dating-next>${isLast ? '确认' : '下一步'}</button>
        </div>
      </main>
    `;
    resetDatingPanelScroll();
    hydrateDatingAvatars(content, datingFlowState.dreamId);

    const input = content.querySelector('[data-dating-step-input]');
    input?.addEventListener('input', () => {
      datingFlowState.answers[datingFlowState.stepIndex] = input.value;
    });
    content.querySelector('[data-dating-suggest]')?.addEventListener('click', () => {
      openSuggestionSheet(step, (suggestion) => {
        if (input) {
          input.value = suggestion;
          datingFlowState.answers[datingFlowState.stepIndex] = suggestion;
          input.focus?.({ preventScroll: true });
        }
      });
    });
    content.querySelector('[data-dating-prev]')?.addEventListener('click', () => {
      datingFlowState.answers[datingFlowState.stepIndex] = input?.value || '';
      datingFlowState.stepIndex = Math.max(0, datingFlowState.stepIndex - 1);
      renderStep();
    });
    content.querySelector('[data-dating-home]')?.addEventListener('click', () => {
      const id = datingFlowState?.dreamId || '';
      datingFlowState = null;
      render(id);
    });
    content.querySelector('[data-dating-next]')?.addEventListener('click', () => {
      datingFlowState.answers[datingFlowState.stepIndex] = input?.value || '';
      if (isLast) {
        renderConfirm();
        return;
      }
      datingFlowState.stepIndex += 1;
      renderStep();
    });
    requestAnimationFrame(() => {
      input?.focus?.({ preventScroll: true });
      resetDatingPanelScroll();
    });
  }

  function renderConfirm() {
    const content = datingContent();
    if (!content || !datingFlowState) return;
    setDatingBack('confirm', datingFlowState.dreamId);

    const rows = DATING_STEP_DEFS.map((step, index) => `
      <article class="shex-dating-confirm-row">
        <span>${escapeHtml(step.label)}</span>
        <p>${escapeHtml(answerText(index))}</p>
      </article>
    `).join('');
    const currentNarration = datingFlowState.narrationStyle || 'ta_letter';
    const narrationButtons = DATING_NARRATION_STYLES.map((item) => `
      <button class="${item.value === currentNarration ? 'is-active' : ''}" type="button" data-dating-narration="${escapeHtml(item.value)}">${escapeHtml(item.label)}</button>
    `).join('');

    content.innerHTML = `
      <main class="shex-dating-flow shex-dating-confirm-screen">
        ${miniAvatarPairMarkup()}
        <h1 class="shex-dating-step-q">这次约会，先按这样的心意来</h1>
        <section class="shex-dating-step-box shex-dating-confirm-list">
          ${rows}
        </section>
        <section class="shex-dating-narration-picker" aria-label="这次故事想让谁来写">
          <p>这次故事想让谁来写</p>
          <div>${narrationButtons}</div>
        </section>
        <div class="shex-dating-flow-actions">
          <button class="shex-dating-ghost-cta" type="button" data-dating-edit>返回修改</button>
          <button class="shex-dating-primary-cta" type="button" data-dating-confirm-selection>确认我的选择</button>
        </div>
      </main>
    `;
    resetDatingPanelScroll();
    hydrateDatingAvatars(content, datingFlowState.dreamId);

    content.querySelector('[data-dating-edit]')?.addEventListener('click', () => {
      datingFlowState.stepIndex = DATING_STEP_DEFS.length - 1;
      renderStep();
    });
    content.querySelectorAll('[data-dating-narration]').forEach((button) => {
      button.addEventListener('click', () => {
        datingFlowState.narrationStyle = button.dataset.datingNarration || 'ta_letter';
        content.querySelectorAll('[data-dating-narration]').forEach((item) => item.classList.toggle('is-active', item === button));
      });
    });
    content.querySelector('[data-dating-confirm-selection]')?.addEventListener('click', confirmSelection);
  }

  async function confirmSelection() {
    const content = datingContent();
    if (!content || !datingFlowState) return;
    if (datingFlowState.submitPending) return;
    const choicesPreview = datingChoicesFromAnswers();
    if (Object.values(choicesPreview).some((value) => !String(value || '').trim())) {
      showDatingToast('请先补全4项选择');
      return;
    }
    datingFlowState.submitPending = true;
    const button = content.querySelector('[data-dating-confirm-selection]');
    if (button) button.disabled = true;
    const toast = showDatingToast('梦角还在挑选中，请稍候…', { persist: true });
    try {
      const current = currentDatingSession();
      const dreamId = datingFlowState.dreamId || '';
      const choices = choicesPreview;
      datingFlowState.choicesRequestId = datingFlowState.choicesRequestId || datingRequestId('dating_choices', current.userId, dreamId);
      const data = await callDatingAction({
        action: 'datingSubmitChoices',
        userId: current.userId,
        sessionToken: current.sessionToken,
        dreamId,
        choices,
        requestId: datingFlowState.choicesRequestId
      }, { timeoutMs: DATING_SUBMIT_TIMEOUT_MS });
      datingFlowState.sessionId = data.sessionId || '';
      datingFlowState.recordId = String(data.recordId || data.sessionId || '');
      datingFlowState.aiChoices = data.aiChoices || {};
      datingFlowState.userChoices = data.userChoices || choices;
      datingFlowState.answers = choicesToAnswers(datingFlowState.userChoices);
      renderReveal();
    } catch (error) {
      showDatingToast(datingErrorText(error, '梦角选择生成失败，请稍后重试'));
      if (error?.code === 'PLAN_REQUIRED') window.SHEXAuth?.openPlan?.();
    } finally {
      removeDatingToast(toast);
      if (datingFlowState) datingFlowState.submitPending = false;
      if (button) button.disabled = false;
    }
  }

  function renderReveal() {
    const content = datingContent();
    if (!content || !datingFlowState) return;
    setDatingBack('reveal', datingFlowState.dreamId);

    const aiAnswers = choicesToAnswers(datingFlowState.aiChoices || {});
    const taRows = DATING_STEP_DEFS.map((step, index) => `
      <article>
        <span>${escapeHtml(step.label)}</span>
        <p>${escapeHtml(aiAnswers[index] || DATING_TA_ANSWERS[index] || '梦角还没写好')}</p>
      </article>
    `).join('');
    const userRows = DATING_STEP_DEFS.map((step, index) => `
      <article>
        <span>${escapeHtml(step.label)}</span>
        <p>${escapeHtml(answerText(index))}</p>
      </article>
    `).join('');

    content.innerHTML = `
      <main class="shex-dating-flow shex-dating-reveal-screen">
        ${miniAvatarPairMarkup()}
        <p class="shex-dating-progress">选择揭晓</p>
        <h1 class="shex-dating-step-q">你们各自选了这些</h1>
        <section class="shex-dating-compare-cols">
          <div class="shex-dating-compare-card is-ta">
            <h2>TA的选择</h2>
            ${taRows}
            ${revealCardDecorMarkup(false)}
          </div>
          ${revealDividerMarkup()}
          <div class="shex-dating-compare-card is-you">
            <h2>你的选择</h2>
            ${userRows}
            ${revealCardDecorMarkup(true)}
          </div>
        </section>
        <p class="shex-dating-energy-notice">${datingCostLabel()}</p>
        <button class="shex-dating-primary-cta shex-dating-wide-cta" type="button" data-dating-reveal-final>去赴约</button>
      </main>
    `;
    resetDatingPanelScroll();
    hydrateDatingAvatars(content, datingFlowState.dreamId);

    content.querySelector('[data-dating-reveal-final]')?.addEventListener('click', revealFinal);
  }

  async function revealFinal() {
    const content = datingContent();
    if (!content || !datingFlowState) return;
    if (datingFlowState.resultPending) return;
    datingFlowState.resultPending = true;
    const overlay = document.createElement('div');
    overlay.className = 'shex-dating-transition-overlay';
    let loadingIndex = 0;
    overlay.innerHTML = `
      <div class="shex-dating-transition-content">
        <span class="shex-dating-transition-heart" aria-hidden="true">${stepIconMarkup('heart')}</span>
        <p data-dating-loading-text>${escapeHtml(DATING_LOADING_TEXTS[0])}</p>
      </div>
    `;
    content.appendChild(overlay);
    const textNode = overlay.querySelector('[data-dating-loading-text]');
    const loadingTimer = window.setInterval(() => {
      loadingIndex = (loadingIndex + 1) % DATING_LOADING_TEXTS.length;
      if (!textNode) return;
      textNode.classList.remove('is-showing');
      window.setTimeout(() => {
        if (!textNode.isConnected) return;
        textNode.textContent = DATING_LOADING_TEXTS[loadingIndex];
        textNode.classList.add('is-showing');
      }, 180);
    }, 3600);
    window.setTimeout(() => textNode?.classList.add('is-showing'), 30);
    try {
      const current = currentDatingSession();
      const dreamId = datingFlowState.dreamId || '';
      datingFlowState.resultRequestId = datingFlowState.resultRequestId || datingRequestId('dating_result', current.userId, dreamId);
      const data = await callDatingAction({
        action: 'datingGenerateResult',
        userId: current.userId,
        sessionToken: current.sessionToken,
        dreamId,
        sessionId: datingFlowState.sessionId,
        requestId: datingFlowState.resultRequestId,
        narrationStyle: datingFlowState.narrationStyle || 'ta_letter'
      }, { timeoutMs: DATING_RESULT_TIMEOUT_MS });
      datingFlowState.recordId = String(data.recordId || data.sessionId || datingFlowState.recordId || datingFlowState.sessionId || '');
      datingFlowState.result = {
        resultTitle: data.resultTitle,
        matchPercent: data.matchPercent,
        chemistryTags: data.chemistryTags || [],
        individualNotes: data.individualNotes || [],
        timeline: data.timeline || [],
        suggestedItems: data.suggestedItems || [],
        giftSuggestion: data.giftSuggestion || {},
        fullStory: data.fullStory || '',
        consumedEnergy: data.consumedEnergy,
        narrationStyle: data.narrationStyle || datingFlowState.narrationStyle || 'ta_letter',
        completedAt: data.completedAt || 0
      };
      window.clearInterval(loadingTimer);
      renderFinalSummary();
    } catch (error) {
      window.clearInterval(loadingTimer);
      overlay.remove();
      showDatingToast(datingErrorText(error, '约会结果生成失败，请稍后重试'));
      if (error?.code === 'PLAN_REQUIRED') window.SHEXAuth?.openPlan?.();
      if (error?.code === 'ENERGY_NOT_ENOUGH') window.SHEXAuth?.showEnergyNotEnough?.();
    } finally {
      if (datingFlowState) datingFlowState.resultPending = false;
    }
  }

  function renderFinalSummary() {
    const content = datingContent();
    if (!content || !datingFlowState) return;
    setDatingBack(datingFlowState.returnSource || 'home', datingFlowState.dreamId);
    const result = datingFlowState.result || {};
    const title = String(result.resultTitle || '这次约会已经准备好了');
    const matchPercent = Number(result.matchPercent || 78);
    const chemistryTags = Array.isArray(result.chemistryTags) && result.chemistryTags.length
      ? result.chemistryTags
      : ['安静一点', '靠近一点', '慢慢聊天'];
    const individualNotes = Array.isArray(result.individualNotes) && result.individualNotes.length
      ? result.individualNotes
      : ['梦角有自己的小期待', '你也把想法认真说出来了'];
    const timeline = Array.isArray(result.timeline) && result.timeline.length
      ? result.timeline
      : [
        { stage: '出发', text: '从熟悉的地方慢慢出发，先让心情放松下来。' },
        { stage: '停留', text: '找一个舒服的位置停一会儿，让两个人都有时间靠近。' },
        { stage: '靠近', text: '留一点安静的聊天时间，把想说的话慢慢说完。' },
        { stage: '结束', text: '把这次约会好好收起来，作为之后会想起的小纪念。' }
      ];
    const suggestedItems = Array.isArray(result.suggestedItems) && result.suggestedItems.length ? result.suggestedItems : ['手写纸条'];
    const gift = result.giftSuggestion || {};
    const iconTypes = ['car', 'mountain', 'heart', 'gift'];
    content.innerHTML = `
      <main class="shex-dating-flow shex-dating-final-screen">
        ${largeAvatarPairMatchMarkup()}
        <p class="shex-dating-progress">约会结果</p>
        <h1 class="shex-dating-result-title">${escapeHtml(title)}</h1>
        <section class="shex-dating-chemistry">
          <div>
            <span>默契瞬间</span>
            <p>
              ${chemistryTags.map((tag) => `<em>${escapeHtml(tag)}</em>`).join('')}
            </p>
          </div>
          <div class="shex-dating-mind-lines">
            ${individualNotes.map((note, index) => `<p><i class="${index === 0 ? 'is-dream' : 'is-user'}" aria-hidden="true"></i>${escapeHtml(note)}</p>`).join('')}
          </div>
        </section>
        <section class="shex-dating-step-box shex-dating-timeline">
          ${timeline.map((item, index) => `<article><div>${timelineIconMarkup(iconTypes[index] || 'heart')}</div><section><span>${escapeHtml(item.stage || '')}</span><p>${escapeHtml(item.text || '')}</p></section></article>`).join('')}
        </section>
        <section class="shex-dating-result-notes">
          <div><span>建议带上</span><p>${escapeHtml(suggestedItems.join(' / '))}</p></div>
          <div><span>梦角带来的礼物</span><p>${escapeHtml(gift.name || '一件小纪念')} —— ${escapeHtml(gift.note || '作为这次约会里真实发生的纪念')}</p></div>
        </section>
        <div class="shex-dating-flow-actions shex-dating-result-actions">
          <button class="shex-dating-primary-cta" type="button" data-dating-full-story>查看完整约会故事</button>
          <button class="shex-dating-ghost-cta" type="button" data-dating-photo-mode="auto">查看此次约会画面</button>
        </div>
      </main>
    `;
    resetDatingPanelScroll();
    hydrateDatingAvatars(content, datingFlowState.dreamId);

    animateDatingMatchRing(content, matchPercent);
    content.querySelector('[data-dating-full-story]')?.addEventListener('click', renderFinalArticle);
    bindDatingPhotoButtons(content, datingFlowState.dreamId);
  }

  function renderFinalArticle() {
    const content = datingContent();
    if (!content || !datingFlowState) return;
    const dreamId = datingFlowState.dreamId || '';
    setDatingBack(datingFlowState.returnSource || 'home', dreamId);
    const result = datingFlowState.result || {};
    const title = String(result.resultTitle || '这次约会已经准备好了');
    const story = String(result.fullStory || '').trim() || '这次约会已经生成好了，只是完整故事暂时没有返回。你们可以先把刚刚的选择和结果留住，等下一次再重新生成更完整的一版。';
    const paragraphs = story.split(/\n+/).map((line) => line.trim()).filter(Boolean);
    content.innerHTML = `
      <main class="shex-dating-flow shex-dating-article-screen">
        <p class="shex-dating-progress">完整故事</p>
        <article class="shex-dating-step-box shex-dating-article">
          <h1 class="shex-dating-result-title">${escapeHtml(title)}</h1>
          ${paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('')}
        </article>
        <section class="shex-dating-story-photos" data-dating-story-photos data-story-record-id="${escapeHtml(datingFlowState.recordId || datingFlowState.sessionId || '')}" aria-labelledby="shexDatingStoryPhotosTitle">
          <h2 id="shexDatingStoryPhotosTitle">本次照片</h2>
          <div class="shex-dating-photo-thumbs" data-dating-photo-thumbnails aria-live="polite"><p>关联照片与纪念组件即将开放</p></div>
          <button class="shex-dating-ghost-cta" type="button" data-dating-photo-mode="book">查看本次照片</button>
        </section>
        <button class="shex-dating-primary-cta shex-dating-wide-cta" type="button" data-dating-again>再约一次</button>
      </main>
    `;
    resetDatingPanelScroll();

    bindDatingPhotoButtons(content, dreamId);
    if (typeof window.SHEXDatingPhoto?.open === 'function') {
      void openDatingPhoto('book', dreamId, { container: content.querySelector('[data-dating-photo-thumbnails]') });
    }
    content.querySelector('[data-dating-again]')?.addEventListener('click', () => {
      datingFlowState = null;
      render(dreamId);
    });
  }

  window.SHEXDating = window.SHEXDating || {};
  window.SHEXDating.open = (dreamId, source = null) => {
    datingOpenSource = source?.source === 'chat' ? source : null;
    const id = String(dreamId || '');
    syncDatingViewport();
    const panel = document.querySelector('#xDatingPanel');
    bindBackButton(panel);
    ensureDatingAudioToggle(panel);
    setDatingBack('world', id);
    playDatingAudio('open');
    if (DATING_ACCESS_GATE_ENABLED && !hasDatingAccess()) {
      renderDatingGate(id);
      return;
    }
    render(id);
  };
  window.SHEXDating.openPersona = (dreamId, options = {}) => {
    const id = String(dreamId || '');
    stopDatingAudio();
    window.SHEXOpenCharacterProfile?.({
      dreamId: id,
      tab: options?.activeTab === 'user' ? 'me' : 'ta',
      backTarget: options?.backTarget === 'world' ? 'world' : 'dating'
    });
  };
  window.SHEXDating.openAnniversaries = (dreamId) => {
    const id = String(dreamId || '');
    syncDatingViewport();
    const panel = document.querySelector('#xDatingPanel');
    bindBackButton(panel);
    ensureDatingAudioToggle(panel);
    stopDatingAudio();
    renderDatingAnniversaries(id);
  };
  window.SHEXDating.hasPendingInvite = hasPendingDatingInvite;
  window.SHEXDating.stopAudio = stopDatingAudio;
  window.addEventListener('resize', syncDatingViewport, { passive: true });
  window.addEventListener('orientationchange', syncDatingViewport, { passive: true });
  window.visualViewport?.addEventListener('resize', syncDatingViewport, { passive: true });
  window.addEventListener('pageshow', syncDatingViewport, { passive: true });
  window.addEventListener('hashchange', () => {
    if (location.hash !== '#x-dating') stopDatingAudio();
  }, { passive: true });
  window.addEventListener('pagehide', stopDatingAudio, { passive: true });
  syncDatingViewport();
})();
