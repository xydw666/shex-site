/**
 * SHE.X 内容奖励「提交申请 + 奖励申请记录」前端模块（独立文件）。
 *
 * 契约（主控统一接线，签名不得更改）：
 *   window.SHEXRewardSubmitPanel = {
 *     isVisible(account),                            // 后端 account.rewardSystemEnabled 决定；旧后端缺该字段时回落到 isAdmin === true
 *     mount({ container, api }),                     // 一次性建结构 + 绑事件，幂等
 *     render({ account, applications, rewardCatalog }),
 *     refresh()                                      // 重新拉 getMyRewardApplications 并 render
 *   }
 *   api = { submitRewardApplication(payload), getMyRewardApplications(options), uploadProof(file) }
 *
 * 金额零硬编码（产品方 §7 硬约束）：
 *   本文件**不存在任何奖励金额常量**。所有金额（评论 / 发布 / 点赞各档位）与每日次数上限
 *   只能来自 render({ rewardCatalog }) 或 refresh() 拉回的 rewardCatalog：
 *     { comment:{amount, dailyLimit},
 *       work_publish_24h:{amount, dailyLimit},
 *       work_like_milestone:{tiers:[{tier, amount}], dailyLimit},
 *       dating_promo:{amount, dailyLimit}, moments_promo:{amount, dailyLimit} }
 *   rewardCatalog 缺失时：表单照常渲染，但一个金额字符都不显示（绝不使用兜底数字）。
 *   已发放记录的金额同理——优先读后端直给的 grantedAmount，否则按 rewardCatalog 换算，
 *   两者都拿不到就不显示金额。
 *
 * 视觉硬性要求：不做重型模块标题（无 h1/h2/h3、无任何 APP 级大标题），三个入口默认收起。
 * 独立性：自带 escapeHtml，不依赖 energy.js / reward-panel.js 的任何内部函数。
 */
