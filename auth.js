(() => {
  // CloudBase 人机验证回调 iframe（见 auth.html）：外层页面的 SDK 会读取它的地址并继续原请求，这里什么都不做。
  if (window.SHEX_CLOUDBASE_CHALLENGE_CALLBACK_FRAME === true) return;
  const form = document.querySelector("#authForm");
  const username = document.querySelector("#authUsername");
  const password = document.querySelector("#authPassword");
  const usernameField = document.querySelector("#usernameField");
  const passwordField = document.querySelector("#passwordField");
  const emailFields = document.querySelector("#emailAuthFields");
  const email = document.querySelector("#authEmail");
  const emailCode = document.querySelector("#authEmailCode");
  const sendEmailCode = document.querySelector("#sendEmailCode");
  const togglePassword = document.querySelector("#togglePassword");
  const pageTitle = document.querySelector("#authPageTitle");
  const providerTabs = document.querySelector(".auth-provider-tabs");
  const providerButtons = document.querySelectorAll("[data-auth-provider]");
  const authRegisterPrompt = document.querySelector("#authRegisterPrompt");
  const authGoRegister = document.querySelector("#authGoRegister");
  const authGoLogin = document.querySelector("#authGoLogin");
  const submit = document.querySelector("#authSubmit");
  const status = document.querySelector("#authStatus");
  const userId = document.querySelector("#currentUserId");
  const logout = document.querySelector("#logoutButton");
  const adminContactButton = document.querySelector("#authContactAdmin");
  const adminContactModal = document.querySelector("#authAdminContactModal");
  const copyAdminQQButton = document.querySelector("#authCopyAdminQQ");
  const adminCopyStatus = document.querySelector("#authAdminCopyStatus");
  const ADMIN_QQ = "2140980147";
  const pageNotice = new URLSearchParams(location.search).get("notice");
  const INVITE_CODE_PATTERN = /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/;
  // 链接里“是否带了 invite 参数”与“这个 invite 值是否合法”是两件独立的事：
  // 前者只决定要不要自动切到注册模式，后者才决定要不要把值带进输入框 / 提交给后端。
  const inviteParamPresent = (() => {
    const raw = new URLSearchParams(location.search).get("invite");
    return String(raw || "").trim().length > 0;
  })();
  const inviteCodeFromLink = (() => {
    const raw = new URLSearchParams(location.search).get("invite");
    const normalized = String(raw || "").trim().toUpperCase();
    return INVITE_CODE_PATTERN.test(normalized) ? normalized : "";
  })();
  const STORAGE_QUOTA_MESSAGE = "浏览器本地存储空间不足，云端账号可能已登录成功，但本机数据恢复失败。请清理浏览器缓存后重试，或换一个浏览器打开。";
  const SESSION_EXPIRED_MESSAGE = "当前账号已在其他设备登录，本设备登录状态已过期，请重新登录。";
  let pageMode = "login";
  const authModeByPage = { login: "email", register: "email" };
  let provider = authModeByPage[pageMode];
  let emailIdentityTransition = null;
  let verifiedEmail = "";
  let emailSendCooldownTimer = 0;
  let emailSendInFlight = false;
  let authSubmitInFlight = false;
  let identityCleanupReady = Promise.resolve();
  let emailFlowEpoch = 0;
  let adminContactReturnFocus = null;
  const identityResetReady = !window.SHEXAuth?.current?.()
    ? window.SHEXAuth?.resetCloudBaseIdentityToAnonymous?.().catch((error) => {
      console.error("[SHEX_ERROR]", { step: "auth:clear-stale-cloudbase-identity", rawError: error });
      throw error;
    })
    : Promise.resolve();

  const setStatus = (message, type = "") => {
    if (!status) return;
    status.textContent = message || "";
    status.dataset.type = type || "";
  };

  // X奖励系统：邀请码入口。
  // 产品方第六轮定稿：邀请码入口与 X奖励面板灰度完全无关，邮箱注册时**无条件**展示，
  // 不再依赖任何后端下发的 rollout 字段。真正的资格闸门在服务端（邀请人必须具备邀请资格），
  // 被拒时后端返回中性文案，注册流程不受影响。
  // 仅邮箱注册链路提供该入口：账号密码注册链路不新增邀请码能力。
  const inviteFieldId = "authInviteCodeField";
  const removeInviteField = () => {
    document.getElementById(inviteFieldId)?.remove();
  };
  const currentInviteCode = () => {
    const input = document.querySelector("#authInviteCode");
    const raw = input ? input.value : inviteCodeFromLink;
    const normalized = String(raw || "").trim().toUpperCase();
    return INVITE_CODE_PATTERN.test(normalized) ? normalized : "";
  };
  const renderInviteField = () => {
    const shouldShow = pageMode === "register" && provider === "email";
    if (!shouldShow || !emailFields) { removeInviteField(); return; }
    let field = document.getElementById(inviteFieldId);
    if (!field) {
      field = document.createElement("label");
      field.id = inviteFieldId;
      field.className = "auth-invite-field";
      field.innerHTML = '邀请码（选填）'
        + '<input id="authInviteCode" name="inviteCode" autocomplete="off" maxlength="8" placeholder="有邀请码可以填写，没有可以留空" />'
        + '<span class="auth-invite-hint" id="authInviteHint" aria-live="polite"></span>';
      emailFields.appendChild(field);
    }
    const input = field.querySelector("#authInviteCode");
    const hint = field.querySelector("#authInviteHint");
    if (inviteCodeFromLink) {
      // 通过邀请链接进入，且邀请码合法：自动带入、置为只读，用户无需再输入。
      input.value = inviteCodeFromLink;
      input.readOnly = true;
      if (hint) hint.textContent = "邀请关系已带入，注册成功后自动发放奖励。";
    } else if (inviteParamPresent) {
      // 链接里带了 invite 参数，但值不合法：绝不把非法值填进输入框或提交，
      // 输入框保持可编辑（不强行清空用户已手动输入的内容），并温和提示。
      input.readOnly = false;
      if (hint) hint.textContent = "邀请链接里的邀请码无效，你可以手动填写，或留空继续注册。";
    } else {
      input.readOnly = false;
      if (hint) hint.textContent = "";
    }
  };

  const setAdminCopyStatus = (message) => {
    if (adminCopyStatus) adminCopyStatus.textContent = message || "";
  };

  const openAdminContact = () => {
    if (!adminContactModal) return;
    adminContactReturnFocus = document.activeElement;
    adminContactModal.hidden = false;
    document.body.classList.add("auth-admin-modal-open");
    setAdminCopyStatus("");
    window.setTimeout(() => adminContactModal.querySelector(".auth-admin-modal-close")?.focus(), 0);
  };

  const closeAdminContact = () => {
    if (!adminContactModal || adminContactModal.hidden) return;
    adminContactModal.hidden = true;
    document.body.classList.remove("auth-admin-modal-open");
    if (adminContactReturnFocus?.focus) adminContactReturnFocus.focus();
  };

  const copyAdminQQ = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(ADMIN_QQ);
      } else {
        const helper = document.createElement("textarea");
        helper.value = ADMIN_QQ;
        helper.setAttribute("readonly", "");
        helper.style.position = "fixed";
        helper.style.opacity = "0";
        document.body.appendChild(helper);
        helper.select();
        document.execCommand("copy");
        helper.remove();
      }
      setAdminCopyStatus("QQ号已复制");
    } catch (_) {
      setAdminCopyStatus(`请手动复制：${ADMIN_QQ}`);
    }
  };

  const formatError = (error) => {
    const raw = [
      error?.code,
      error?.message,
      error?.detail,
      error?.error_description,
      typeof error?.error === "string" ? error.error : ""
    ].filter(Boolean).join(" ") || (() => {
      if (!error) return "";
      try {
        return JSON.stringify(error);
      } catch (_) {
        return String(error);
      }
    })();
    if (/QuotaExceededError|quota has been exceeded|storage quota|exceeded the quota|Failed to execute 'setItem'.*Storage/i.test(raw)) return STORAGE_QUOTA_MESSAGE;
    if (/EMAIL_NOT_REGISTERED/i.test(raw)) return "该邮箱还没有注册，请切换到邮箱注册";
    if (/EMAIL_ALREADY_REGISTERED/i.test(raw)) return "该邮箱已经注册，请切换到邮箱登录";
    if (/EMAIL_AUTH_DISABLED/i.test(raw)) return "邮箱登录与注册暂未开放，请使用账号密码";
    if (/ACCOUNT_DISABLED/i.test(raw)) return "账号已注销，无法登录";
    if (/PASSWORD_AUTH_DISABLED/i.test(raw)) return "该账号使用邮箱验证码登录，请切换到邮箱登录";
    if (/invalid_verification_code|EMAIL_CODE_VERIFY_FAILED|邮箱验证码.*错误/i.test(raw)) return "邮箱验证码不正确，请重新输入";
    if (/verification.*expired|EMAIL_VERIFICATION_REQUIRED|EMAIL_IDENTITY_REQUIRED|邮箱验证码.*(?:失效|过期)/i.test(raw)) return "邮箱验证码已失效，请重新获取";
    if (/USERNAME_EXISTS|用户名已被注册|已被注册/i.test(raw)) return "当前用户名已被注册过，请更换用户名或直接登录";
    if (/INVALID_CREDENTIALS|invalid-credentials|invalid credentials|账号或密码|密码不对/i.test(raw)) return "账号或密码不对，再检查一下";
    if (/USER_NOT_FOUND|account not found|账号不存在/i.test(raw)) return "账号不存在，请先注册";
    if (/SESSION_EXPIRED|SESSION_LIMIT|invalid session|missing userId|missing .*sessionToken|登录状态|会话/i.test(raw)) return SESSION_EXPIRED_MESSAGE;
    if (/CLOUDBASE_SDK_LOAD_FAILED|CLOUDBASE_SDK_TIMEOUT/i.test(raw)) return "系统连接组件加载失败，请刷新页面后再试";
    if (/CLOUDBASE_AUTH_BUSY/i.test(raw)) return "另一个页面正在准备系统身份，请关闭重复页面或稍后重试";
    if (/CLOUDBASE_AUTH_COOLDOWN/i.test(raw)) return "系统身份连接连续失败，请稍后刷新页面再试";
    if (/CLOUDBASE_REAUTH_FAILED|CLOUDBASE_AUTH_NOT_READY/i.test(raw)) return "系统身份连接失败，请刷新页面后再试";
    if (/ResourceNotFound|Db or Table not exist|collection .*not exist|not exist|not found/i.test(raw)) return "系统配置还没准备好，请稍后再试";
    if (/network|timeout|timed out|ECONN|fetch|网络/i.test(raw)) return "网络有点不稳定，稍后再试试";
    if (/CloudBase|云函数|PERMISSION_DENIED|OPERATION_FAIL/i.test(raw)) return "系统连接有点不稳定，请稍后再试";
    return raw || "操作失败，请稍后重试。";
  };

  const applyPasswordRule = () => {
    if (!password) return;
    if (provider === "password" && pageMode === "register") {
      password.minLength = 6;
      password.setAttribute("minlength", "6");
    } else {
      password.removeAttribute("minlength");
    }
  };

  const renderModeFields = () => {
    provider = authModeByPage[pageMode];
    const registering = pageMode === "register";
    const emailMode = provider === "email";
    if (pageTitle) pageTitle.textContent = registering ? "注册" : "登录";
    if (providerTabs) providerTabs.setAttribute("aria-label", registering ? "注册方式" : "登录方式");
    providerButtons.forEach((button) => {
      const buttonProvider = button.dataset.authProvider || "email";
      button.classList.toggle("active", buttonProvider === provider);
      button.disabled = authSubmitInFlight;
      button.textContent = registering
        ? (buttonProvider === "email" ? "邮箱注册" : "账号密码注册")
        : (buttonProvider === "email" ? "邮箱验证码" : "账号密码");
    });
    if (emailFields) emailFields.hidden = !emailMode;
    renderInviteField();
    if (usernameField) usernameField.hidden = emailMode && !registering;
    if (passwordField) passwordField.hidden = emailMode;
    [email, emailCode].forEach((input) => {
      if (!input) return;
      input.disabled = !emailMode || authSubmitInFlight;
      input.required = emailMode;
    });
    if (sendEmailCode) sendEmailCode.disabled = !emailMode || Boolean(emailSendCooldownTimer) || emailSendInFlight || authSubmitInFlight;
    if (username) {
      username.disabled = (emailMode && !registering) || authSubmitInFlight;
      username.required = !username.disabled;
    }
    if (password) {
      password.disabled = emailMode || authSubmitInFlight;
      password.required = !emailMode;
    }
    if (submit) {
      submit.textContent = registering ? "注册" : "登录";
      submit.disabled = authSubmitInFlight || (emailMode && emailSendInFlight);
    }
    if (authRegisterPrompt) authRegisterPrompt.hidden = registering;
    if (authGoRegister) {
      authGoRegister.hidden = registering;
      authGoRegister.disabled = authSubmitInFlight;
    }
    if (authGoLogin) {
      authGoLogin.hidden = !registering;
      authGoLogin.disabled = authSubmitInFlight;
    }
  };

  const clearFlowVerification = () => {
    void clearEmailIdentity({ restoreAnonymous: true }).catch((error) => {
      console.error("[SHEX_ERROR]", { step: "auth:clear-email-flow", rawError: error });
      setStatus(formatError(error), "error");
    });
  };

  const showPageMode = (nextPageMode) => {
    if (nextPageMode !== "login" && nextPageMode !== "register") return;
    if (nextPageMode === pageMode) return;
    clearFlowVerification();
    pageMode = nextPageMode;
    provider = authModeByPage[pageMode];
    if (password) password.autocomplete = pageMode === "register" ? "new-password" : "current-password";
    applyPasswordRule();
    renderModeFields();
    setStatus(provider === "email"
      ? (pageMode === "register" ? "邮箱验证成功后填写用户名即可创建账号，不需要密码。" : "输入邮箱验证码登录 SHE.X。")
      : (pageMode === "register" ? "用户名会自动忽略大小写和前后空格，密码至少 6 位。" : "使用原来的用户名和密码登录。"), "");
  };

  const resetEmailCodeUI = () => {
    if (emailCode) emailCode.value = "";
    if (emailSendCooldownTimer) window.clearInterval(emailSendCooldownTimer);
    emailSendCooldownTimer = 0;
    if (sendEmailCode) sendEmailCode.textContent = "获取验证码";
    renderModeFields();
  };

  const clearEmailIdentity = ({ restoreAnonymous = true, invalidateRequest = true } = {}) => {
    const token = emailIdentityTransition;
    emailIdentityTransition = null;
    verifiedEmail = "";
    if (invalidateRequest) {
      emailFlowEpoch += 1;
      emailSendInFlight = false;
    }
    window.SHEXEmailAuth?.clearPendingVerification?.();
    resetEmailCodeUI();
    identityCleanupReady = identityCleanupReady.catch(() => {}).then(async () => {
      try {
        if (restoreAnonymous) await window.SHEXAuth?.resetCloudBaseIdentityToAnonymous?.();
      } finally {
        if (token) window.SHEXCloudBaseClient?.endVerifiedIdentityTransition?.(token);
      }
    });
    return identityCleanupReady;
  };

  const beginEmailIdentity = async (normalizedEmail, requestEpoch) => {
    await identityResetReady;
    await identityCleanupReady;
    if (requestEpoch !== emailFlowEpoch) throw new Error("邮箱验证流程已切换");
    const pending = window.SHEXEmailAuth?.getPendingVerification?.();
    const existingContext = (pending?.email === normalizedEmail && Boolean(pending?.verificationInfo?.verification_id))
      || verifiedEmail === normalizedEmail;
    if (!existingContext) await clearEmailIdentity({ restoreAnonymous: true, invalidateRequest: false });
    if (requestEpoch !== emailFlowEpoch) throw new Error("邮箱验证流程已切换");
    if (!emailIdentityTransition) emailIdentityTransition = window.SHEXCloudBaseClient?.beginVerifiedIdentityTransition?.("email");
    if (!emailIdentityTransition) throw new Error("邮箱身份切换组件未就绪");
    return emailIdentityTransition;
  };

  const setEmailSendCooldown = () => {
    if (emailSendCooldownTimer) window.clearInterval(emailSendCooldownTimer);
    let remaining = 60;
    if (sendEmailCode) sendEmailCode.textContent = `${remaining}秒后重试`;
    emailSendCooldownTimer = window.setInterval(() => {
      remaining -= 1;
      if (remaining > 0) {
        if (sendEmailCode) sendEmailCode.textContent = `${remaining}秒后重试`;
        return;
      }
      window.clearInterval(emailSendCooldownTimer);
      emailSendCooldownTimer = 0;
      if (sendEmailCode) sendEmailCode.textContent = "获取验证码";
      renderModeFields();
    }, 1000);
    renderModeFields();
  };

  const renderCurrent = () => {
    const rawCurrent = window.SHEXAuth?.current?.();
    // 免登录访客不算已登录，登录页仍需展示可用的登录 / 注册表单。
    const current = rawCurrent && !rawCurrent.guest && rawCurrent.sessionToken !== "guest-local" ? rawCurrent : null;
    if (current) {
      document.body.classList.add("is-logged-in");
      if (userId) userId.textContent = current.userId || "已登录";
      if (logout) {
        logout.disabled = false;
        logout.textContent = "退出登录";
      }
      setStatus(`已登录：${current.displayName || current.username || current.userId}`, "ok");
      return;
    }

    document.body.classList.remove("is-logged-in");
    if (userId) userId.textContent = "登录后生成";
    if (logout) {
      logout.disabled = true;
      logout.textContent = "当前未登录";
    }
    if (pageNotice === "login_required") {
      setStatus("请先登录后使用 SHE.X 云端功能。", "error");
      return;
    }
    setStatus(window.SHEXAuth?.isCloudConfigured?.()
      ? ""
      : "CloudBase 环境 ID 未配置，当前无法登录或注册。", "");
  };

  togglePassword?.addEventListener("click", () => {
    const showing = password.type === "text";
    password.type = showing ? "password" : "text";
    togglePassword.textContent = showing ? "显示" : "隐藏";
    togglePassword.setAttribute("aria-pressed", String(!showing));
  });

  adminContactButton?.addEventListener("click", openAdminContact);
  adminContactModal?.querySelectorAll("[data-auth-admin-close]").forEach((button) => {
    button.addEventListener("click", closeAdminContact);
  });
  copyAdminQQButton?.addEventListener("click", copyAdminQQ);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && adminContactModal && !adminContactModal.hidden) closeAdminContact();
  });

  providerButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const nextProvider = button.dataset.authProvider || "email";
      if (nextProvider === provider) return;
      provider = nextProvider;
      authModeByPage[pageMode] = nextProvider;
      clearFlowVerification();
      applyPasswordRule();
      renderModeFields();
      setStatus(provider === "email"
        ? (pageMode === "register" ? "使用邮箱验证码创建账号，不需要设置密码。" : "使用邮箱验证码登录。")
        : (pageMode === "register" ? "使用用户名和密码创建账号。" : "使用原来的用户名和密码登录。"), "");
    });
  });

  email?.addEventListener("input", () => {
    const pending = window.SHEXEmailAuth?.getPendingVerification?.();
    if (!pending && !verifiedEmail) return;
    let normalizedEmail = "";
    try { normalizedEmail = window.SHEXEmailAuth.normalizeEmail(email.value); } catch (_) {}
    if (normalizedEmail !== (pending?.email || verifiedEmail)) {
      void clearEmailIdentity({ restoreAnonymous: true }).catch((error) => {
        console.error("[SHEX_ERROR]", { step: "auth:change-email", rawError: error });
        setStatus(formatError(error), "error");
      });
      setStatus("邮箱已更换，请重新获取当前邮箱的验证码", "error");
    }
  });

  authGoRegister?.addEventListener("click", () => {
    showPageMode("register");
  });
  authGoLogin?.addEventListener("click", () => showPageMode("login"));

  sendEmailCode?.addEventListener("click", async () => {
    if (!email?.value.trim()) {
      setStatus("请输入邮箱地址", "error");
      return;
    }
    emailSendInFlight = true;
    renderModeFields();
    let requestedEmail = "";
    const requestEpoch = emailFlowEpoch;
    try {
      requestedEmail = window.SHEXEmailAuth.normalizeEmail(email.value);
      await beginEmailIdentity(requestedEmail, requestEpoch);
      if (requestEpoch !== emailFlowEpoch || provider !== "email" || window.SHEXEmailAuth.normalizeEmail(email.value) !== requestedEmail) {
        if (requestEpoch === emailFlowEpoch) await clearEmailIdentity({ restoreAnonymous: true });
        throw new Error("邮箱验证流程已切换");
      }
      const sent = await window.SHEXEmailAuth.sendCode(requestedEmail);
      if (requestEpoch !== emailFlowEpoch || window.SHEXEmailAuth.normalizeEmail(email.value) !== sent.email) {
        if (requestEpoch === emailFlowEpoch) await clearEmailIdentity({ restoreAnonymous: true });
        throw new Error("邮箱已更换，请重新获取当前邮箱的验证码");
      }
      email.value = sent.email;
      verifiedEmail = "";
      if (emailCode) emailCode.value = "";
      setEmailSendCooldown();
      setStatus("邮箱验证码已发送，请及时填写。", "ok");
    } catch (error) {
      console.error("[SHEX_ERROR]", { step: "auth:send-email-code", rawError: error });
      if (requestEpoch !== emailFlowEpoch) return;
      const pending = window.SHEXEmailAuth?.getPendingVerification?.();
      if (!((pending?.email === requestedEmail && pending.verificationInfo?.verification_id) || verifiedEmail === requestedEmail)) {
        await clearEmailIdentity({ restoreAnonymous: true });
      }
      setStatus(formatError(error), "error");
    } finally {
      if (requestEpoch === emailFlowEpoch) {
        emailSendInFlight = false;
        renderModeFields();
      }
    }
  });

  let pageRegistrationRequestId = "";
  const emailRegistrationRequestId = () => {
    if (pageRegistrationRequestId) return pageRegistrationRequestId;
    const key = "shex_email_registration_request_id_v1";
    try { pageRegistrationRequestId = String(sessionStorage.getItem(key) || "").trim(); } catch (_) {}
    if (!pageRegistrationRequestId) {
      const nonce = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      pageRegistrationRequestId = `email-reg-${nonce}`.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 96);
      try { sessionStorage.setItem(key, pageRegistrationRequestId); } catch (_) {}
    }
    return pageRegistrationRequestId;
  };

  const releaseEmailTransition = () => {
    const token = emailIdentityTransition;
    emailIdentityTransition = null;
    verifiedEmail = "";
    window.SHEXEmailAuth?.clearPendingVerification?.();
    resetEmailCodeUI();
    if (token) window.SHEXCloudBaseClient?.endVerifiedIdentityTransition?.(token);
  };

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!window.SHEXAuth?.isCloudConfigured?.()) {
      setStatus("CloudBase 环境 ID 未配置，当前无法登录或注册。", "error");
      return;
    }
    if (pageMode === "register" && localStorage.getItem("hasRegisteredAccount") === "true") {
      setStatus("当前浏览器已注册过账号，请直接登录", "error");
      return;
    }
    const emailMode = provider === "email";
    if (emailMode && (!email?.value.trim() || !emailCode?.value.trim())) {
      setStatus("请输入邮箱和邮箱验证码", "error");
      return;
    }
    if (!emailMode && (!username?.value.trim() || !password?.value)) {
      setStatus("请输入用户名和密码", "error");
      return;
    }
    if (pageMode === "register" && !username?.value.trim()) {
      setStatus("请输入用户名", "error");
      return;
    }

    const submittedEmail = email?.value || "";
    const submittedCode = emailCode?.value || "";
    const submittedUsername = username?.value || "";
    const submittedInviteCode = emailMode ? currentInviteCode() : "";
    const submittedPageMode = pageMode;
    const submittedProvider = provider;
    const submittedFlowEpoch = emailFlowEpoch;
    let ownFlowReset = false;
    authSubmitInFlight = true;
    renderModeFields();
    setStatus(emailMode ? "正在验证邮箱并进入 SHE.X..." : (pageMode === "register" ? "正在注册..." : "正在登录..."), "");
    try {
      let current;
      if (emailMode) {
        const normalizedEmail = window.SHEXEmailAuth.normalizeEmail(submittedEmail);
        const pending = window.SHEXEmailAuth.getPendingVerification();
        if (verifiedEmail !== normalizedEmail &&
          (pending?.email !== normalizedEmail || !pending.verificationInfo?.verification_id)) {
          ownFlowReset = true;
          await clearEmailIdentity({ restoreAnonymous: true });
          throw new Error("请重新获取当前邮箱的验证码");
        }
        if (verifiedEmail !== normalizedEmail) {
          const identity = await window.SHEXEmailAuth.verifyAndSignIn(normalizedEmail, submittedCode, submittedPageMode);
          if (submittedFlowEpoch !== emailFlowEpoch || provider !== submittedProvider || pageMode !== submittedPageMode) {
            await window.SHEXAuth?.resetCloudBaseIdentityToAnonymous?.();
            throw new Error("邮箱验证流程已切换");
          }
          verifiedEmail = identity.email;
          if (emailIdentityTransition) window.SHEXCloudBaseClient?.touchVerifiedIdentityTransition?.(emailIdentityTransition);
        }
        if (submittedFlowEpoch !== emailFlowEpoch || provider !== "email" || pageMode !== submittedPageMode ||
          window.SHEXEmailAuth.normalizeEmail(email.value) !== normalizedEmail) {
          ownFlowReset = true;
          await clearEmailIdentity({ restoreAnonymous: true });
          throw new Error("邮箱验证流程已切换，请重新获取当前邮箱的验证码");
        }
        current = submittedPageMode === "register"
          ? await window.SHEXAuth.registerWithVerifiedEmail(verifiedEmail, submittedUsername, emailRegistrationRequestId(), {}, { inviteCode: submittedInviteCode })
          : await window.SHEXAuth.loginWithVerifiedEmail(verifiedEmail);
        if (submittedFlowEpoch !== emailFlowEpoch || provider !== submittedProvider || pageMode !== submittedPageMode) return;
        if (submittedPageMode === "register") {
          try { sessionStorage.removeItem("shex_email_registration_request_id_v1"); } catch (_) {}
          pageRegistrationRequestId = "";
        }
        releaseEmailTransition();
      } else if (pageMode === "register") {
        await identityResetReady;
        await identityCleanupReady;
        current = await window.SHEXAuth.register(username.value, password.value, {});
      } else {
        await identityCleanupReady;
        current = await window.SHEXAuth.login(username.value, password.value);
      }
      if (current.mustChangePassword) {
        setStatus("登录成功，但需要先设置新密码", "ok");
        form.style.display = "none";
        document.querySelectorAll(".auth-provider-tabs, .auth-page-switch, .auth-state").forEach((el) => {
          el.style.display = "none";
        });
        const changeForm = document.querySelector("#changePasswordForm");
        if (changeForm) changeForm.style.display = "flex";
        return;
      }
      // 产品合同 §7：金额只有服务端一个权威源，前端不得硬编码兜底值。
      // 后端没回金额就只报注册成功，不猜数字。
      const inviteReward = current?.inviteReward;
      const inviteeRewardAmount = Number(inviteReward?.inviteeAmount || 0);
      const inviteRewardApplied = Boolean(inviteReward && inviteReward.applied === true && inviteeRewardAmount > 0);
      setStatus(inviteRewardApplied
        ? `成功，userId：${current.userId}；受邀奖励 +${inviteeRewardAmount} X能量已到账。`
        : `成功，userId：${current.userId}`, "ok");
      window.setTimeout(() => {
        window.location.href = "./index.html#x-world";
      }, 650);
    } catch (error) {
      console.error("[SHEX_ERROR]", { step: `auth:${provider}:${pageMode}`, rawError: error });
      if (!ownFlowReset && (submittedFlowEpoch !== emailFlowEpoch || provider !== submittedProvider || pageMode !== submittedPageMode)) return;
      setStatus(formatError(error), "error");
      if (emailMode && /verification.*expired|EMAIL_VERIFICATION_REQUIRED|EMAIL_IDENTITY_REQUIRED|邮箱验证码.*(?:失效|过期)/i.test(String(error?.code || "") + " " + String(error?.message || ""))) {
        await clearEmailIdentity({ restoreAnonymous: true });
      }
    } finally {
      authSubmitInFlight = false;
      renderModeFields();
    }
  });

  const changePasswordForm = document.querySelector("#changePasswordForm");
  changePasswordForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const currentPasswordInput = document.querySelector("#currentPasswordInput");
    const newPasswordInput = document.querySelector("#newPasswordInput");
    const currentPasswordValue = currentPasswordInput?.value || "";
    const newPasswordValue = newPasswordInput?.value || "";
    if (!currentPasswordValue || !newPasswordValue) {
      setStatus("请填写当前密码和新密码", "error");
      return;
    }
    if (newPasswordValue.length < 6) {
      setStatus("新密码至少需要6位", "error");
      return;
    }
    const submitButton = changePasswordForm.querySelector("button[type=\"submit\"]");
    if (submitButton) submitButton.disabled = true;
    try {
      await window.SHEXAuth.changePassword(currentPasswordValue, newPasswordValue);
      setStatus("新密码设置成功，正在进入...", "ok");
      window.setTimeout(() => {
        window.location.href = "./index.html#x-world";
      }, 650);
    } catch (error) {
      console.error("[SHEX_ERROR]", { step: "auth:changePassword", rawError: error });
      setStatus(formatError(error), "error");
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  });

  logout?.addEventListener("click", async () => {
    if (!window.SHEXAuth?.current?.()) return;
    logout.disabled = true;
    try {
      await window.SHEXAuth.logout();
      renderCurrent();
      setStatus("已退出登录。", "ok");
    } catch (error) {
      console.error("[SHEX_ERROR]", { step: "auth:logout", rawError: error });
      setStatus(formatError(error), "error");
    } finally {
      logout.disabled = false;
    }
  });

  document.addEventListener("shex:auth-change", renderCurrent);
  applyPasswordRule();
  renderModeFields();
  renderCurrent();
  if (inviteParamPresent) {
    // 只要链接里带了 invite 参数（不管值是否合法）就自动切到注册模式；
    // 值是否合法只影响邀请码输入框怎么渲染（见 renderInviteField），不影响是否进入注册页。
    showPageMode("register");
  }
})();
