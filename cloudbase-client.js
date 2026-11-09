(function initSharedCloudBaseClient(global) {
  'use strict';

  const VERSION = 'cloudbase-client-v6';
  const config = () => global.SHEX_CLOUDBASE_CONFIG || {};
  let sdkReady = null;
  let identityReady = null;
  const PAGE_ID = `page-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const TAB_ID_KEY = 'shex_cloudbase_tab_id_v1';
  const AUTH_LOCK_KEY = 'shex_cloudbase_auth_lock_v1';
  // Keep the deployed v1 storage key so an in-flight phone flow from an older
  // page remains visible while the lock becomes provider-neutral.
  const VERIFIED_IDENTITY_LOCK_KEY = 'shex_cloudbase_phone_identity_lock_v1';
  const AUTH_LOCK_TTL_MS = 15000;
  const VERIFIED_IDENTITY_LOCK_TTL_MS = 15 * 60 * 1000;

  function codedError(code, message, cause) {
    const error = new Error(message);
    error.code = code;
    if (cause) {
      error.cause = cause;
      error.rawError = cause;
    }
    return error;
  }

  function storage(kind) {
    try { return kind === 'session' ? global.sessionStorage : global.localStorage; } catch (_) { return null; }
  }

  function randomId(prefix) {
    const value = global.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return `${prefix}-${value}`;
  }

  function tabId() {
    const target = storage('session');
    try {
      const current = String(target?.getItem(TAB_ID_KEY) || '').trim();
      if (current) return current;
      const next = randomId('tab');
      target?.setItem(TAB_ID_KEY, next);
      return next;
    } catch (_) {
      return PAGE_ID;
    }
  }

  function readRecord(key) {
    const target = storage('local');
    try {
      const parsed = JSON.parse(target?.getItem(key) || 'null');
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (_) { return null; }
  }

  function removeRecord(key, nonce = '') {
    const target = storage('local');
    try {
      const current = readRecord(key);
      if (!nonce || !current || current.nonce === nonce) target?.removeItem(key);
    } catch (_) { /* no-op */ }
  }

  function transitionError(kind, message) {
    return codedError(
      kind === 'phone' ? 'CLOUDBASE_PHONE_IDENTITY_TRANSITION' : 'CLOUDBASE_VERIFIED_IDENTITY_TRANSITION',
      message
    );
  }

  function activeVerifiedIdentityTransition() {
    if (global.SHEX_CLOUDBASE_CHALLENGE_CALLBACK_FRAME === true) return null;
    const current = readRecord(VERIFIED_IDENTITY_LOCK_KEY);
    if (!current) return null;
    current.kind = String(current.kind || 'phone').trim().toLowerCase() || 'phone';
    const expired = Number(current.expiresAt || 0) <= Date.now();
    const abandonedByRefresh = current.tabId === tabId() && current.pageId !== PAGE_ID;
    if (expired || abandonedByRefresh) {
      removeRecord(VERIFIED_IDENTITY_LOCK_KEY, current.nonce);
      return null;
    }
    return current;
  }

  function beginVerifiedIdentityTransition(kindInput) {
    if (/^(localhost|127\.0\.0\.1)$/i.test(global.location?.hostname || '') && new URLSearchParams(global.location?.search || '').get('candidateThemes') === '1') throw codedError('LOCAL_CANDIDATE_REVIEW', '本机候选验收不连接云端');
    assertNotChallengeCallbackFrame();
    const kind = String(kindInput || '').trim().toLowerCase();
    if (!['phone', 'email'].includes(kind)) throw codedError('CLOUDBASE_IDENTITY_KIND_INVALID', '可信身份类型无效');
    const current = activeVerifiedIdentityTransition();
    if (current && current.pageId !== PAGE_ID) {
      throw transitionError(current.kind, `另一个页面正在进行${current.kind === 'email' ? '邮箱' : '手机号'}安全验证，请先完成或关闭该页面`);
    }
    if (current && current.kind !== kind) throw transitionError(current.kind, '当前页面正在进行另一种身份验证，请先完成或取消');
    const record = current || {
      tabId: tabId(),
      pageId: PAGE_ID,
      nonce: randomId(kind),
      kind,
      startedAt: Date.now()
    };
    record.kind = kind;
    record.expiresAt = Date.now() + VERIFIED_IDENTITY_LOCK_TTL_MS;
    try { storage('local')?.setItem(VERIFIED_IDENTITY_LOCK_KEY, JSON.stringify(record)); } catch (_) { /* page-local fallback below */ }
    return Object.freeze({ nonce:record.nonce, pageId:PAGE_ID, kind });
  }

  function touchVerifiedIdentityTransition(token) {
    const current = activeVerifiedIdentityTransition();
    if (!current || current.pageId !== PAGE_ID || current.nonce !== token?.nonce || (token?.kind && current.kind !== token.kind)) return false;
    current.expiresAt = Date.now() + VERIFIED_IDENTITY_LOCK_TTL_MS;
    try { storage('local')?.setItem(VERIFIED_IDENTITY_LOCK_KEY, JSON.stringify(current)); } catch (_) { return false; }
    return true;
  }

  function endVerifiedIdentityTransition(token) {
    const current = readRecord(VERIFIED_IDENTITY_LOCK_KEY);
    if (!current || current.pageId !== PAGE_ID || (token?.nonce && token.nonce !== current.nonce)) return false;
    removeRecord(VERIFIED_IDENTITY_LOCK_KEY, current.nonce);
    return true;
  }

  const beginPhoneIdentityTransition = () => beginVerifiedIdentityTransition('phone');
  const touchPhoneIdentityTransition = (token) => touchVerifiedIdentityTransition(token);
  const endPhoneIdentityTransition = (token) => endVerifiedIdentityTransition(token);

  function loadSdk() {
    if (global.cloudbase) return Promise.resolve();
    if (sdkReady) return sdkReady;
    const src = String(config().sdkUrl || 'https://static.cloudbase.net/cloudbase-js-sdk/2.9.0/cloudbase.full.js').trim();
    sdkReady = new Promise((resolve, reject) => {
      if (!src) return reject(codedError('CLOUDBASE_SDK_LOAD_FAILED', '缺少 CloudBase SDK 地址'));
      if (global.cloudbase) return resolve();
      let existing = global.document?.querySelector?.(`script[src="${src}"]`);
      if (existing?.dataset?.shexSdkState === 'failed' || existing?.dataset?.shexSdkState === 'timed_out') {
        existing.remove?.();
        existing = null;
      }
      if (existing) {
        if (existing.dataset?.shexSdkState === 'loaded' && !global.cloudbase) {
          existing.remove?.();
          existing = null;
        } else {
          let settled = false;
          const finish = (error) => {
            if (settled) return;
            settled = true;
            global.clearTimeout?.(timer);
            existing.removeEventListener?.('load', onLoad);
            existing.removeEventListener?.('error', onError);
            if (error) reject(error); else resolve();
          };
          const onLoad = () => global.cloudbase
            ? finish()
            : finish(codedError('CLOUDBASE_SDK_LOAD_FAILED', 'CloudBase SDK 脚本已加载但未提供客户端'));
          const onError = (event) => {
            existing.dataset.shexSdkState = 'failed';
            existing.remove?.();
            finish(codedError('CLOUDBASE_SDK_LOAD_FAILED', 'CloudBase SDK 加载失败', event));
          };
          const timer = global.setTimeout?.(() => {
            existing.dataset.shexSdkState = 'timed_out';
            existing.remove?.();
            finish(codedError('CLOUDBASE_SDK_TIMEOUT', 'CloudBase SDK 加载超时'));
          }, Math.max(1000, Number(config().sdkLoadTimeoutMs || 10000)));
          existing.addEventListener('load', onLoad, { once:true });
          existing.addEventListener('error', onError, { once:true });
          return;
        }
      }
      const script = global.document?.createElement?.('script');
      if (!script) return reject(codedError('CLOUDBASE_SDK_LOAD_FAILED', 'CloudBase SDK 加载环境不可用'));
      script.src = src;
      script.async = true;
      script.dataset.shexSdkState = 'loading';
      let settled = false;
      const finish = (error) => {
        if (settled) return;
        settled = true;
        global.clearTimeout?.(timer);
        script.onload = null;
        script.onerror = null;
        if (error) reject(error); else resolve();
      };
      script.onload = () => {
        script.dataset.shexSdkState = 'loaded';
        if (!global.cloudbase) {
          script.remove?.();
          finish(codedError('CLOUDBASE_SDK_LOAD_FAILED', 'CloudBase SDK 脚本已加载但未提供客户端'));
          return;
        }
        finish();
      };
      script.onerror = (event) => {
        script.dataset.shexSdkState = 'failed';
        script.remove?.();
        finish(codedError('CLOUDBASE_SDK_LOAD_FAILED', 'CloudBase SDK 加载失败', event));
      };
      const timer = global.setTimeout?.(() => {
        script.dataset.shexSdkState = 'timed_out';
        script.remove?.();
        finish(codedError('CLOUDBASE_SDK_TIMEOUT', 'CloudBase SDK 加载超时'));
      }, Math.max(1000, Number(config().sdkLoadTimeoutMs || 10000)));
      global.document.head.appendChild(script);
    }).catch((error) => {
      sdkReady = null;
      throw error;
    });
    return sdkReady;
  }

  const IDENTITY_ANONYMOUS = 'anonymous';
  const IDENTITY_NON_ANONYMOUS = 'non-anonymous';
  const IDENTITY_UNKNOWN = 'unknown';

  function legacyIdentityEvidence(state) {
    const user = state?.user && typeof state.user === 'object' ? state.user : state || {};
    const loginType = String(user?.loginType || state?.loginType || '').toUpperCase();
    const anonymousFlags = [
      user?.isAnonymous,
      state?.isAnonymous,
      user?.isAnonymousAuth,
      state?.isAnonymousAuth,
      user?.is_anonymous
    ].filter((value) => typeof value === 'boolean');
    if (anonymousFlags.some(Boolean) || /ANONYMOUS/.test(loginType)) {
      return { classification:IDENTITY_ANONYMOUS, source:'legacy' };
    }
    // A false legacy anonymous flag is not reliable evidence on CloudBase 2.9:
    // some valid anonymous LoginState objects expose the field as false.
    // Legacy fields are compatibility hints only. They may prove anonymous,
    // but must never be allowed to trigger signOut by guessing non-anonymous.
    return { classification:IDENTITY_UNKNOWN, source:loginType ? 'legacy-ambiguous' : 'unavailable' };
  }

  function reportIdentityScope(phase, result) {
    if (config().authDiagnostics !== true) return;
    // loginScope contains only an authentication category. Never log LoginState,
    // uid, tokens or the raw SDK error here.
    global.console?.info?.('[SHEX_AUTH_DIAG]', {
      event:'cloudbase_identity_scope',
      phase,
      scope:result.scope || '(empty)',
      classification:result.classification,
      source:result.source
    });
  }

  async function inspectIdentity(auth, state, phase) {
    // CloudBase Web SDK 2.x no longer exposes LoginState.loginType or
    // LoginState.isAnonymousAuth. Its supported contract is loginScope().
    let scopeSource = 'unavailable';
    if (typeof auth?.loginScope === 'function') {
      try {
        const scopeValue = await auth.loginScope();
        const rawScope = scopeValue && typeof scopeValue === 'object' && Object.prototype.hasOwnProperty.call(scopeValue, 'scope')
          ? scopeValue.scope
          : scopeValue;
        const scope = String(rawScope || '').trim().toLowerCase();
        if (scope) {
          const result = {
            classification:scope === 'anonymous' ? IDENTITY_ANONYMOUS : IDENTITY_NON_ANONYMOUS,
            source:'loginScope',
            scope:scope.slice(0, 64)
          };
          reportIdentityScope(phase, result);
          return result;
        }
        scopeSource = 'loginScope-empty';
      } catch (_) {
        scopeSource = 'loginScope-error';
      }
    }
    const legacy = legacyIdentityEvidence(state);
    const result = {
      classification:legacy.classification,
      source:legacy.source === 'unavailable' ? scopeSource : legacy.source,
      scope:''
    };
    reportIdentityScope(phase, result);
    return result;
  }

  async function signInAnonymously(auth) {
    if (typeof auth.signInAnonymously === 'function') await auth.signInAnonymously();
    else if (typeof auth.anonymousAuthProvider === 'function') await auth.anonymousAuthProvider().signIn();
    else throw authNotReady('CloudBase 匿名鉴权接口不可用');
  }

  function waitForStorageUnlock(key, timeoutMs = AUTH_LOCK_TTL_MS) {
    if (typeof global.addEventListener !== 'function') return Promise.resolve();
    return new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        global.removeEventListener?.('storage', onStorage);
        global.clearTimeout?.(timer);
        resolve();
      };
      const onStorage = (event) => { if (event?.key === key && !event.newValue) finish(); };
      const timer = global.setTimeout?.(finish, timeoutMs);
      global.addEventListener('storage', onStorage);
    });
  }

  async function withStorageIdentityLock(task) {
    const target = storage('local');
    if (!target) return task();
    let current = readRecord(AUTH_LOCK_KEY);
    if (current && Number(current.expiresAt || 0) <= Date.now()) {
      removeRecord(AUTH_LOCK_KEY, current.nonce);
      current = null;
    }
    if (current && current.pageId !== PAGE_ID) {
      await waitForStorageUnlock(AUTH_LOCK_KEY);
      current = readRecord(AUTH_LOCK_KEY);
      if (current && Number(current.expiresAt || 0) > Date.now() && current.pageId !== PAGE_ID) {
        throw codedError('CLOUDBASE_AUTH_BUSY', '另一个页面正在准备 CloudBase 鉴权，请稍后重试');
      }
    }
    const lock = { tabId:tabId(), pageId:PAGE_ID, nonce:randomId('auth'), expiresAt:Date.now() + AUTH_LOCK_TTL_MS };
    let lockStored = false;
    try {
      try {
        target.setItem(AUTH_LOCK_KEY, JSON.stringify(lock));
        lockStored = true;
      } catch (_) {
        // Safari private mode and hardened browsers may expose localStorage but
        // reject writes. Same-page single-flight still applies; continue without
        // a cross-tab lock instead of blocking the whole site.
        return task();
      }
      if (readRecord(AUTH_LOCK_KEY)?.nonce !== lock.nonce) throw codedError('CLOUDBASE_AUTH_BUSY', 'CloudBase 鉴权正在由其他页面准备');
      return await task();
    } finally {
      if (lockStored) removeRecord(AUTH_LOCK_KEY, lock.nonce);
    }
  }

  function withIdentityLock(task) {
    const locks = global.navigator?.locks;
    if (locks?.request) return locks.request('shex-cloudbase-auth-v1', { mode:'exclusive' }, task);
    return withStorageIdentityLock(task);
  }

  async function prepareIdentity(auth, recovering) {
    const transition = activeVerifiedIdentityTransition();
    if (transition && transition.pageId !== PAGE_ID) {
      throw transitionError(transition.kind, `另一个页面正在进行${transition.kind === 'email' ? '邮箱' : '手机号'}安全验证`);
    }
    let state = await auth.getLoginState().catch(() => null);
    if (transition) {
      if (!state) throw transitionError(transition.kind, `${transition.kind === 'email' ? '邮箱' : '手机号'}安全验证期间身份暂不可用`);
      return state;
    }
    return withIdentityLock(async () => {
      state = await auth.getLoginState().catch(() => null);
      // A phone identity surviving a refresh is not a normal application session.
      // Only explicit non-anonymous evidence may sign it out. An empty or changed
      // SDK scope is unknown, not proof that the cached identity is wrong.
      const existingIdentity = state
        ? await inspectIdentity(auth, state, 'initialize-existing')
        : null;
      if (state && existingIdentity?.classification === IDENTITY_NON_ANONYMOUS) {
        if (typeof auth.signOut === 'function') await auth.signOut();
        state = null;
      }
      if (!state) {
        await signInAnonymously(auth);
        state = await auth.getLoginState().catch(() => null);
        if (!state) throw authNotReady('CloudBase 匿名鉴权尚未就绪');
        // This is diagnostic only. The SDK has just completed anonymous sign-in;
        // a missing/changed scope must never turn that success into a site outage.
        await inspectIdentity(auth, state, 'initialize-after-anonymous-signin');
      } else if (recovering && typeof auth.getAccessToken === 'function') {
        await auth.getAccessToken();
      }
      return state;
    });
  }

  async function resetToAnonymous() {
    const api = await gate.getClient();
    let replaced = false;
    await withIdentityLock(async () => {
      let state = await api.auth.getLoginState().catch(() => null);
      const identity = state
        ? await inspectIdentity(api.auth, state, 'reset-existing')
        : null;
      if (state && identity?.classification === IDENTITY_ANONYMOUS) {
        if (typeof api.auth.getAccessToken !== 'function') return;
        try {
          await api.auth.getAccessToken();
          return;
        } catch (_) {
          // The locally cached anonymous identity exists but its token can no
          // longer authorize requests. Rebuild it once while holding the same
          // identity lock instead of letting login race a stale credential.
        }
      }
      if (state) {
        if (typeof api.auth.signOut !== 'function') {
          throw authNotReady('CloudBase 现有身份无法安全退出');
        }
        // resetToAnonymous is an explicit login/logout boundary. Unlike normal
        // page initialization, UNKNOWN must be discarded here so a stale or
        // phone credential cannot survive into the next application session.
        await api.auth.signOut();
      }
      await signInAnonymously(api.auth);
      state = await api.auth.getLoginState().catch(() => null);
      if (!state) throw authNotReady('CloudBase 匿名身份恢复失败');
      const restoredIdentity = await inspectIdentity(api.auth, state, 'reset-after-anonymous-signin');
      if (restoredIdentity.classification === IDENTITY_NON_ANONYMOUS) {
        throw authNotReady('CloudBase 身份重置后仍不是匿名身份');
      }
      replaced = true;
    });
    if (replaced) gate.replaceClient(api);
    return api;
  }

  function authNotReady(message, cause) {
    const error = new Error(message || 'CloudBase 鉴权尚未就绪');
    error.code = 'CLOUDBASE_AUTH_NOT_READY';
    if (cause) {
      error.cause = cause;
      error.rawError = cause;
    }
    return error;
  }

  function assertNotChallengeCallbackFrame() {
    // 见 cloudbase-challenge-frame.js：CloudBase 人机验证回调 iframe 只供外层 SDK 读取地址，
    // 不得在这里初始化 / 重置 CloudBase 身份，也不得动外层的可信身份验证锁。
    if (global.SHEX_CLOUDBASE_CHALLENGE_CALLBACK_FRAME === true) {
      throw codedError('CLOUDBASE_CHALLENGE_CALLBACK_FRAME', 'CloudBase 人机验证回调页不启动身份');
    }
  }

  async function initialize({ recovering = false } = {}) {
    assertNotChallengeCallbackFrame();
    const cfg = config();
    if (!cfg.envId) throw authNotReady('CloudBase 环境未配置');
    await loadSdk();
    if (!global.cloudbase) throw authNotReady('CloudBase SDK 未就绪');
    // SDK 2.9.0 only reads the transport timeout at init, not on individual function calls.
    const app = global.cloudbase.init({ env:cfg.envId, region:cfg.region || 'ap-shanghai', timeout:65000 });
    const auth = app.auth({ persistence:'local' });
    try {
      if (!identityReady) identityReady = prepareIdentity(auth, recovering).finally(() => { identityReady = null; });
      await identityReady;
    } catch (error) {
      if (/^CLOUDBASE_/.test(String(error?.code || ''))) throw error;
      throw authNotReady('CloudBase 匿名鉴权失败', error);
    }
    return { app, auth, db:app.database() };
  }

  if (!global.SHEXCloudBaseAuthGate?.create) throw new Error('CloudBase 鉴权门未加载');
  const gate = global.SHEXCloudBaseAuthGate.create({ initialize, timeoutMs:12000 });
  global.SHEXCloudBaseClient = Object.freeze({
    VERSION,
    getClient:() => gate.getClient(),
    run:(operation, options) => gate.run(operation, options),
    replaceClient:(client) => gate.replaceClient(client),
    resetToAnonymous,
    beginVerifiedIdentityTransition,
    touchVerifiedIdentityTransition,
    endVerifiedIdentityTransition,
    beginPhoneIdentityTransition,
    touchPhoneIdentityTransition,
    endPhoneIdentityTransition,
    isTransportAuthError:(value) => gate.isTransportAuthError(value)
  });
})(typeof window !== 'undefined' ? window : globalThis);