(() => {
  "use strict";

  const PANEL_FLAG = "content-submit";
  const PROOF_KIND = "reward-proof";
  const MAX_PROOF_ASSETS = 6;
  const COMMENT_TYPE = "comment";
  const PUBLISH_TYPE = "work_publish_24h";
  const LIKE_TYPE = "work_like_milestone";
  const CREATOR_TYPE = "limited_creator_reward";
  const DATING_PROMO_TYPE = "dating_promo";
  const MOMENTS_PROMO_TYPE = "moments_promo";

  const PLATFORMS = Object.freeze([
    Object.freeze({ value: "douyin", label: "抖音" }),
    Object.freeze({ value: "xiaohongshu", label: "小红书" }),
    Object.freeze({ value: "bilibili", label: "B站" }),
    Object.freeze({ value: "kuaishou", label: "快手" })
  ]);
  const PLATFORM_VALUES = PLATFORMS.map((item) => item.value);

  const TABS = Object.freeze([
    Object.freeze({ type: COMMENT_TYPE, label: "评论奖励" }),
    Object.freeze({ type: PUBLISH_TYPE, label: "发布作品奖励" }),
    Object.freeze({ type: LIKE_TYPE, label: "点赞里程碑奖励" })
  ]);
  // 专项宣传奖励：与「发布作品奖励」同一条提交 / 审核 / 发放路线，各自是独立卡片。
  const PROMO_CARDS = Object.freeze([
    Object.freeze({
      type: DATING_PROMO_TYPE,
      title: "X约会宣传奖励",
      subject: "分享你的 X约会双人照或约会小故事",
      hint: "可宣传约会照片（双人合影）或 X约会小故事。"
    }),
    Object.freeze({
      type: MOMENTS_PROMO_TYPE,
      title: "朋友圈宣传奖励",
      subject: "分享你的 X朋友圈动态或互动体验",
      hint: "可分享 X朋友圈动态或互动体验。"
    })
  ]);
  const PROMO_TYPES = PROMO_CARDS.map((item) => item.type);
  const SUBMISSION_TYPES = TABS.map((item) => item.type).concat(CREATOR_TYPE, PROMO_TYPES);

  const REWARD_TYPE_LABELS = Object.freeze({
    comment: "评论奖励",
    work_publish_24h: "发布作品奖励",
    work_like_milestone: "点赞里程碑奖励",
    limited_creator_reward: "限时创作者奖励",
    dating_promo: "X约会宣传奖励",
    moments_promo: "朋友圈宣传奖励"
  });

  // 后端 submission 只有 pending/approved/rejected/granted 四态；
  // approved = 审核已通过、发放流程进行中，文案与 admin.js 保持一致。
  const STATUS_LABELS = Object.freeze({
    pending: "待审核",
    approved: "已通过·发放中",
    rejected: "已驳回",
    granted: "已发放"
  });

  const state = {
    container: null,
    creatorContainer: null,
    historyContainer: null,
    showCreatorEntry: true,
    api: null,
    account: null,
    applications: [],
    rewardCatalog: null,
    panel: null,
    panelContainer: null,
    boundContainers: new WeakSet(),
    loading: false,
    submitting: false,
    activeTab: "",
    historyError: "",
    drafts: {},
    requestId: 0,
    creatorWorks: [],
    creatorActivity: null,
    creatorCursors: null,
    creatorHasMore: false,
    creatorLoading: false,
    creatorError: "",
    creatorNotice: "",
    creatorSelectedWorkId: "",
    creatorRequestId: 0,
    creatorGeneration: 0,
    creatorAccountKey: ""
  };

  const escapeHtml = (value) => String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

  const hasOwn = (target, key) => Object.prototype.hasOwnProperty.call(target, key);

  function positiveInt(value) {
    const parsed = Math.floor(Number(value));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }

  function text(value) {
    return String(value === undefined || value === null ? "" : value).trim();
  }

  function createDraft() {
    return { platform: "", workUrl: "", likeCount: "", files: [], error: "", notice: "" };
  }

  function resetDrafts() {
    const drafts = {};
    SUBMISSION_TYPES.forEach((type) => { drafts[type] = createDraft(); });
    state.drafts = drafts;
  }

  resetDrafts();

  function draftFor(type) {
    const key = text(type);
    return hasOwn(state.drafts, key) ? state.drafts[key] : null;
  }

  function formatTime(value) {
    const ts = positiveInt(value);
    if (!ts) return "";
    const date = new Date(ts);
    const pad = (num) => String(num).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} `
      + `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  /* ---------------------------------------------------------------- *
   * rewardCatalog：唯一金额来源
   * ---------------------------------------------------------------- */

  function catalogEntry(rewardType) {
    const catalog = state.rewardCatalog;
    if (!catalog || typeof catalog !== "object") return null;
    const entry = catalog[text(rewardType)];
    return entry && typeof entry === "object" ? entry : null;
  }

  function catalogAmount(rewardType) {
    const entry = catalogEntry(rewardType);
    return entry ? positiveInt(entry.amount) : 0;
  }

  function catalogDailyLimit(rewardType) {
    const entry = catalogEntry(rewardType);
    if (!entry) return -1; // -1 = 无 catalog，次数未知，一律不显示数字
    return positiveInt(entry.dailyLimit);
  }

  function catalogTiers(rewardType) {
    const entry = catalogEntry(rewardType);
    if (!entry || !Array.isArray(entry.tiers)) return [];
    return entry.tiers
      .map((item) => ({ tier: positiveInt(item && item.tier), amount: positiveInt(item && item.amount) }))
      .filter((item) => item.tier > 0 && item.amount > 0);
  }

  /** 已发放金额：后端直给优先 → rewardCatalog 换算 → 都没有则空字符串（绝不兜底数字）。 */
  function grantedAmountText(record) {
    const direct = positiveInt(record.grantedAmount) || positiveInt(record.grantedTotalAmount);
    if (direct > 0) return `${direct} X能量`;
    if (record.rewardType === LIKE_TYPE) {
      const tiers = catalogTiers(LIKE_TYPE);
      const grantedTiers = Array.isArray(record.grantedTiers) ? record.grantedTiers : [];
      if (!tiers.length || !grantedTiers.length) return "";
      let total = 0;
      let matched = 0;
      grantedTiers.forEach((value) => {
        const tier = positiveInt(value);
        const hit = tiers.filter((item) => item.tier === tier)[0];
        if (hit) {
          total += hit.amount;
          matched += 1;
        }
      });
      if (matched !== grantedTiers.length || total <= 0) return "";
      return `${total} X能量`;
    }
    const amount = catalogAmount(record.rewardType);
    return amount > 0 ? `${amount} X能量` : "";
  }

  /* ---------------------------------------------------------------- *
   * 数据规整
   * ---------------------------------------------------------------- */

  function normalizeApplication(row) {
    if (!row || typeof row !== "object") return null;
    const rewardType = text(row.rewardType);
    if (!rewardType) return null;
    return {
      requestId: text(row.requestId),
      rewardType,
      platform: text(row.platform),
      workUrl: text(row.workUrl),
      reportedLikeCount: positiveInt(row.reportedLikeCount),
      status: text(row.status),
      reviewNote: text(row.reviewNote),
      grantedTiers: Array.isArray(row.grantedTiers) ? row.grantedTiers.slice() : [],
      grantedAmount: positiveInt(row.grantedAmount),
      grantedTotalAmount: positiveInt(row.grantedTotalAmount),
      submittedAt: positiveInt(row.submittedAt),
      workId: text(row.workId),
      workType: text(row.workType),
      workTitle: text(row.workTitle),
      creatorDisplayName: text(row.creatorDisplayName),
      rewardAmount: positiveInt(row.rewardAmount),
      activityId: text(row.activityId)
    };
  }

  function normalizeApplications(value) {
    let rows = [];
    if (Array.isArray(value)) rows = value;
    else if (value && typeof value === "object" && Array.isArray(value.items)) rows = value.items;
    const list = [];
    rows.forEach((row) => {
      const record = normalizeApplication(row);
      if (record) list.push(record);
    });
    return list;
  }

  function extractApplications(payload) {
    if (!payload || typeof payload !== "object") return [];
    if (Array.isArray(payload.items)) return normalizeApplications(payload.items);
    if (Array.isArray(payload.applications)) return normalizeApplications(payload.applications);
    if (payload.data && typeof payload.data === "object" && Array.isArray(payload.data.items)) {
      return normalizeApplications(payload.data.items);
    }
    if (payload.data && typeof payload.data === "object" && Array.isArray(payload.data.applications)) {
      return normalizeApplications(payload.data.applications);
    }
    if (Array.isArray(payload)) return normalizeApplications(payload);
    return [];
  }

  function extractCatalog(payload) {
    if (!payload || typeof payload !== "object") return null;
    if (payload.rewardCatalog && typeof payload.rewardCatalog === "object") return payload.rewardCatalog;
    if (payload.data && typeof payload.data === "object"
      && payload.data.rewardCatalog && typeof payload.data.rewardCatalog === "object") {
      return payload.data.rewardCatalog;
    }
    return null;
  }

  function readErrorMessage(payload, fallback) {
    if (payload && typeof payload === "object") {
      const message = payload.message || payload.detail || payload.errMsg
        || (payload.error && payload.error.message);
      if (message) return String(message);
    }
    return fallback;
  }

  function isOkPayload(payload) {
    if (!payload || typeof payload !== "object") return false;
    if (payload.success === true || payload.ok === true) return true;
    if (payload.data && typeof payload.data === "object") {
      if (payload.data.success === true || payload.data.ok === true) return true;
      if (text(payload.data.requestId)) return true;
    }
    return Boolean(text(payload.requestId));
  }

  /* ---------------------------------------------------------------- *
   * 可见性 / 面板骨架
   * ---------------------------------------------------------------- */

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
    panel.className = "x-energy-submit-block";
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
    const creatorContainer = state.creatorContainer;
    if (creatorContainer) {
      creatorContainer.innerHTML = "";
      creatorContainer.hidden = true;
    }
    if (state.historyContainer) {
      state.historyContainer.innerHTML = "";
      state.historyContainer.hidden = true;
    }
  }

  /* ---------------------------------------------------------------- *
   * 表单渲染
   * ---------------------------------------------------------------- */

  function renderDailyLimitHint(rewardType) {
    if (rewardType === LIKE_TYPE) return "不限每日申请次数。";
    const limit = catalogDailyLimit(rewardType);
    if (limit < 0) return "每日申请次数以系统规则为准。";
    if (limit === 0) return "不限每日申请次数。";
    return `每天最多申请 ${limit} 次（被驳回的申请同样占用当日名额）。`;
  }

  /**
   * 点赞里程碑展示的是「累计可得」，不是单档金额：把 tiers 按 tier 升序显式排序后
   * 逐档累加 amount，每一档展示的都是从最低档到当前档的累计值。累加结果（80/200/400/…）
   * 全部是运行期从 rewardCatalog 算出来的，源码里不允许出现这些数字字面量。
   */
  function cumulativeLikeTiers() {
    const tiers = catalogTiers(LIKE_TYPE).slice().sort((a, b) => a.tier - b.tier);
    let cumulativeAmount = 0;
    return tiers.map((item) => {
      cumulativeAmount += item.amount;
      return { tier: item.tier, cumulativeAmount };
    });
  }

  function renderAmountHint(rewardType) {
    if (rewardType === LIKE_TYPE) {
      const tiers = cumulativeLikeTiers();
      if (!tiers.length) return "";
      const rows = tiers
        .map((item) => `<li class="x-energy-submit-tier">${escapeHtml(item.tier)}赞：累计可得 ${escapeHtml(item.cumulativeAmount)} X能量</li>`)
        .join("");
      return `
            <ul class="x-energy-submit-tier-list" data-energy-submit-amount="${escapeHtml(rewardType)}">${rows}
            </ul>
            <p class="x-energy-submit-tier-note">点赞持续增长后，可以继续补领更高档位，已经领取过的档位不会重复发放。</p>`;
    }
    const amount = catalogAmount(rewardType);
    if (!amount) return "";
    return `
            <p class="x-energy-submit-amount" data-energy-submit-amount="${escapeHtml(rewardType)}">审核通过后发放 ${escapeHtml(amount)} X能量。</p>`;
  }

  function ruleLines(rewardType) {
    if (rewardType === COMMENT_TYPE) {
      return [
        "评论需公开保留满 24 小时，提前删除或隐藏视为无效。",
        "截图需能看到评论账号昵称、评论正文与时间信息。",
        renderDailyLimitHint(COMMENT_TYPE),
        "评论奖励只需上传截图，无需选择平台、也无需填写作品链接。"
      ];
    }
    if (PROMO_TYPES.indexOf(rewardType) >= 0) {
      const card = PROMO_CARDS.filter((item) => item.type === rewardType)[0];
      return [
        card.hint,
        "作品需公开发布并保留满 24 小时，必须带话题 #SHEX。",
        "支持抖音、小红书、B站、快手，请提交作品链接和截图，等待管理员审核。",
        "同一个作品只能参加一个奖励活动，请勿重复参加。",
        renderDailyLimitHint(rewardType)
      ];
    }
    if (rewardType === PUBLISH_TYPE) {
      return [
        "作品需公开发布并保留满 24 小时。",
        "作品内容必须与 SHE.X 明确相关。",
        "作品必须带话题 #SHEX。",
        renderDailyLimitHint(PUBLISH_TYPE)
      ];
    }
    return [
      "支持一次性补领所有已达标档位。",
      "同一档位只能领取一次。",
      renderDailyLimitHint(LIKE_TYPE),
      "不要求先领取发布作品奖励，直接申请即可。",
      "「当前点赞数」选填，仅供管理员核对参考。"
    ];
  }

  function renderRules(rewardType) {
    const rows = ruleLines(rewardType)
      .map((line) => `<li class="x-energy-submit-rule">${escapeHtml(line)}</li>`)
      .join("");
    return `
            <ul class="x-energy-submit-rules" data-energy-submit-rules="${escapeHtml(rewardType)}">${rows}
            </ul>`;
  }

  function fileNameOf(file, index) {
    const name = file && file.name ? String(file.name) : "";
    return name || `截图 ${index + 1}`;
  }

  function renderProofField(rewardType, draft) {
    const label = rewardType === COMMENT_TYPE ? "评论截图" : "作品截图";
    const count = draft.files.length;
    const triggerText = count > 0 ? `已选 ${count} 张` : "选择图片";
    const names = draft.files
      .map((file, index) => `<li class="x-energy-submit-file">${escapeHtml(fileNameOf(file, index))}</li>`)
      .join("");
    return `
            <label class="x-energy-submit-field">
              <span class="x-energy-submit-label">${escapeHtml(label)}（必填，1-${MAX_PROOF_ASSETS} 张）</span>
              <span class="x-energy-submit-file-trigger" data-energy-submit-file-trigger="${escapeHtml(rewardType)}" data-disabled="${state.submitting ? "true" : "false"}">
                <span class="x-energy-submit-file-trigger-text" data-energy-submit-file-trigger-text="${escapeHtml(rewardType)}">${escapeHtml(triggerText)}</span>
                <input class="x-energy-submit-file-input" type="file" accept="image/*" multiple
                  data-energy-submit-proof="${escapeHtml(rewardType)}"${state.submitting ? " disabled" : ""}>
              </span>
            </label>
            <ul class="x-energy-submit-file-list" data-energy-submit-file-list="${escapeHtml(rewardType)}"${names ? "" : " hidden"}>${names}
            </ul>`;
  }

  function renderPlatformField(rewardType, draft) {
    const options = PLATFORMS
      .map((item) => `<option value="${escapeHtml(item.value)}"${draft.platform === item.value ? " selected" : ""}>${escapeHtml(item.label)}</option>`)
      .join("");
    return `
            <label class="x-energy-submit-field">
              <span class="x-energy-submit-label">发布平台（必选）</span>
              <select class="x-energy-submit-select"
                data-energy-submit-platform="${escapeHtml(rewardType)}"${state.submitting ? " disabled" : ""}>
                <option value=""${draft.platform ? "" : " selected"}>请选择平台</option>${options}
              </select>
            </label>`;
  }

  function renderWorkUrlField(rewardType, draft) {
    return `
            <label class="x-energy-submit-field">
              <span class="x-energy-submit-label">作品链接（必填）</span>
              <input class="x-energy-submit-input" type="text" autocomplete="off" spellcheck="false"
                placeholder="直接粘贴平台分享文案或作品链接"
                data-energy-submit-work-url="${escapeHtml(rewardType)}"
                value="${escapeHtml(draft.workUrl)}"${state.submitting ? " disabled" : ""}>
            </label>`;
  }

  function renderLikeCountField(rewardType, draft) {
    return `
            <label class="x-energy-submit-field">
              <span class="x-energy-submit-label">当前点赞数（选填）</span>
              <input class="x-energy-submit-input" type="number" min="0" inputmode="numeric"
                placeholder="仅供管理员参考，可留空"
                data-energy-submit-like-count="${escapeHtml(rewardType)}"
                value="${escapeHtml(draft.likeCount)}"${state.submitting ? " disabled" : ""}>
            </label>`;
  }

  function creatorActivity() {
    return state.creatorActivity || catalogEntry(CREATOR_TYPE) || null;
  }

  function creatorWorkKey(work) {
    return `${text(work && work.workType)}:${text(work && work.workId)}`;
  }

  function renderCreatorWorks() {
    const activity = creatorActivity();
    const rows = state.creatorWorks.map((work) => {
      const key = creatorWorkKey(work);
      const selected = state.creatorSelectedWorkId === key;
      const amount = positiveInt(work.rewardAmount);
      return `<article class="x-energy-submit-creator-work" data-energy-submit-creator-work="${escapeHtml(key)}" data-reward-amount="${amount || ""}">
        <div class="x-energy-submit-creator-work-copy"><strong>${escapeHtml(work.workTitle || "未命名作品")}</strong><span>${work.workType === "world_simulator" ? "世界模拟器" : "单人角色"}${work.creatorDisplayName ? ` · ${escapeHtml(work.creatorDisplayName)}` : ""}</span></div>
        ${amount ? `<span class="x-energy-submit-creator-amount">${amount} X能量</span>` : ""}
        <label class="x-energy-submit-creator-choice"><input type="radio" name="energy-submit-creator-work" data-energy-submit-creator-choice="${escapeHtml(key)}" value="${escapeHtml(key)}"${selected ? " checked" : ""}${!activity || activity.enabled !== true || state.submitting ? " disabled" : ""}>选择此作品</label>
      </article>`;
    }).join("");
    const rules = activity ? `<p class="x-energy-submit-creator-rules" data-energy-submit-creator-rules>单人角色：${positiveInt(activity.singleReward) || "—"} X能量；世界模拟器：${positiveInt(activity.simulatorReward) || "—"} X能量。活动期间发布符合基本使用要求的作品，通过审核后获得 X能量。作品需有正常宣传图和基本内容，无明显乱码、空壳或大量测试内容，并可正常使用。同一作品本期仅可获得一次奖励；驳回后修好可重新申请。奖励通过后自动发放到账号，为无限期 X能量，无需兑换。</p>` : "";
    const empty = !state.creatorLoading && !state.creatorError && !rows
      ? `<p class="x-energy-submit-empty">暂时没有可申请的已发布作品。</p>` : "";
    return `<section class="x-energy-submit-creator" data-energy-submit-creator-works>
      ${rules}${state.creatorError ? `<p class="x-energy-submit-status" data-tone="error">${escapeHtml(state.creatorError)}</p>` : ""}
      ${state.creatorLoading ? `<p class="x-energy-submit-empty">正在读取已发布作品…</p>` : ""}${empty}${rows}
      <button type="button" class="x-energy-submit-action" data-energy-submit-creator-apply${!activity || activity.enabled !== true || !state.creatorSelectedWorkId || state.submitting ? " disabled" : ""}>${state.submitting ? "提交中…" : "提交申请"}</button>
      ${state.creatorHasMore ? `<button type="button" class="x-energy-submit-retry" data-energy-submit-works-more${state.creatorLoading ? " disabled" : ""}>${state.creatorLoading ? "加载中…" : "查看更多作品"}</button>` : ""}
      <p class="x-energy-submit-status" data-energy-submit-creator-status data-tone="info" aria-live="polite">${escapeHtml(state.creatorNotice)}</p>
    </section>`;
  }

  async function loadCreatorWorks(reset) {
    const api = state.api;
    if (!api || typeof api.getLimitedCreatorRewardWorks !== "function") {
      state.creatorError = "暂时无法读取已发布作品，请稍后重试";
      state.creatorLoading = false;
      renderCurrent();
      return;
    }
    if (reset) {
      state.creatorWorks = [];
      state.creatorCursors = { single_character: "", world_simulator: "" };
      state.creatorHasMore = false;
    }
    const requestId = ++state.creatorRequestId;
    const generation = state.creatorGeneration;
    const cursors = state.creatorCursors || { single_character: "", world_simulator: "" };
    state.creatorLoading = true;
    state.creatorError = "";
    state.creatorNotice = "";
    renderCurrent();
    let response;
    try {
      response = await api.getLimitedCreatorRewardWorks({ cursors: { ...cursors }, limit: 20 });
    } catch (error) {
      if (requestId !== state.creatorRequestId || generation !== state.creatorGeneration || state.activeTab !== CREATOR_TYPE) return;
      state.creatorLoading = false;
      state.creatorError = readErrorMessage(error, "作品加载失败，请稍后重试");
      renderCurrent();
      return;
    }
    if (requestId !== state.creatorRequestId || generation !== state.creatorGeneration || state.activeTab !== CREATOR_TYPE) return;
    state.creatorLoading = false;
    if (!isOkPayload(response)) {
      state.creatorError = readErrorMessage(response, "作品加载失败，请稍后重试");
      renderCurrent();
      return;
    }
    const page = response.data && typeof response.data === "object" ? response.data : response;
    const activity = page.activity && typeof page.activity === "object" ? page.activity : null;
    if (activity) state.creatorActivity = activity;
    const catalogActivity = catalogEntry(CREATOR_TYPE);
    const enabledActivity = activity || catalogActivity;
    if (enabledActivity && enabledActivity.enabled === false && catalogActivity) {
      state.rewardCatalog[CREATOR_TYPE] = { ...catalogActivity, enabled: false };
    }
    const items = Array.isArray(page.items) ? page.items : [];
    const seen = new Set(state.creatorWorks.map((item) => creatorWorkKey(item)));
    items.forEach((item) => {
      const key = creatorWorkKey(item);
      if (!item || !text(item.workId) || !text(item.workType) || seen.has(key)) return;
      seen.add(key);
      state.creatorWorks.push({
        workId: text(item.workId),
        workType: text(item.workType),
        workTitle: text(item.workTitle),
        creatorDisplayName: text(item.creatorDisplayName),
        rewardAmount: positiveInt(item.rewardAmount)
      });
    });
    if (page.nextCursors && typeof page.nextCursors === "object") {
      state.creatorCursors = {
        single_character: page.nextCursors.single_character == null ? null : page.nextCursors.single_character,
        world_simulator: page.nextCursors.world_simulator == null ? null : page.nextCursors.world_simulator
      };
    }
    state.creatorHasMore = page.hasMore === true
      && state.creatorCursors
      && (state.creatorCursors.single_character != null || state.creatorCursors.world_simulator != null);
    renderCurrent();
  }

  async function submitCreatorWork() {
    const work = state.creatorWorks.find((item) => creatorWorkKey(item) === state.creatorSelectedWorkId);
    const activity = creatorActivity();
    if (!work || !activity || activity.enabled !== true || state.submitting) return;
    const generation = state.creatorGeneration;
    state.submitting = true;
    state.creatorSelectedWorkId = creatorWorkKey(work);
    state.creatorError = "";
    state.creatorNotice = "";
    renderCurrent();
    let response;
    try {
      response = await state.api.submitRewardApplication({
        rewardType: CREATOR_TYPE,
        workId: work.workId,
        workType: work.workType
      });
    } catch (error) {
      if (generation !== state.creatorGeneration) return;
      state.submitting = false;
      state.creatorError = readErrorMessage(error, "提交失败，请稍后重试");
      renderCurrent();
      return;
    }
    if (generation !== state.creatorGeneration) return;
    state.submitting = false;
    if (!isOkPayload(response)) {
      state.creatorError = readErrorMessage(response, "提交失败，请稍后重试");
      renderCurrent();
      return;
    }
    state.creatorNotice = "申请已提交，等待审核。";
    renderCurrent();
    await refresh();
  }

  function renderForm(rewardType) {
    if (rewardType === CREATOR_TYPE) return renderCreatorWorks();
    const draft = draftFor(rewardType);
    if (!draft) return "";
    const isComment = rewardType === COMMENT_TYPE;
    const statusText = draft.error || draft.notice || (state.submitting ? "提交中…" : "");
    const statusTone = draft.error ? "error" : "info";
    const platformField = isComment ? "" : renderPlatformField(rewardType, draft);
    const workUrlField = isComment ? "" : renderWorkUrlField(rewardType, draft);
    const likeCountField = rewardType === LIKE_TYPE ? renderLikeCountField(rewardType, draft) : "";
    return `
          <form class="x-energy-submit-form" data-energy-submit-form="${escapeHtml(rewardType)}">${renderRules(rewardType)}${renderAmountHint(rewardType)}${platformField}${workUrlField}${renderProofField(rewardType, draft)}${likeCountField}
            <button class="x-energy-submit-action" type="submit"
              data-energy-submit-action="${escapeHtml(rewardType)}"${state.submitting ? " disabled" : ""}>${state.submitting ? "提交中…" : "提交申请"}</button>
            <p class="x-energy-submit-status" data-energy-submit-status="${escapeHtml(rewardType)}" data-tone="${escapeHtml(statusTone)}" aria-live="polite"${statusText ? "" : " hidden"}>${escapeHtml(statusText)}</p>
          </form>`;
  }

  function renderTabs() {
    return TABS.map((tab) => {
      const active = state.activeTab === tab.type;
      return `
            <button class="x-energy-submit-tab" type="button"
              data-energy-submit-tab="${escapeHtml(tab.type)}"
              data-active="${active ? "true" : "false"}"
              aria-expanded="${active ? "true" : "false"}">${escapeHtml(tab.label)}</button>`;
    }).join("");
  }

  function renderCreatorEntry() {
    const activity = creatorActivity();
    const enabled = Boolean(activity && activity.enabled === true);
    const singleAmount = activity ? positiveInt(activity.singleReward) : 0;
    const simulatorAmount = activity ? positiveInt(activity.simulatorReward) : 0;
    const amountLine = activity && (singleAmount || simulatorAmount)
      ? `<p class="x-energy-submit-creator-home-amounts"><span>单人角色 · ${singleAmount || "—"}${singleAmount ? " X能量" : ""}</span><span>世界模拟器 · ${simulatorAmount || "—"}${simulatorAmount ? " X能量" : ""}</span></p>`
      : `<span>${activity ? "奖励规则暂不可用" : "奖励规则加载中"}</span>`;
    const actionLabel = enabled ? "申请奖励" : activity ? "活动已结束" : "规则加载中";
    const selector = state.activeTab === CREATOR_TYPE ? renderCreatorWorks() : "";
    return `<article class="x-energy-reward-card x-energy-submit-creator-home" data-energy-submit-creator-entry>
      <div class="x-energy-submit-creator-home-copy"><strong>限时创作者奖励</strong>${amountLine}<p class="x-energy-submit-creator-home-summary">发布符合基础要求的作品，审核通过后自动发放到无限期X能量。</p></div>
      <button type="button" data-energy-submit-tab="${CREATOR_TYPE}"${enabled ? "" : " disabled"}>${actionLabel}</button>
      ${selector ? `<div class="x-energy-submit-creator-home-selector" data-energy-submit-creator-selector>${selector}</div>` : ""}
    </article>`;
  }

  function renderCreatorPanelHtml() {
    return renderCreatorEntry();
  }

  /* ---------------------------------------------------------------- *
   * 奖励申请记录
   * ---------------------------------------------------------------- */

  function renderRecord(record) {
    const statusLabel = STATUS_LABELS[record.status] || "处理中";
    const typeLabel = REWARD_TYPE_LABELS[record.rewardType] || record.rewardType;
    const rejected = record.status === "rejected";
    const canRetry = state.showCreatorEntry || record.rewardType !== CREATOR_TYPE;
    const amountText = record.status === "granted" ? grantedAmountText(record) : "";
    const time = formatTime(record.submittedAt);
    const noteBlock = rejected
      ? `
              <p class="x-energy-submit-record-note" data-energy-submit-review-note="${escapeHtml(record.requestId)}">审核建议：${escapeHtml(record.reviewNote || "管理员未填写审核建议")}</p>
              ${canRetry ? `<button class="x-energy-submit-retry" type="button"
                data-energy-submit-retry="${escapeHtml(record.requestId)}">重新提交</button>` : ""}`
      : "";
    const amountBlock = amountText
      ? `
              <p class="x-energy-submit-record-amount" data-energy-submit-record-amount="${escapeHtml(record.requestId)}">已发放 ${escapeHtml(amountText)}</p>`
      : "";
    const linkBlock = record.workUrl
      ? `
              <p class="x-energy-submit-record-link">${escapeHtml(record.workUrl)}</p>`
        : "";
    const creatorWorkBlock = record.rewardType === CREATOR_TYPE
      ? `<p class="x-energy-submit-record-work">${escapeHtml(record.workTitle || "已选作品")}${record.creatorDisplayName ? ` · ${escapeHtml(record.creatorDisplayName)}` : ""}${record.rewardAmount ? ` · ${record.rewardAmount} X能量` : ""}</p>`
      : "";
    return `
            <li class="x-energy-submit-record" data-energy-submit-record="${escapeHtml(record.requestId)}" data-status="${escapeHtml(record.status)}">
              <div class="x-energy-submit-record-head">
                <span class="x-energy-submit-record-type">${escapeHtml(typeLabel)}</span>
                <span class="x-energy-submit-record-status" data-energy-submit-record-status="${escapeHtml(record.status)}">${escapeHtml(statusLabel)}</span>
              </div>
              <p class="x-energy-submit-record-meta">${escapeHtml(time || "提交时间未知")}</p>${creatorWorkBlock}${linkBlock}${amountBlock}${noteBlock}
            </li>`;
  }

  function renderHistory() {
    if (!state.applications.length) {
      const message = state.historyError
        || (state.loading ? "申请记录加载中…" : "还没有提交过奖励申请。");
      return `
          <p class="x-energy-submit-empty" data-energy-submit-empty>${escapeHtml(message)}</p>`;
    }
    const rows = state.applications.map(renderRecord).join("");
    const errorLine = state.historyError
      ? `
          <p class="x-energy-submit-status" data-tone="error">${escapeHtml(state.historyError)}</p>`
      : "";
    return `
          <ul class="x-energy-submit-record-list" data-energy-submit-record-list>${rows}
          </ul>${errorLine}`;
  }

  function renderPromotionIntro() {
    const comment = catalogAmount(COMMENT_TYPE);
    const publish = catalogAmount(PUBLISH_TYPE);
    const tiers = cumulativeLikeTiers();
    const highest = tiers.length ? tiers[tiers.length - 1].cumulativeAmount : 0;
    const basic = comment && publish ? comment + publish : 0;
    return `<div class="x-energy-submit-intro">
      <p class="x-energy-submit-heading">宣传奖励</p>
      ${highest ? `<p class="x-energy-submit-highlight">点赞里程碑累计最高可得 <strong>${escapeHtml(highest)} X能量</strong></p>` : ""}
      ${basic ? `<p class="x-energy-submit-summary">每日基础任务 <strong>${escapeHtml(basic)} X能量</strong>：完成1条有效评论＋1篇有效作品，审核通过后发放。</p>` : '<p class="x-energy-submit-summary">评论、发布作品、点赞里程碑均可申请奖励，金额以审核规则为准。</p>'}
    </div>`;
  }

  function renderPromoCard(card) {
    const amount = catalogAmount(card.type);
    const active = state.activeTab === card.type;
    const summary = amount
      ? `${card.subject}，提交宣传作品链接，审核通过得 ${amount} X能量。同一作品只能参加一个奖励活动。`
      : `${card.subject}，提交宣传作品链接，审核通过后发放 X能量。同一作品只能参加一个奖励活动。`;
    const form = active ? renderForm(card.type) : "";
    return `<div class="x-energy-submit-card" data-energy-submit-card="${escapeHtml(card.type)}">
      <div class="x-energy-submit-intro">
        <p class="x-energy-submit-heading">${escapeHtml(card.title)}</p>
        <p class="x-energy-submit-summary">${escapeHtml(summary)}</p>
      </div>
      <div class="x-energy-submit-tabs">
        <button class="x-energy-submit-tab" type="button"
          data-energy-submit-tab="${escapeHtml(card.type)}"
          data-active="${active ? "true" : "false"}"
          aria-expanded="${active ? "true" : "false"}">提交作品</button>
      </div>
      <div class="x-energy-submit-form-wrap"${form ? "" : " hidden"}>${form}
      </div>
    </div>`;
  }

  function renderHistoryCard() {
    return `<div class="x-energy-submit-card" data-energy-submit-card="history">
      <p class="x-energy-submit-section-label">奖励申请记录</p>${renderHistory()}
    </div>`;
  }

  function renderPanelHtml() {
    const activeForm = state.activeTab && state.activeTab !== CREATOR_TYPE && PROMO_TYPES.indexOf(state.activeTab) < 0
      ? renderForm(state.activeTab)
      : "";
    return `
      ${!state.showCreatorEntry || state.creatorContainer ? "" : renderCreatorPanelHtml()}
      <div class="x-energy-submit-card" data-energy-submit-card="entry">
        ${renderPromotionIntro()}
        <div class="x-energy-submit-tabs" data-energy-submit-tabs>${renderTabs()}</div>
        <div class="x-energy-submit-form-wrap" data-energy-submit-form-wrap${activeForm ? "" : " hidden"}>${activeForm}
        </div>
      </div>
      ${PROMO_CARDS.map(renderPromoCard).join("")}
      ${state.historyContainer ? "" : renderHistoryCard()}`;
  }

  function render(summary) {
    if (summary && typeof summary === "object") {
      if (hasOwn(summary, "account")) {
        const nextAccount = summary.account || null;
        const identity = nextAccount && typeof nextAccount === "object"
          ? text(nextAccount.userId || nextAccount.openid || nextAccount._id || nextAccount.id || nextAccount.email)
            || JSON.stringify(nextAccount)
          : "";
        const nextVisible = isVisible(nextAccount);
        if ((state.creatorAccountKey && identity !== state.creatorAccountKey)
          || (state.account && isVisible(state.account) !== nextVisible)) {
          state.creatorGeneration += 1;
          state.creatorRequestId += 1;
          state.creatorLoading = false;
          state.submitting = false;
          state.creatorError = "";
          state.creatorNotice = "";
          state.creatorWorks = [];
          state.creatorCursors = null;
          state.creatorHasMore = false;
          state.creatorActivity = null;
          state.creatorSelectedWorkId = "";
          state.applications = [];
          state.historyError = "";
          state.loading = false;
          state.activeTab = "";
        }
        state.creatorAccountKey = identity;
        state.account = nextAccount;
      }
      if (hasOwn(summary, "applications")) state.applications = normalizeApplications(summary.applications);
      if (hasOwn(summary, "rewardCatalog")) {
        state.rewardCatalog = summary.rewardCatalog && typeof summary.rewardCatalog === "object"
          ? summary.rewardCatalog
          : null;
        const creatorEntry = catalogEntry(CREATOR_TYPE);
        if (creatorEntry) state.creatorActivity = creatorEntry;
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
    panel.innerHTML = renderPanelHtml();
    if (state.creatorContainer) {
      state.creatorContainer.innerHTML = state.showCreatorEntry ? renderCreatorPanelHtml() : "";
      state.creatorContainer.hidden = !state.showCreatorEntry;
    }
    if (state.historyContainer) {
      state.historyContainer.innerHTML = `<section class="x-energy-submit-block">${renderHistoryCard()}</section>`;
      state.historyContainer.hidden = false;
    }
    return panel;
  }

  function renderCurrent() {
    return render(null);
  }

  function setDraftStatus(rewardType, message, tone) {
    const draft = draftFor(rewardType);
    if (!draft) return;
    if (tone === "error") {
      draft.error = String(message || "");
      draft.notice = "";
    } else {
      draft.notice = String(message || "");
      draft.error = "";
    }
    renderCurrent();
  }

  /* ---------------------------------------------------------------- *
   * 交互
   * ---------------------------------------------------------------- */

  function toggleTab(rewardType) {
    const type = text(rewardType);
    if (!draftFor(type)) return;
    const previousTab = state.activeTab;
    state.activeTab = previousTab === type ? "" : type;
    if (previousTab === CREATOR_TYPE && state.activeTab !== CREATOR_TYPE) {
      state.creatorRequestId += 1;
      state.creatorLoading = false;
    }
    renderCurrent();
    if (state.activeTab === CREATOR_TYPE && !state.creatorWorks.length && !state.creatorLoading) {
      void loadCreatorWorks(true);
    }
  }

  function handleProofChange(rewardType, fileList) {
    const draft = draftFor(rewardType);
    if (!draft) return;
    const files = fileList ? Array.prototype.slice.call(fileList) : [];
    draft.error = "";
    draft.notice = "";
    if (files.length > MAX_PROOF_ASSETS) {
      draft.files = [];
      draft.error = `一次最多上传 ${MAX_PROOF_ASSETS} 张截图，请重新选择`;
    } else {
      draft.files = files;
    }
    renderCurrent();
  }

  function prefillFromRecord(requestId) {
    const id = text(requestId);
    if (!id) return;
    const record = state.applications.filter((item) => item.requestId === id)[0];
    if (!record) return;
    const draft = draftFor(record.rewardType);
    if (!draft) return;
    if (record.rewardType === CREATOR_TYPE) {
      state.activeTab = CREATOR_TYPE;
      state.creatorSelectedWorkId = `${record.workType}:${record.workId}`;
      state.creatorWorks = [];
      void loadCreatorWorks(true);
      renderCurrent();
      return;
    }
    const isComment = record.rewardType === COMMENT_TYPE;
    draft.platform = isComment ? "" : record.platform;
    draft.workUrl = isComment ? "" : record.workUrl;
    draft.likeCount = record.rewardType === LIKE_TYPE && record.reportedLikeCount > 0
      ? String(record.reportedLikeCount)
      : "";
    draft.files = [];
    draft.error = "";
    draft.notice = isComment
      ? "已打开评论奖励表单，评论截图需要重新上传。"
      : "已预填平台与作品链接，截图需要重新上传。";
    state.activeTab = record.rewardType;
    renderCurrent();
  }

  async function uploadAllProofs(rewardType, files) {
    const api = state.api;
    const assets = [];
    for (let index = 0; index < files.length; index += 1) {
      let uploaded = null;
      try {
        uploaded = await api.uploadProof(files[index]);
      } catch (error) {
        return { ok: false, message: readErrorMessage(error, "截图上传失败，请检查网络后重试") };
      }
      const fileId = uploaded && typeof uploaded === "object"
        ? text(uploaded.fileId || uploaded.fileID || (uploaded.data && uploaded.data.fileId))
        : text(uploaded);
      if (!fileId) {
        return { ok: false, message: "截图上传失败，请重新选择后重试" };
      }
      assets.push({ kind: PROOF_KIND, fileId });
    }
    return { ok: true, assets };
  }

  async function handleSubmit(rewardType) {
    const type = text(rewardType);
    const draft = draftFor(type);
    if (!draft || state.submitting) return;
    const api = state.api;
    const isComment = type === COMMENT_TYPE;

    if (!draft.files.length) {
      setDraftStatus(type, isComment ? "请先上传评论截图" : "请先上传作品截图", "error");
      return;
    }
    if (draft.files.length > MAX_PROOF_ASSETS) {
      setDraftStatus(type, `一次最多上传 ${MAX_PROOF_ASSETS} 张截图`, "error");
      return;
    }
    if (!isComment) {
      if (PLATFORM_VALUES.indexOf(draft.platform) < 0) {
        setDraftStatus(type, "请选择作品所在平台", "error");
        return;
      }
      if (!text(draft.workUrl)) {
        setDraftStatus(type, "请粘贴作品分享文案或作品链接", "error");
        return;
      }
    }
    if (!api || typeof api.uploadProof !== "function" || typeof api.submitRewardApplication !== "function") {
      setDraftStatus(type, "暂时无法提交，请稍后再试", "error");
      return;
    }

    state.submitting = true;
    draft.error = "";
    draft.notice = "";
    renderCurrent();

    const uploadResult = await uploadAllProofs(type, draft.files);
    if (!uploadResult.ok) {
      state.submitting = false;
      setDraftStatus(type, uploadResult.message, "error");
      return;
    }

    const payload = { rewardType: type, proofAssets: uploadResult.assets };
    if (!isComment) {
      payload.platform = draft.platform;
      payload.workUrl = text(draft.workUrl);
    }
    if (type === LIKE_TYPE) {
      const reported = positiveInt(draft.likeCount);
      if (reported > 0) payload.reportedLikeCount = reported;
    }

    let response = null;
    try {
      response = await api.submitRewardApplication(payload);
    } catch (error) {
      state.submitting = false;
      setDraftStatus(type, readErrorMessage(error, "提交失败，请稍后再试"), "error");
      return;
    }
    state.submitting = false;
    if (!isOkPayload(response)) {
      setDraftStatus(type, readErrorMessage(response, "提交失败，请稍后再试"), "error");
      return;
    }

    const fresh = createDraft();
    fresh.notice = "已提交，等待管理员审核。";
    state.drafts[type] = fresh;
    renderCurrent();
    await refresh();
  }

  function bindEvents(container) {
    if (!container || typeof container.addEventListener !== "function") return;
    if (state.boundContainers.has(container)) return;
    state.boundContainers.add(container);
    container.addEventListener("click", (event) => {
      const target = event && event.target;
      if (!target || typeof target.closest !== "function") return;
      const tab = target.closest("[data-energy-submit-tab]");
      if (tab) {
        if (typeof event.preventDefault === "function") event.preventDefault();
        toggleTab(tab.getAttribute("data-energy-submit-tab"));
        return;
      }
      const retry = target.closest("[data-energy-submit-retry]");
      if (retry) {
        if (typeof event.preventDefault === "function") event.preventDefault();
        prefillFromRecord(retry.getAttribute("data-energy-submit-retry"));
        return;
      }
      const apply = target.closest("[data-energy-submit-creator-apply]");
      if (apply) {
        if (typeof event.preventDefault === "function") event.preventDefault();
        void submitCreatorWork();
        return;
      }
      const more = target.closest("[data-energy-submit-works-more]");
      if (more) {
        if (typeof event.preventDefault === "function") event.preventDefault();
        void loadCreatorWorks(false);
      }
    });
    container.addEventListener("change", (event) => {
      const target = event && event.target;
      if (!target || typeof target.closest !== "function") return;
      const proof = target.closest("[data-energy-submit-proof]");
      if (proof) {
        handleProofChange(proof.getAttribute("data-energy-submit-proof"), target.files);
        return;
      }
      const platform = target.closest("[data-energy-submit-platform]");
      if (platform) {
        const draft = draftFor(platform.getAttribute("data-energy-submit-platform"));
        if (draft) draft.platform = text(target.value);
        return;
      }
      const creatorChoice = target.closest("[data-energy-submit-creator-choice]");
      if (creatorChoice) {
        const choice = creatorChoice.getAttribute("data-energy-submit-creator-choice");
        const work = state.creatorWorks.find((item) => creatorWorkKey(item) === choice);
        if (work) {
          state.creatorSelectedWorkId = choice;
          renderCurrent();
        }
      }
    });
    container.addEventListener("input", (event) => {
      const target = event && event.target;
      if (!target || typeof target.closest !== "function") return;
      const workUrl = target.closest("[data-energy-submit-work-url]");
      if (workUrl) {
        const draft = draftFor(workUrl.getAttribute("data-energy-submit-work-url"));
        if (draft) draft.workUrl = String(target.value || "");
        return;
      }
      const likeCount = target.closest("[data-energy-submit-like-count]");
      if (likeCount) {
        const draft = draftFor(likeCount.getAttribute("data-energy-submit-like-count"));
        if (draft) draft.likeCount = String(target.value || "");
      }
    });
    container.addEventListener("submit", (event) => {
      const target = event && event.target;
      if (!target || typeof target.closest !== "function") return;
      const form = target.closest("[data-energy-submit-form]");
      if (!form) return;
      if (typeof event.preventDefault === "function") event.preventDefault();
      void handleSubmit(form.getAttribute("data-energy-submit-form"));
    });
  }

  function mount(options) {
    const config = options || {};
    const container = config.container || null;
    if (!container) return null;
    const creatorContainer = config.creatorContainer || null;
    const historyContainer = config.historyContainer || null;
    const showCreatorEntry = config.showCreatorEntry !== false;
    if (state.container !== container || state.creatorContainer !== creatorContainer || state.historyContainer !== historyContainer || state.showCreatorEntry !== showCreatorEntry) {
      teardownPanel();
      state.applications = [];
      state.rewardCatalog = null;
      state.activeTab = "";
      state.creatorWorks = [];
      state.creatorActivity = null;
      state.creatorCursors = null;
      state.creatorHasMore = false;
      state.creatorLoading = false;
      state.creatorError = "";
      state.creatorNotice = "";
      state.creatorSelectedWorkId = "";
      state.creatorRequestId += 1;
      state.creatorGeneration += 1;
      state.historyError = "";
      state.loading = false;
      state.submitting = false;
      resetDrafts();
    }
    state.container = container;
    state.creatorContainer = creatorContainer;
    state.historyContainer = historyContainer;
    state.showCreatorEntry = showCreatorEntry;
    state.api = config.api || state.api || null;
    if (config.summary) render(config.summary);
    bindEvents(container);
    if (creatorContainer && creatorContainer !== container) bindEvents(creatorContainer);
    if (historyContainer && historyContainer !== container) bindEvents(historyContainer);
    if (container.hidden !== true && !isVisible(state.account)) container.hidden = true;
    return container;
  }

  async function refresh() {
    const api = state.api;
    if (!isVisible(state.account)) {
      renderCurrent();
      return null;
    }
    if (!api || typeof api.getMyRewardApplications !== "function") return null;
    const requestId = ++state.requestId;
    state.loading = true;
    renderCurrent();
    let payload = null;
    try {
      payload = await api.getMyRewardApplications({ status: "all" });
    } catch (error) {
      if (requestId !== state.requestId) return null;
      state.loading = false;
      state.historyError = readErrorMessage(error, "申请记录加载失败，请稍后再试");
      renderCurrent();
      return null;
    }
    if (requestId !== state.requestId) return null;
    state.loading = false;
    if (payload && typeof payload === "object" && payload.success === false) {
      state.historyError = readErrorMessage(payload, "申请记录加载失败，请稍后再试");
      renderCurrent();
      return null;
    }
    state.applications = extractApplications(payload);
    const catalog = extractCatalog(payload);
    if (catalog) {
      state.rewardCatalog = catalog;
      const creatorEntry = catalogEntry(CREATOR_TYPE);
      if (creatorEntry) state.creatorActivity = creatorEntry;
    }
    state.historyError = "";
    renderCurrent();
    return state.applications;
  }

  window.SHEXRewardSubmitPanel = {
    isVisible,
    mount,
    render,
    refresh
  };
})();
