/**
 * SHE.X 邀请奖励前端模块（独立文件，不依赖 energy.js 的任何内部函数）。
 *
 * 契约（FLEET-CONTRACT.md §5，主控统一接线，签名不得更改）：
 *   window.SHEXRewardPanel = {
 *     isVisible(account),              // 后端 account.rewardSystemEnabled 决定；旧后端缺该字段时回落到 isAdmin === true
 *     mount({ container, api }),       // api: { getMyInviteInfo, submitInviteCode }
 *     render(summary),                 // summary: { account, invite }
 *     refresh()                        // 重新拉 getMyInviteInfo 并 render
 *   }
 *
 * 隐私硬性要求：只展示邀请总人数与金额，绝不渲染任何被邀请人的名单/昵称/ID/邮箱/头像。
 * 视觉硬性要求：不做重型模块标题，内容自然接在账户中心功能区下方，靠留白分隔。
 */
(() => {
  "use strict";

  const PANEL_FLAG = "invite";
  const COPY_FEEDBACK_MS = 1600;

  const state = {
    container: null,
    api: null,
    account: null,
    invite: null,
    panel: null,
    panelContainer: null,
    bound: false,
    loading: false,
    submitting: false,
    error: "",
    notice: "",
    codeDraft: "",
    requestId: 0
  };

  const escapeHtml = (value) => String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

  const absoluteInviteLink = (value) => {
    const raw = String(value || "").trim();
    if (!raw) return "";
    if (/^https?:\/\//i.test(raw)) return raw;
    try {
      return new URL(raw, window.location.origin).href;
    } catch (_) {
      return raw;
    }
  };

  const toCount = (value) => {
    const num = Number(value || 0);
    return Number.isFinite(num) && num > 0 ? Math.floor(num) : 0;
  };

  const nowMs = () => Date.now();

  function formatRemaining(deadline) {
    const remaining = Number(deadline || 0) - nowMs();
    if (!(remaining > 0)) return "";
    const totalMinutes = Math.floor(remaining / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours > 0) return `${hours} 小时 ${minutes} 分钟`;
    return `${Math.max(1, minutes)} 分钟`;
  }

  async function copyTextToClipboard(text) {
    const value = String(text || "");
    if (!value) return false;
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        await navigator.clipboard.writeText(value);
        return true;
      }
    } catch (_) {}
    try {
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      textarea.style.top = "0";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      textarea.setSelectionRange(0, textarea.value.length);
      const copied = document.execCommand && document.execCommand("copy");
      textarea.remove();
      return Boolean(copied);
    } catch (_) {
      return false;
    }
  }

  // 奖励系统已全量开放：是否可见只听后端（reward-visibility 唯一 policy）给出的
  // account.rewardSystemEnabled；前端不自己判断灰度。字段缺失（尚未部署新 shexAuth）时
  // 保守回落到旧规则「仅管理员」，保证先发静态、后发云函数时普通用户也不会拿到一个必然报错的面板。
  function isVisible(account) {
    if (!account || typeof account !== "object") return false;
    if (typeof account.rewardSystemEnabled === "boolean") return account.rewardSystemEnabled;
    return account.isAdmin === true;
  }

  function ensurePanel() {
    const container = state.container;
    if (!container) return null;
    if (state.panel && state.panelContainer === container) return state.panel;
    const panel = document.createElement("section");
    panel.className = "x-energy-invite-block";
    panel.setAttribute("data-energy-reward-panel", PANEL_FLAG);
    container.appendChild(panel);
    state.panel = panel;
    state.panelContainer = container;
    return panel;
  }

  function teardownPanel() {
    const panel = state.panel;
    if (panel && typeof panel.remove === "function") {
      try { panel.remove(); } catch (_) {}
    }
    state.panel = null;
    state.panelContainer = null;
  }

  function normalizeInvite(invite) {
    if (!invite || typeof invite !== "object") return null;
    return {
      inviteCode: String(invite.inviteCode || ""),
      // 后端只给规范化的相对路径（路径形状的单一来源），
      // 前端拼上当前站点 origin 才是可以直接发给别人的绝对链接。
      inviteLink: absoluteInviteLink(invite.inviteLink),
      successfulInviteCount: toCount(invite.successfulInviteCount),
      nextInviteRewardAmount: toCount(invite.nextInviteRewardAmount),
      remainingToNextTier: toCount(invite.remainingToNextTier),
      nextTierRewardAmount: toCount(invite.nextTierRewardAmount),
      isHighestTier: invite.isHighestTier === true,
      // 产品合同 §7：金额只有服务端一个权威源，前端不得硬编码兜底值。
      // 后端没给就不展示这句说明，而不是猜一个数字。
      inviteeRewardAmount: toCount(invite.inviteeRewardAmount),
      onboardingRewardClaimed: invite.onboardingRewardClaimed === true,
      makeupWindowDeadline: toCount(invite.makeupWindowDeadline)
    };
  }

  function extractInvite(payload) {
    if (!payload || typeof payload !== "object") return null;
    if (payload.invite && typeof payload.invite === "object") return normalizeInvite(payload.invite);
    if (payload.data && typeof payload.data === "object" && payload.data.invite) {
      return normalizeInvite(payload.data.invite);
    }
    if (typeof payload.inviteCode === "string") return normalizeInvite(payload);
    return null;
  }

  function readErrorMessage(payload, fallback) {
    if (payload && typeof payload === "object") {
      const message = payload.message || payload.errMsg || (payload.error && payload.error.message);
      if (message) return String(message);
    }
    return fallback;
  }

  function renderProgressRows(invite) {
    const rows = [];
    rows.push(`
          <div class="x-energy-invite-row" data-energy-invite-progress="count">
            <span class="x-energy-invite-row-label">已成功邀请</span>
            <strong class="x-energy-invite-row-value">${escapeHtml(invite.successfulInviteCount)}人</strong>
          </div>`);
    rows.push(`
          <div class="x-energy-invite-row" data-energy-invite-progress="next">
            <span class="x-energy-invite-row-label">下一位邀请</span>
            <strong class="x-energy-invite-row-value">+${escapeHtml(invite.nextInviteRewardAmount)} X能量</strong>
          </div>`);
    // 产品方定稿：档位进度合成一句话，避免边界处（已邀请3人/10人）出现
    // “下一位 +50”与“再邀请1人进入50档”两行数字相同的重复观感。
    if (!invite.isHighestTier && invite.remainingToNextTier > 0) {
      rows.push(`
          <div class="x-energy-invite-row" data-energy-invite-progress="next-tier">
            <span class="x-energy-invite-row-label">再邀请${escapeHtml(invite.remainingToNextTier)}人</span>
            <strong class="x-energy-invite-row-value">每人 +${escapeHtml(invite.nextTierRewardAmount)} X能量</strong>
          </div>`);
    }
    return rows.join("");
  }

  function renderCopyRows(invite) {
    const code = invite.inviteCode;
    const link = invite.inviteLink;
    const codeRow = `
          <div class="x-energy-invite-copy-row" data-energy-invite-field="code">
            <span class="x-energy-invite-copy-label">我的邀请码</span>
            <code class="x-energy-invite-code">${escapeHtml(code || "—")}</code>
            <button class="x-energy-invite-copy" type="button"
              data-energy-invite-copy="${escapeHtml(code)}"
              data-energy-invite-copy-label="复制"${code ? "" : " disabled"}>复制</button>
          </div>`;
    const linkRow = `
          <div class="x-energy-invite-copy-row" data-energy-invite-field="link">
            <span class="x-energy-invite-copy-label">邀请链接</span>
            <span class="x-energy-invite-link">${escapeHtml(link || "—")}</span>
            <button class="x-energy-invite-copy" type="button"
              data-energy-invite-copy="${escapeHtml(link)}"
              data-energy-invite-copy-label="复制链接"${link ? "" : " disabled"}>复制链接</button>
          </div>`;
    return codeRow + linkRow;
  }

  function renderMakeup(invite) {
    if (invite.onboardingRewardClaimed === true) return "";
    if (!(invite.makeupWindowDeadline > 0)) return "";
    const remaining = formatRemaining(invite.makeupWindowDeadline);
    const hint = remaining
      ? `还剩 ${remaining}，逾期不再发放。`
      : "补填窗口即将关闭，逾期不再发放。";
    return `
        <form class="x-energy-invite-makeup" data-energy-invite-makeup>
          <span class="x-energy-invite-makeup-label">补填邀请码</span>
          <div class="x-energy-invite-makeup-row">
            <input class="x-energy-invite-makeup-input" type="text" maxlength="16"
              autocomplete="off" spellcheck="false" placeholder="输入好友的邀请码"
              data-energy-invite-code-input value="${escapeHtml(state.codeDraft)}"${state.submitting ? " disabled" : ""}>
            <button class="x-energy-invite-makeup-submit" type="submit"
              data-energy-invite-submit${state.submitting ? " disabled" : ""}>${state.submitting ? "提交中…" : "提交"}</button>
          </div>
          <p class="x-energy-invite-makeup-hint">${escapeHtml(hint)}</p>
        </form>`;
  }

  function renderPanelHtml(invite) {
    if (!invite) {
      const message = state.error || (state.loading ? "邀请信息加载中…" : "邀请信息暂不可用。");
      return `
      <article class="x-energy-reward-card x-energy-invite-card" data-energy-reward-card="invite">
        <div class="x-energy-invite-body">
          <p class="x-energy-invite-placeholder" data-energy-invite-placeholder>${escapeHtml(message)}</p>
        </div>
      </article>`;
    }
    const statusText = state.error || state.notice || (state.loading ? "刷新中…" : "");
    const statusTone = state.error ? "error" : "info";
    return `
      <article class="x-energy-reward-card x-energy-invite-card" data-energy-reward-card="invite">
        <div class="x-energy-invite-body">
          <div class="x-energy-invite-progress" data-energy-invite-progress-group>${renderProgressRows(invite)}
          </div>
          <div class="x-energy-invite-share">${renderCopyRows(invite)}
          </div>
          ${invite.inviteeRewardAmount > 0 ? `<p class="x-energy-invite-note">邀请好友，对方也得 ${escapeHtml(invite.inviteeRewardAmount)} X能量。</p>` : ""}${renderMakeup(invite)}
          <p class="x-energy-invite-status" data-energy-invite-status data-tone="${escapeHtml(statusTone)}" aria-live="polite"${statusText ? "" : " hidden"}>${escapeHtml(statusText)}</p>
        </div>
      </article>`;
  }

  function render(summary) {
    if (summary && typeof summary === "object") {
      if (Object.prototype.hasOwnProperty.call(summary, "account")) {
        state.account = summary.account || null;
      }
      if (Object.prototype.hasOwnProperty.call(summary, "invite")) {
        const invite = normalizeInvite(summary.invite);
        if (invite) state.invite = invite;
      }
    }
    const container = state.container;
    if (!container) return null;
    if (!isVisible(state.account)) {
      teardownPanel();
      container.hidden = true;
      return null;
    }
    const panel = ensurePanel();
    if (!panel) return null;
    container.hidden = false;
    panel.hidden = false;
    panel.innerHTML = renderPanelHtml(state.invite);
    return panel;
  }

  function renderCurrent() {
    return render(null);
  }

  function setStatus(message, tone) {
    if (tone === "error") {
      state.error = String(message || "");
      state.notice = "";
    } else {
      state.notice = String(message || "");
      state.error = "";
    }
    renderCurrent();
  }

  async function handleCopy(button) {
    const value = button.getAttribute ? (button.getAttribute("data-energy-invite-copy") || "") : "";
    if (!value) return;
    const label = (button.getAttribute && button.getAttribute("data-energy-invite-copy-label")) || button.textContent;
    const copied = await copyTextToClipboard(value);
    if (!copied) {
      setStatus("复制失败，请手动选中复制", "error");
      return;
    }
    button.textContent = "已复制";
    window.setTimeout(() => {
      try { button.textContent = label; } catch (_) {}
    }, COPY_FEEDBACK_MS);
  }

  async function handleSubmitInviteCode() {
    const api = state.api;
    const code = String(state.codeDraft || "").trim().toUpperCase();
    if (!code) {
      setStatus("请先填写好友的邀请码", "error");
      return;
    }
    if (!api || typeof api.submitInviteCode !== "function") {
      setStatus("暂时无法提交，请稍后再试", "error");
      return;
    }
    state.submitting = true;
    state.error = "";
    state.notice = "";
    renderCurrent();
    let payload = null;
    try {
      payload = await api.submitInviteCode({ inviteCode: code });
    } catch (error) {
      state.submitting = false;
      setStatus(readErrorMessage(error, "补填失败，请稍后再试"), "error");
      return;
    }
    state.submitting = false;
    const ok = Boolean(payload && (payload.success === true || payload.applied === true
      || (payload.data && payload.data.applied === true)));
    if (!ok) {
      setStatus(readErrorMessage(payload, "邀请码无效或补填窗口已结束"), "error");
      return;
    }
    state.codeDraft = "";
    state.notice = "补填成功，奖励已发放。";
    state.error = "";
    await refresh();
  }

  function bindEvents(container) {
    if (!container || typeof container.addEventListener !== "function") return;
    container.addEventListener("click", (event) => {
      const target = event && event.target;
      if (!target || typeof target.closest !== "function") return;
      const copyButton = target.closest("[data-energy-invite-copy]");
      if (!copyButton) return;
      if (typeof event.preventDefault === "function") event.preventDefault();
      void handleCopy(copyButton);
    });
    container.addEventListener("input", (event) => {
      const target = event && event.target;
      if (!target || typeof target.closest !== "function") return;
      if (!target.closest("[data-energy-invite-code-input]")) return;
      state.codeDraft = String(target.value || "");
    });
    container.addEventListener("submit", (event) => {
      const target = event && event.target;
      if (!target || typeof target.closest !== "function") return;
      if (!target.closest("[data-energy-invite-makeup]")) return;
      if (typeof event.preventDefault === "function") event.preventDefault();
      void handleSubmitInviteCode();
    });
  }

  function mount(options) {
    const config = options || {};
    const container = config.container || null;
    if (!container) return null;
    if (state.container !== container) {
      teardownPanel();
      state.invite = null;
      state.error = "";
      state.notice = "";
      state.codeDraft = "";
      state.loading = false;
      state.submitting = false;
      state.bound = false;
    }
    state.container = container;
    state.api = config.api || state.api || null;
    if (config.summary) render(config.summary);
    if (!state.bound) {
      bindEvents(container);
      state.bound = true;
    }
    if (container.hidden !== true && !isVisible(state.account)) container.hidden = true;
    return container;
  }

  async function refresh() {
    const api = state.api;
    if (!isVisible(state.account)) {
      renderCurrent();
      return null;
    }
    if (!api || typeof api.getMyInviteInfo !== "function") return null;
    const requestId = ++state.requestId;
    state.loading = true;
    renderCurrent();
    let payload = null;
    try {
      payload = await api.getMyInviteInfo();
    } catch (error) {
      if (requestId !== state.requestId) return null;
      state.loading = false;
      setStatus(readErrorMessage(error, "邀请信息加载失败，请稍后再试"), "error");
      return null;
    }
    if (requestId !== state.requestId) return null;
    state.loading = false;
    const invite = extractInvite(payload);
    if (invite) {
      state.invite = invite;
      state.error = "";
    } else {
      state.error = readErrorMessage(payload, "邀请信息加载失败，请稍后再试");
    }
    renderCurrent();
    return invite;
  }

  window.SHEXRewardPanel = {
    isVisible,
    mount,
    render,
    refresh
  };
})();
