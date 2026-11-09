(() => {
  "use strict";

  const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const EMAIL_IDENTITY_POLL_DELAYS_MS = [0, 50, 100, 200, 300, 450];
  // 邮箱验证码发送频率限制：同一邮箱 5 分钟内最多发起 3 次（滑动窗口）。
  // 这里是真实发送点（浏览器直接调 CloudBase SDK），限流只能落在这一层。
  const EMAIL_CODE_RATE_WINDOW_MS = 5 * 60 * 1000;
  const EMAIL_CODE_RATE_MAX_SENDS = 3;
  const EMAIL_CODE_RATE_STORAGE_KEY = "shex_email_code_rate_v1";
  // key 为归一化后的邮箱，value 为该邮箱在窗口内的发送时间戳数组（毫秒）。
  const emailCodeSendTimestamps = new Map();
  let pendingVerification = null;
  let verificationEpoch = 0;

  function codedError(code, message, cause) {
    const error = new Error(message);
    error.code = code;
    if (cause) error.cause = cause;
    return error;
  }

  function normalizeEmail(value) {
    const normalized = String(value || "").trim().normalize("NFKC").toLowerCase();
    if (!normalized || normalized.length > 254 || !EMAIL_PATTERN.test(normalized)) {
      throw codedError("INVALID_EMAIL", "请输入有效的邮箱地址");
    }
    return normalized;
  }

  function pruneExpiredTimestamps(timestamps, now) {
    return timestamps.filter((sentAt) => now - sentAt < EMAIL_CODE_RATE_WINDOW_MS);
  }

  // localStorage 只作为“额外的一份”，让限流在刷新页面后仍然生效；
  // 隐私模式/存储被禁用时读写都会抛异常，一律吞掉，绝不能因为存储不可用而挡住正常发送。
  function readStoredTimestamps(email) {
    try {
      const raw = window.localStorage.getItem(EMAIL_CODE_RATE_STORAGE_KEY);
      if (!raw) return [];
      const store = JSON.parse(raw);
      const list = store && typeof store === "object" ? store[email] : null;
      return Array.isArray(list) ? list.filter((value) => Number.isFinite(value)) : [];
    } catch (_) {
      return [];
    }
  }

  function writeStoredTimestamps(email, timestamps) {
    try {
      const raw = window.localStorage.getItem(EMAIL_CODE_RATE_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      const store = parsed && typeof parsed === "object" ? parsed : {};
      store[email] = timestamps;
      window.localStorage.setItem(EMAIL_CODE_RATE_STORAGE_KEY, JSON.stringify(store));
    } catch (_) {
      // 忽略：内存里的 emailCodeSendTimestamps 仍然是限流依据
    }
  }

  // 本页面会话内，内存 Map 是唯一权威来源（每次记录都会同步写回 localStorage，
  // 两者理应一致）；只有内存里还没有这个邮箱的记录时（例如刚刷新页面、Map 刚重建），
  // 才退回读取 localStorage 里跨刷新留下的记录。
  // 注意：不能把内存与 localStorage 的记录按时间戳去重合并——同一毫秒内的多次发送
  // 会有相同的时间戳，去重会把它们错误地合并成一次，导致限流被绕过。
  function currentSendTimestamps(email, now) {
    const memoryTimestamps = emailCodeSendTimestamps.get(email);
    const timestamps = memoryTimestamps || readStoredTimestamps(email);
    return pruneExpiredTimestamps(timestamps, now);
  }

  function assertEmailCodeSendAllowed(email, now) {
    const timestamps = currentSendTimestamps(email, now);
    if (timestamps.length >= EMAIL_CODE_RATE_MAX_SENDS) {
      throw codedError("EMAIL_CODE_RATE_LIMITED", "验证码发送过于频繁，请稍后再试");
    }
    return timestamps;
  }

  // 只有真正发起发送（即将调用 auth.getVerification）才计数：
  // 即使随后 getVerification 失败（网络问题/CloudBase 拒绝），本次尝试依然计入次数，
  // 避免有人靠故意制造失败来无限刷新配额。
  function recordEmailCodeSendAttempt(email, timestampsBeforeSend, now) {
    const next = [...timestampsBeforeSend, now];
    emailCodeSendTimestamps.set(email, next);
    writeStoredTimestamps(email, next);
    return next;
  }

  async function authClient() {
    if (!window.SHEXAuth?.getCloudBaseAuth) throw codedError("CLOUDBASE_AUTH_NOT_READY", "CloudBase 身份服务尚未就绪");
    return window.SHEXAuth.getCloudBaseAuth();
  }

  const wait = (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs));

  function userOfLoginState(state) {
    if (!state || typeof state !== "object") return {};
    return state.user && typeof state.user === "object" ? state.user : state;
  }

  function uidOfLoginState(state) {
    const user = userOfLoginState(state);
    return String(user.uid || user.sub || user.uuid || state?.uid || "").trim();
  }

  function emailOfLoginState(state) {
    const user = userOfLoginState(state);
    const direct = user.email || user.emailAddress || user.email_address || "";
    if (direct) {
      try { return normalizeEmail(direct); } catch (_) {}
    }
    const providers = [
      ...(Array.isArray(user.providers) ? user.providers : []),
      ...(Array.isArray(user.identities) ? user.identities : [])
    ];
    for (const provider of providers) {
      const type = String(provider?.id || provider?.name || provider?.type || provider?.platform || "").toUpperCase();
      if (!/EMAIL|MAIL/.test(type)) continue;
      const value = provider?.providerUserId || provider?.provider_user_id || provider?.platformId || provider?.email || "";
      try { return normalizeEmail(value); } catch (_) {}
    }
    return "";
  }

  function isAnonymousLoginState(state) {
    const user = userOfLoginState(state);
    const loginType = String(user.loginType || state?.loginType || "").toUpperCase();
    return user.isAnonymous === true || state?.isAnonymous === true || /ANONYMOUS/.test(loginType);
  }

  function verifiedEmailIdentityOf(state, expectedEmail) {
    const uid = uidOfLoginState(state);
    if (!uid || isAnonymousLoginState(state) || emailOfLoginState(state) !== expectedEmail) return null;
    return { uid };
  }

  async function waitForVerifiedEmailIdentity(auth, signedInState, expectedEmail) {
    let state = signedInState;
    for (const delayMs of EMAIL_IDENTITY_POLL_DELAYS_MS) {
      if (delayMs) await wait(delayMs);
      const identity = verifiedEmailIdentityOf(state, expectedEmail);
      if (identity) return identity;
      state = await auth.getLoginState().catch(() => null);
    }
    throw codedError("EMAIL_IDENTITY_REQUIRED", "验证码已通过，但 CloudBase 邮箱身份尚未生效，请重新验证");
  }

  async function restoreAnonymousIdentity(auth) {
    try {
      const state = await auth.getLoginState?.().catch(() => null);
      if (state && typeof auth.signOut === "function") await auth.signOut();
      if (typeof auth.signInAnonymously === "function") await auth.signInAnonymously();
      else if (typeof auth.anonymousAuthProvider === "function") await auth.anonymousAuthProvider().signIn();
    } catch (_) {}
  }

  async function sendCode(emailInput) {
    const email = normalizeEmail(emailInput);
    const now = Date.now();
    const timestampsBeforeSend = assertEmailCodeSendAllowed(email, now);
    const startedAtEpoch = verificationEpoch;
    const auth = await authClient();
    if (verificationEpoch !== startedAtEpoch) throw codedError("EMAIL_VERIFICATION_CANCELLED", "邮箱已更换，请重新获取当前邮箱的验证码");
    recordEmailCodeSendAttempt(email, timestampsBeforeSend, now);
    // 不传 withCaptcha 选项：CloudBase SDK 2.9.0 里打开该选项会在发送前**主动**申请人机验证令牌，
    // 正常用户也可能因此看到验证框。不传时正常请求直接发送；只有 CloudBase 风控返回
    // captcha_required / captcha_invalid 时，SDK 才会自动弹出它自己的验证并在通过后重发本次请求。
    const verificationInfo = await auth.getVerification({ email, target: "ANY" });
    if (!verificationInfo?.verification_id) throw codedError("EMAIL_CODE_SEND_FAILED", "邮箱验证码发送失败，请稍后重试");
    if (verificationEpoch !== startedAtEpoch) throw codedError("EMAIL_VERIFICATION_CANCELLED", "邮箱已更换，请重新获取当前邮箱的验证码");
    pendingVerification = { email, verificationInfo, createdAt: Date.now() };
    return { email };
  }

  function getPendingVerification() {
    return pendingVerification && {
      email: pendingVerification.email,
      verificationInfo: pendingVerification.verificationInfo
    };
  }

  function isExplicitVerificationExpiry(error) {
    const detail = [error?.code, error?.message].filter(Boolean).join(" ");
    return /verification[^\s]*.*(?:expired|timeout)|(?:expired|timeout).*verification|验证码.*(?:过期|失效)|(?:过期|失效).*验证码/i.test(detail);
  }

  async function verifyAndSignIn(emailInput, verificationCode, modeInput) {
    const email = normalizeEmail(emailInput);
    const code = String(verificationCode || "").trim();
    const mode = String(modeInput || "").trim().toLowerCase();
    if (!code) throw codedError("EMAIL_CODE_REQUIRED", "请输入邮箱验证码");
    if (!["login", "register"].includes(mode)) throw codedError("EMAIL_AUTH_MODE_INVALID", "邮箱登录方式无效");
    if (!pendingVerification || pendingVerification.email !== email) {
      throw codedError("EMAIL_VERIFICATION_REQUIRED", "请先获取当前邮箱的验证码");
    }

    const verificationInfo = pendingVerification.verificationInfo;
    if (mode === "login" && verificationInfo.is_user !== true) {
      throw codedError("EMAIL_NOT_REGISTERED", "该邮箱尚未注册，请切换到邮箱注册");
    }

    const auth = await authClient();
    let cloudbaseSignInStarted = false;
    try {
      const verified = await auth.verify({
        verification_id: verificationInfo.verification_id,
        verification_code: code
      });
      const verificationToken = String(verified?.verification_token || "").trim();
      if (!verificationToken) throw codedError("EMAIL_CODE_VERIFY_FAILED", "邮箱验证码验证失败，请重新获取");

      const previousState = await auth.getLoginState?.().catch(() => null);
      if (previousState && typeof auth.signOut === "function") await auth.signOut();
      cloudbaseSignInStarted = true;
      const signedInState = verificationInfo.is_user === true
        ? await auth.signIn({ username: email, verification_token: verificationToken })
        : await auth.signUp({ email, verification_code: code, verification_token: verificationToken });
      const identity = await waitForVerifiedEmailIdentity(auth, signedInState, email);
      if (typeof auth.getAccessToken === "function") await auth.getAccessToken();
      // CloudBase 身份已验证，但 SHE.X 注册/登录可能还会因其他字段失败；由页面在业务成功后统一清理。
      return { email, uid: identity.uid, mode };
    } catch (error) {
      if (isExplicitVerificationExpiry(error) && pendingVerification?.verificationInfo === verificationInfo) {
        pendingVerification = null;
      }
      if (cloudbaseSignInStarted) await restoreAnonymousIdentity(auth);
      throw error;
    }
  }

  function clearPendingVerification() {
    pendingVerification = null;
    verificationEpoch += 1;
  }

  window.SHEXEmailAuth = Object.freeze({
    normalizeEmail,
    sendCode,
    getPendingVerification,
    verifyAndSignIn,
    clearPendingVerification
  });
})();
