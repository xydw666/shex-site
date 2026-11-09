(() => {
  const PAGE_ID = "xEnergyPanel";
  const PAGE_HASH = "#x-energy";
  const PAGE_SIZE = 30;
  const FOCUS_KEY = "shex_x_energy_focus_section";

  function syncEnergyViewport() {
    const height = Math.max(1, Math.round(
      window.visualViewport?.height
      || window.innerHeight
      || document.documentElement.clientHeight
      || 1
    ));
    document.documentElement.style.setProperty("--shex-energy-vh", `${height}px`);
  }
  const ADMIN_QR_URL = (() => {
    try {
      return new URL("../../images/admin-qr.jpg", document.currentScript?.src || window.location.href).href;
    } catch (_) {
      return "./images/admin-qr.jpg";
    }
  })();
  const BEAUTIFY_GUIDE_FILENAME = "SHE.X_全域美化_公开完善版.md";
  const BEAUTIFY_GUIDE_ASSET = "SHE.X-beautify-guide-public.md";
  const BEAUTIFY_GUIDE_URL = (() => {
    const scriptUrl = document.currentScript?.src;
    const url = new URL(scriptUrl ? "./" + BEAUTIFY_GUIDE_ASSET : "./x-world/energy/" + BEAUTIFY_GUIDE_ASSET, scriptUrl || window.location.href);
    url.searchParams.set("v", "20261003-all-beautify-ai-guide-1");
    return url.href;
  })();
  let beautifyGuideTextPromise = null;
  const state = {
    view: "hub",
    category: "all",
    logs: [],
    nextCursor: 0,
    hasMore: false,
    loading: false,
    campaign: null,
    homeSummary: null,
    orders: [],
    catalog: { plans: [], packs: [] },
    plan: null,
    emailIdentityTransition: null,
    emailFlowEmail: "",
    emailFlowEpoch: 0,
    verifiedEmail: "",
    emailModalOwnerUserId: "",
    homeSummaryRequestId: 0,
    logsRequestId: 0,
    ordersRequestId: 0,
    campaignRequestId: 0,
    planRequestId: 0,
    feedbackItems: [],
    feedbackNextSkip: 0,
    feedbackHasMore: false,
    feedbackLoading: false,
    feedbackSubmitting: false,
    feedbackSubmitRequestId: 0,
    feedbackRequestId: 0,
    feedbackError: ""
  };
  let feedbackFiles = [];
  let feedbackPreviewUrls = [];

  const SECTION_TO_VIEW = {
    plans: "plans",
    packs: "packs",
    redeem: "redeem",
    codes: "redeem",
    orders: "redeem",
    faq: "faq",
    feedback: "feedback",
    "energy-guide": "energy-guide",
    "beautify-guide": "beautify-guide",
    contact: "contact",
    ledger: "ledger"
  };

  const VIEW_TITLES = {
    plans: "充值套餐",
    packs: "能量包",
    redeem: "兑换码 / 购买记录",
    faq: "常见问题",
    feedback: "用户反馈",
    "energy-guide": "X能量规则介绍",
    "beautify-guide": "高级美化",
    contact: "联系管理员",
    ledger: "消费记录"
  };

  const HUB_TILES = [
    { view: "plans", label: "充值套餐", icon: "recharge" },
    { view: "packs", label: "能量包", icon: "pack" },
    { view: "redeem", label: "兑换码", icon: "redeem" },
    { view: "ledger", label: "消费记录", icon: "ledger" },
    { view: "faq", label: "常见问题", icon: "faq" },
    { view: "contact", label: "联系客服", icon: "contact" }
  ];

  const HUB_ICONS = {
    recharge: '<rect x="3" y="6" width="18" height="12" rx="2.5"></rect><line x1="3" y1="10" x2="21" y2="10"></line><line x1="7" y1="14" x2="11" y2="14"></line>',
    pack: '<path d="M13 3 5 14h6l-1 7 8-11h-6l1-7Z"></path>',
    redeem: '<path d="M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4V8Z"></path><line x1="12" y1="7" x2="12" y2="17" stroke-dasharray="2 2"></line>',
    ledger: '<line x1="5" y1="7" x2="19" y2="7"></line><line x1="5" y1="12" x2="19" y2="12"></line><line x1="5" y1="17" x2="13" y2="17"></line>',
    faq: '<path d="M4 5h16v11H9l-4 4V5Z"></path><line x1="8" y1="9" x2="16" y2="9"></line><line x1="8" y1="12.5" x2="13" y2="12.5"></line>',
    beautify: '<path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z"></path><path d="m19 17 .7 1.3L21 19l-1.3.7L19 21l-.7-1.3L17 19l1.3-.7L19 17Z"></path>',
    message: '<path d="M4 5h16v12H8l-4 3V5Z"></path><path d="M8 10h8M8 13h6"></path>',
    contact: '<path d="M4 13a8 8 0 0 1 16 0"></path><rect x="3" y="13" width="4" height="6" rx="1.5"></rect><rect x="17" y="13" width="4" height="6" rx="1.5"></rect>'
  };

  const escapeHtml = (value) => String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

  const formatTime = (value) => {
    const date = new Date(Number(value || 0));
    if (!Number.isFinite(date.getTime())) return "";
    return new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).format(date);
  };

  const formatDate = (value) => {
    const date = new Date(Number(value || 0));
    if (!Number.isFinite(date.getTime())) return "";
    return new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(date);
  };

  const categoryMeta = {
    consume: { label: "消费", icon: "−" },
    recharge: { label: "充值", icon: "＋" },
    reward: { label: "奖励", icon: "礼" },
    refund: { label: "退还", icon: "↩" }
  };

  const planLabel = (plan) => ({
    plus: "共振版 Plus",
    pro: "深链版 Pro",
    ultra: "恒链版 Ultra",
    free_cloud: "初链版 Free"
  }[plan] || plan || "套餐");
  const planBadgeLabel = (plan, name) => ({
    plus: "Plus",
    pro: "Pro",
    ultra: "Ultra",
    free_cloud: "Free"
  }[plan] || String(name || "Free").trim().split(/\s+/).pop());

  const packLabel = (packType) => ({
    small_pack: "小能量包",
    medium_pack: "中能量包",
    large_pack: "大能量包"
  }[packType] || packType || "能量包");

  const statusLabel = (status) => ({
    completed: "已完成",
    pending: "待支付",
    processing: "处理中",
    failed: "失败",
    amount_mismatch: "异常，请联系管理员"
  }[status] || status || "未知");

  function ensurePanel() {
    let panel = document.getElementById(PAGE_ID);
    if (panel) return panel;
    const transmission = document.getElementById("transmission");
    if (!transmission) return null;
    panel = document.createElement("div");
    panel.id = PAGE_ID;
    panel.className = "x-panel x-subpage-panel x-energy-panel is-hub-view";
    panel.innerHTML = `
      <button class="x-subpage-back x-energy-back" type="button" data-x-home-back aria-label="返回 X世界">‹</button>
      <div class="x-energy-shell">
        <button class="x-energy-detail-back" type="button" data-energy-detail-back hidden>‹ <span data-energy-detail-title>返回</span></button>
        <header class="x-energy-header">
          <div>
            <small data-energy-eyebrow>X ENERGY</small>
            <h2 data-energy-title>X能量</h2>
            <p data-energy-subtitle>套餐、能量包、兑换与每一笔记录，都在这里。</p>
          </div>
          <button class="x-energy-refresh" type="button" data-energy-refresh aria-label="刷新">↻</button>
        </header>

        <div class="x-energy-hub" data-energy-view="hub">
          <section class="x-energy-account-card" data-energy-account-card>
            <div class="x-energy-account-top" data-energy-account-top>
              <strong class="x-energy-account-name" data-energy-account-name>未命名账号</strong>
              <div class="x-energy-account-plan-actions">
                <span class="x-energy-plan-badge" data-energy-plan-name>Free</span>
                <button class="x-energy-open-plan" type="button" data-energy-open-plan>详情 <span aria-hidden="true">›</span></button>
              </div>
            </div>
            <div class="x-energy-account-meta">
              <span data-energy-account-id>账号ID：—</span>
              <span class="x-energy-account-email-row"><span data-energy-account-email>邮箱：未绑定</span><button class="x-energy-account-bind" type="button" data-energy-bind-email>绑定邮箱</button></span>
            </div>
            <div class="x-energy-plan-metrics" data-energy-plan-metrics>
              <article data-energy-plan-metric><small data-energy-overview-cycle-label>3小时额度</small><strong data-energy-overview-cycle3h>—</strong></article>
              <article data-energy-plan-metric><small data-energy-overview-middle-label>套餐到期时间</small><strong data-energy-overview-expire>—</strong></article>
              <article data-energy-plan-metric><small>无限期X能量</small><strong data-energy-overview-pack>—</strong></article>
            </div>
            <p class="x-energy-account-status" data-energy-account-status hidden aria-live="polite"></p>
            <div class="x-energy-deletion-state" data-energy-deletion hidden>
              <strong data-energy-deletion-status></strong><p data-energy-deletion-note hidden></p><button type="button" data-energy-cancel-deletion>取消注销</button>
            </div>
            <div class="x-energy-account-actions">
              <a data-energy-download-app href="./downloads/SHE.X.apk?v=1.3" download="SHE.X.apk">下载 APP</a>
              <button type="button" data-energy-open-admin hidden>管理后台</button>
              <button type="button" data-energy-logout>退出登录</button>
              <button class="is-danger" type="button" data-energy-delete-account>注销账号</button>
            </div>
          </section>

          <section class="x-energy-hub-section"><div class="x-energy-hub-grid" data-energy-app-grid></div></section>
          <article class="x-energy-reward-card" data-energy-reward-card="campaign" data-energy-campaign hidden><div><small>限时福利</small><strong data-energy-campaign-title>全员赠送能量包</strong><p data-energy-campaign-description></p><p data-energy-campaign-status></p></div><button type="button" data-energy-campaign-claim>立即领取</button></article>
          <section class="x-energy-hub-section" data-energy-rewards>
            <div data-energy-reward-submit-slot hidden></div>
            <div data-energy-reward-panel-slot hidden></div>
            <div data-energy-reward-history-slot hidden></div>
            <div data-energy-creator-reward-slot hidden></div>
            <button class="x-energy-reward-card" type="button" data-energy-reward-card="creator" data-energy-open-creator hidden><div><small>创作收益</small><strong>把灵感变成奖励</strong><p>达标后自动发放到无限期X能量。</p></div><span aria-hidden="true">›</span></button>
          </section>
        </div>
        <div class="x-energy-detail" data-energy-view="detail" hidden>
          <section class="x-energy-page-section" data-energy-section="plans" hidden>
            <div class="x-energy-section-heading">
              <div><h3>充值套餐</h3><p>选择档位与购买时长，下方可查看与免费版的权益对比。</p></div>
            </div>
            <div class="x-energy-tier-row" data-energy-tier-row>
              <p class="x-energy-empty">正在读取套餐…</p>
            </div>
            <div class="x-energy-tier-card" data-energy-tier-card hidden></div>
          </section>

          <section class="x-energy-page-section" data-energy-section="packs" hidden>
            <div class="x-energy-section-heading">
              <div><h3>X能量包价格</h3><p>能量包不会按月清零，用完为止。</p></div>
            </div>
            <div class="x-energy-pack-grid" data-energy-pack-list>
              <p class="x-energy-empty">正在读取能量包…</p>
            </div>
          </section>

          <section class="x-energy-page-section x-energy-redeem-group" data-energy-section="redeem" hidden>
            <div class="x-energy-page-section x-energy-redeem" id="xEnergyRedeem">
              <div class="x-energy-section-heading">
                <div><h3>兑换码</h3><p>输入购买或活动获得的兑换码。</p></div>
              </div>
              <form data-energy-redeem-form>
                <label for="xEnergyRedeemInput">兑换码</label>
                <div>
                  <input id="xEnergyRedeemInput" type="text" autocomplete="off" placeholder="请输入兑换码" maxlength="80">
                  <button type="submit">立即兑换</button>
                </div>
                <p data-energy-redeem-status></p>
              </form>
            </div>

            <div class="x-energy-page-section" id="xEnergyOrders">
              <div class="x-energy-section-heading">
                <div><h3>我的购买记录</h3></div>
                <button class="x-energy-inline-refresh" type="button" data-energy-orders-refresh aria-label="刷新购买记录" title="刷新购买记录">↻</button>
              </div>
              <div class="x-energy-order-list" data-energy-order-list>
                <p class="x-energy-empty">正在读取购买记录…</p>
              </div>
            </div>
          </section>

          <section class="x-energy-page-section x-energy-faq" data-energy-section="faq" hidden>
            <div class="x-energy-faq-shortcuts" aria-label="帮助主题">
              <button class="x-energy-faq-shortcut" type="button" data-beautify-guide-open>
                <span class="x-energy-hub-tile-icon" aria-hidden="true"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${HUB_ICONS.beautify}</svg></span>
                <strong>高级美化</strong><small>组件、代码、图片与个性化界面</small>
              </button>
              <button class="x-energy-faq-shortcut" type="button" data-energy-guide-open>
                <span class="x-energy-hub-tile-icon" aria-hidden="true"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${HUB_ICONS.pack}</svg></span>
                <strong>X能量</strong><small>套餐额度、能量包、X奖励与支付问题</small>
              </button>
              <button class="x-energy-faq-shortcut" type="button" data-energy-feedback-open>
                <span class="x-energy-hub-tile-icon" aria-hidden="true"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${HUB_ICONS.faq}</svg></span>
                <strong>用户反馈</strong><small>提交问题并查看妮妮的回复</small>
              </button>
            </div>
            <div class="x-energy-faq-popular">
              <h3 class="x-energy-faq-title">热门问题</h3>
              <div class="x-energy-faq-list">
                <details><summary>为什么购买后 X能量没有到账？</summary><div class="x-energy-faq-answer"><p><strong>X能量包</strong>支付成功后会自动到账，直接进入账号的「无限期X能量」，不需要兑换码。如果暂时没看到，可以刷新或重新进入 X能量页。</p><p><strong>会员套餐</strong>支付成功后会得到一枚兑换码，需要在「兑换码」入口完成兑换，套餐才会生效。</p><p>如果已经付款但仍然没有到账，请保留支付订单信息，联系管理员妮妮协助处理，先不要重复付款。</p></div></details>
                <details><summary>套餐额度和 X能量余额有什么区别？</summary><div class="x-energy-faq-answer"><p>它们不是同一种东西。</p><p><strong>套餐额度</strong>是套餐自带的周期使用额度，会按照套餐规则自动刷新。它不会一直累计，也不会把上一轮没有使用完的额度继续叠加到下一轮。</p><p><strong>X能量余额</strong>是通过能量包、兑换码、X奖励等方式获得的额外 X能量，与套餐周期额度分开计算。</p><p>可以简单理解成：<br><strong>套餐额度 = 会按周期刷新的使用额度<br>X能量余额 = 账号额外拥有的 X能量</strong></p></div></details>
                <details><summary>3小时额度和3天额度是怎么计算的？</summary><div class="x-energy-faq-answer"><p><strong>Free</strong> 同时有<strong>3小时额度</strong>和<strong>3天额度</strong>两层限制；<strong>Plus / Pro / Ultra</strong> 没有3小时限制，只有<strong>3天额度</strong>，3天额度没用完就可以一直使用。</p><p>SHE.X 的套餐额度采用的是：<strong>自动刷新制，不是叠加制。</strong></p><p>到了对应的刷新时间，会按照当前套餐的额度重新刷新；上一周期没有使用完的部分不会继续累加到下一周期。</p></div></details>
                <details><summary>为什么明明还有额度，却提示暂时不能使用？</summary><div class="x-energy-faq-answer"><p>Free 用户同时受3小时额度和3天额度限制，例如3小时额度还有剩余，但3天额度已经用完，就需要等待3天额度刷新。会员只看3天额度，用完后需要等待刷新或使用无限期X能量。</p><p>如果确认自己的额度都正常，但仍然持续提示无法使用，可以联系管理员妮妮帮你核对。</p></div></details>
                <details><summary>为什么 X传讯有时无法正常回复？</summary><div class="x-energy-faq-answer"><p>可以先看一下当前账号是否还有可用的套餐额度或 X能量。</p><p>如果额度正常，但 X传讯一直没有回复、回复失败、长时间没有反应，或页面持续提示异常，可以重新进入一次 X传讯再尝试。</p><p>如果仍然无法正常回复，直接联系管理员妮妮即可。<strong>先检查 X能量；额度正常仍不能回复，就联系妮妮。</strong></p></div></details>
                <details><summary>字卡模式和 AI 模式有什么区别？</summary><div class="x-energy-faq-answer"><p><strong>字卡模式</strong>使用已经准备好的内容，包括 SHE.X 自带的字卡和你自己添加的字卡。使用时会从已有字卡内容中展示，适合想使用自己准备好的句子、日常话术或固定风格内容。</p><p><strong>AI模式</strong>会根据当前角色、聊天内容和上下文生成新的回复，不是从已有字卡中直接抽取一句。使用 AI 模式时，可以看页面上的 AI 标识确认当前模式。</p><p>可以简单理解成：<br><strong>字卡模式 = 使用已有字卡<br>AI模式 = AI 根据当前聊天生成新的回复</strong></p></div></details>
                <details><summary>遇到异常扣费、不到账或功能异常怎么办？</summary><div class="x-energy-faq-answer"><p>如果遇到 X能量异常扣除、兑换后没有到账、X能量数量明显不对、支付或兑换异常，或功能持续无法正常使用，可以直接联系管理员<strong>妮妮</strong>协助处理。</p><p>建议提前准备：</p><ul><li>当前 SHE.X 账号</li><li>出现问题的大概时间</li><li>相关页面截图</li><li>如果涉及购买，准备支付或兑换相关截图</li></ul><figure class="x-energy-faq-qr"><img src="${escapeHtml(ADMIN_QR_URL)}" alt="管理员妮妮的 QQ 联系二维码"><figcaption>扫码联系妮妮</figcaption></figure><p>有问题找妮妮，妮妮可以帮你解答一切。</p></div></details>
              </div>
            </div>
          </section>

          <section class="x-energy-page-section x-energy-feedback" data-energy-section="feedback" hidden>
            <p class="x-energy-feedback-intro">遇到没有在常见问题里找到的情况，可以在这里告诉我们。</p>
            <div class="x-energy-feedback-submit-card">
              <h3>提交问题</h3>
              <form data-energy-feedback-form>
                <label for="xEnergyFeedbackContent">问题内容</label>
                <textarea id="xEnergyFeedbackContent" rows="5" maxlength="800" required placeholder="请简单描述你遇到的问题"></textarea>
                <span class="x-energy-feedback-upload">上传截图（可选，最多3张）</span>
                <input id="xEnergyFeedbackImages" class="x-energy-feedback-file-input" type="file" accept="image/*" multiple data-energy-feedback-images>
                <label class="x-energy-feedback-picker" for="xEnergyFeedbackImages"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"></rect><path d="M12 8v8M8 12h8"></path></svg>添加截图</label>
                <div class="x-energy-feedback-previews" data-energy-feedback-previews hidden></div>
                <p class="x-energy-feedback-status" data-energy-feedback-status role="status" aria-live="polite"></p>
                <button class="x-energy-feedback-submit" type="submit" data-energy-feedback-submit>提交反馈</button>
              </form>
            </div>
            <div class="x-energy-feedback-history">
              <h3>我的反馈记录</h3>
              <div class="x-energy-feedback-list" data-energy-feedback-list aria-live="polite"><p class="x-energy-feedback-empty">正在读取反馈记录…</p></div>
              <button class="x-energy-feedback-more" type="button" data-energy-feedback-more hidden>加载更多</button>
            </div>
          </section>

          <section class="x-energy-page-section x-energy-guide" data-energy-section="energy-guide" hidden>
            <nav class="x-energy-guide-tabs" role="tablist" aria-label="X能量规则分类">
              <button type="button" role="tab" id="xEnergyGuideTabConsume" aria-controls="xEnergyGuideConsume" aria-selected="true" data-energy-guide-tab="consume">X能量消耗</button>
              <button type="button" role="tab" id="xEnergyGuideTabReward" aria-controls="xEnergyGuideReward" aria-selected="false" data-energy-guide-tab="reward">X能量奖励</button>
              <button type="button" role="tab" id="xEnergyGuideTabQuota" aria-controls="xEnergyGuideQuota" aria-selected="false" data-energy-guide-tab="quota">套餐与余额</button>
              <button type="button" role="tab" id="xEnergyGuideTabPurchase" aria-controls="xEnergyGuidePurchase" aria-selected="false" data-energy-guide-tab="purchase">购买与到账</button>
            </nav>
            <div class="x-energy-guide-pane" id="xEnergyGuideConsume" role="tabpanel" aria-labelledby="xEnergyGuideTabConsume" data-energy-guide-pane="consume">
              <div class="x-energy-guide-list">
                <details><summary>X能量会用在哪些功能？</summary><div class="x-energy-guide-answer"><p>常用的有 X传讯聊天、X来信、TA状态与链接状态、新增梦角、创建群聊，以及语音朗读和专属音色。部分约会、梦占、翻译和梦角计划功能也会消耗 X能量。具体费用可在使用前查看对应页面提示。</p></div></details>
                <details><summary>普通聊天和常用功能分别消耗多少 X能量？</summary><div class="x-energy-guide-answer"><table><thead><tr><th>功能</th><th>每次消耗</th></tr></thead><tbody><tr><td>普通单聊／群聊发言</td><td>1点</td></tr><tr><td>聊天图片、贴纸、选项、动作、礼物</td><td>1点</td></tr><tr><td>X来信、TA状态、X链接状态</td><td data-energy-feature-price="ta_status:2:0">2点</td></tr><tr><td>X信回信（字卡）</td><td data-energy-feature-price="x_letter_card:2:2">2点</td></tr><tr><td>X信回信（AI）</td><td>6点</td></tr><tr><td>新增梦角</td><td>5点</td></tr><tr><td>创建群聊</td><td>8点</td></tr><tr><td>生成一条梦角计划</td><td>2点</td></tr><tr><td>约会结果</td><td data-energy-feature-price="dating_result:20:15">20点</td></tr><tr><td>梦占解读</td><td data-energy-feature-price="divination_interpret:50:39">50点</td></tr><tr><td>克隆专属声音</td><td data-energy-feature-price="voice_clone:499:399">499点</td></tr><tr><td>卡片消息翻译</td><td>3点</td></tr></tbody></table><p>每日主动字卡：有效会员免费，其他账号2点；普通字卡回信所有账号均2点。打开已有信不扣费。</p><p>若聊天使用角色 AI 回复，费用按当前所选模型显示的价格计算，不能按普通发言的1点估算。</p></div></details>
                <details><summary>语音是怎么计算 X能量的？</summary><div class="x-energy-guide-answer"><p>语音朗读按实际可朗读文字的长度分档。文字越长，生成的语音越长，因此消耗也会增加。</p><table><thead><tr><th>可朗读文字</th><th>每次消耗</th></tr></thead><tbody><tr><td>1～30字</td><td>1点</td></tr><tr><td>31～60字</td><td>3点</td></tr><tr><td>61～90字</td><td>5点</td></tr><tr><td>91～120字</td><td>7点</td></tr><tr><td>121～240字</td><td>14点</td></tr></tbody></table><p>超过240字的文字暂不生成语音，也不会进行这次语音扣点。</p></div></details>
                <details><summary>克隆音色需要多少 X能量？</summary><div class="x-energy-guide-answer"><p>每次生成专属音色消耗 <strong data-energy-feature-price="voice_clone:499:399">499点</strong>，与普通功能使用相同的扣费规则：套餐额度足够时优先扣套餐，否则从无限期X能量扣除本次完整费用，不拆分支付；成功生成后进行扣费。绑定已有公开音色本身不收取克隆费用，之后生成语音仍按文字长度计费。</p></div></details>
                <details><summary>为什么不同功能扣除的 X能量不一样？</summary><div class="x-energy-guide-answer"><p>不同操作提供的内容与服务量不同：普通消息、长语音、生成专属音色和不同档位的角色回复，所需点数会不同。操作前请看当前功能或模型显示的价格。</p></div></details>
                <details><summary>X能量是在什么时候扣除的？</summary><div class="x-energy-guide-answer"><p>各功能的时点不完全相同。普通聊天在消息保存、准备生成回复时扣；X来信和状态在生成内容前扣。语音朗读、约会结果、梦占解读等先尝试生成结果，再在交付或保存前扣；专属音色在声音创建后、正式绑定前扣。仅点击入口或打开页面不会统一扣点。</p></div></details>
                <details><summary>功能失败了，但是 X能量已经减少怎么办？</summary><div class="x-energy-guide-answer"><p>请先重新进入功能页面查看结果，避免在结果未确认时连续发起新请求。语音朗读、约会结果、梦占等若在生成阶段失败，通常还未扣点；聊天、X来信等较早扣点的功能，后续失败不保证自动退回。当前没有覆盖所有功能的自动退款流程，但相同请求重试有防重复扣点处理。</p><p>如果能量已减少却没有拿到结果，请保留发生时间、使用的功能、扣除点数及页面截图，到「消费记录」核对后联系管理员处理。</p></div></details>
              </div>
            </div>
            <div class="x-energy-guide-pane" id="xEnergyGuideReward" role="tabpanel" aria-labelledby="xEnergyGuideTabReward" data-energy-guide-pane="reward" hidden>
              <div class="x-energy-guide-list">
                <details><summary>X奖励是什么？</summary><div class="x-energy-guide-answer"><p>X奖励是 SHE.X 为邀请新用户、分享真实体验、创作角色等行为提供的 X能量奖励。符合对应规则并完成审核或达成条件后，奖励会发放至账号的「无限期X能量」，可在 X能量明细中查看。</p><p>不同奖励的发放方式不同：部分奖励自动到账，部分内容奖励需要提交申请并通过审核。</p></div></details>
                <details><summary>邀请好友可以获得多少 X能量？</summary><div class="x-energy-guide-answer"><p>被邀请人成功使用有效邀请码，可获得 <strong>30 X能量</strong>。邀请人邀请的第1～3位好友，每位获得30；第4～10位，每位获得50；第11位起，每位获得80。</p><ul><li>每个账号只能使用一次邀请码，不能邀请自己；已建立的邀请关系不能重复绑定。</li><li>符合条件时可以补填邀请码。奖励按好友成功邀请时所在档位计算，之前邀请的人数不补档位差价。</li></ul></div></details>
                <details><summary>评论奖励怎么获得？</summary><div class="x-energy-guide-answer"><p>每条有效评论奖励 <strong>10 X能量</strong>，每天最多提交3条。评论需公开保留至少24小时，并提交截图供审核。</p><p>正常评价和客观讨论都可以；无意义、重复内容不计入有效评论。未通过审核的申请也占当天提交次数。</p></div></details>
                <details><summary>发布作品可以获得多少奖励？</summary><div class="x-energy-guide-answer"><p>每篇有效作品奖励 <strong>30 X能量</strong>，每天最多提交1篇。作品需与 SHE.X 明确相关，带有 <strong>#SHEX</strong>，公开保留至少24小时；申请时提交截图和链接。</p><p>体验、介绍、吐槽和客观评价均可，不要求必须正面评价。审核未通过的申请同样占当天次数。</p></div></details>
                <details><summary>作品点赞达到一定数量还有奖励吗？</summary><div class="x-energy-guide-answer"><table><thead><tr><th>点赞达到</th><th>奖励</th></tr></thead><tbody><tr><td>50</td><td>80 X能量</td></tr><tr><td>100</td><td>120 X能量</td></tr><tr><td>300</td><td>200 X能量</td></tr><tr><td>500</td><td>300 X能量</td></tr><tr><td>1000</td><td>500 X能量</td></tr></tbody></table><p>同一篇作品可以继续往上领取，同一档位不能重复领取。例如作品已有520个赞，之前各档都未领取，可补领50、100、300、500赞四档，共 <strong>700 X能量</strong>。</p></div></details>
                <details><summary>创作者奖励怎么计算？</summary><div class="x-energy-guide-answer"><p>同一名用户使用同一个角色，并成功完成5次 AI 回复，记为1次有效使用；同一用户对同一角色最多计算一次。每累计100次有效使用，创作者自动获得 <strong>300 X能量</strong>，可持续累计。</p><p>无需申请、领取或兑换。系统按小时统计，到账可能稍有延迟，可在 X能量明细中查看。</p></div></details>
                <details><summary>X奖励会发到哪里？</summary><div class="x-energy-guide-answer"><p>奖励会进入账号的「无限期X能量」，可在 X能量明细中查看；它不属于套餐的3小时或3天周期额度。</p></div></details>
                <details><summary>哪些情况可能无法获得奖励？</summary><div class="x-energy-guide-answer"><p>无法核验账号或内容归属、截图或链接无法验证、重复提交、内容已删除或公开不足24小时、无意义批量提交、异常刷取，以及提交内容与实际情况不一致，都可能无法获得奖励。</p><p>奖励规则可能根据活动和审核情况调整，请以提交时页面显示的规则为准。</p></div></details>
              </div>
            </div>
            <div class="x-energy-guide-pane" id="xEnergyGuideQuota" role="tabpanel" aria-labelledby="xEnergyGuideTabQuota" data-energy-guide-pane="quota" hidden>
              <div class="x-energy-guide-list">
                <details><summary>什么是套餐额度？</summary><div class="x-energy-guide-answer"><p>Free、Plus、Pro、Ultra 套餐都有可周期使用的额度。Free 受3小时和3天两项限制；Plus / Pro / Ultra 只受3天额度限制。它会按周期恢复，不是存进账号里永久保留的一笔 X能量。付费套餐到期后会回到 Free 额度。</p></div></details>
                <details><summary>3小时额度是怎么计算的？</summary><div class="x-energy-guide-answer"><p>3小时额度只对 Free 用户生效，会员没有这项限制。它限制一个3小时周期内可从套餐使用的点数。每轮从首次实际扣点开始计时；满3小时后，系统在下一次查看或使用时将本轮已用量清零，整档恢复，并从新的使用周期继续计算。它不是逐点恢复，也不是每天固定时间重置。</p></div></details>
                <details><summary>3天额度是怎么计算的？</summary><div class="x-energy-guide-answer"><p>它以同样方式独立计算一个3天周期：从该轮首次实际扣点开始，满3天后在下一次查看或使用时整档恢复。3小时额度恢复不会清除尚未到期的3天已用量。</p></div></details>
                <details><summary>3小时额度和3天额度是什么关系？</summary><div class="x-energy-guide-answer"><p>Free 用户两项限制同时生效：一次操作只有在两项套餐剩余额度都足够时，才从套餐扣点。Plus / Pro / Ultra 只看3天额度。套餐额度不够时，本次操作会尝试从「无限期X能量」扣完整金额；余额不足就暂时无法使用，须等周期恢复或补充余额。</p></div></details>
                <details><summary>不同套餐分别有多少额度？</summary><div class="x-energy-guide-answer"><table><thead><tr><th>套餐</th><th>每3小时</th><th>每3天</th></tr></thead><tbody><tr><td>Free</td><td>30点</td><td>120点</td></tr><tr><td>Plus</td><td>不限</td><td>300点</td></tr><tr><td>Pro</td><td>不限</td><td>900点</td></tr><tr><td>Ultra</td><td>不限</td><td>1800点</td></tr></tbody></table></div></details>
                <details><summary>什么是无限期X能量？</summary><div class="x-energy-guide-answer"><p>购买的能量包、福利赠送及符合条件的 X奖励等，会累计在账号的「无限期X能量」余额里。它不按3小时或3天周期清零，也没有设置有效期。</p></div></details>
                <details><summary>套餐额度和无限期X能量有什么区别？</summary><div class="x-energy-guide-answer"><p>套餐额度是按周期限制（Free 为3小时和3天，会员为3天）、到期后按当前套餐重新计算的额度；无限期X能量是购买、赠送或奖励后保存在账号里的额外余额，用多少扣多少，不会随套餐周期恢复而清零。</p></div></details>
                <details><summary>使用功能时，会先扣套餐额度还是无限期X能量？</summary><div class="x-energy-guide-answer"><p>系统先判断本次费用能否放进套餐剩余额度（Free 需同时满足3小时和3天，会员只看3天）；可以就优先扣套餐。不够时，若无限期余额足够，就从余额扣除本次完整费用，不会把同一次费用拆成两部分。余额也不够时，本次操作不能继续。</p></div></details>
                <details><summary>为什么明明还有X能量，却提示暂时不能使用？</summary><div class="x-energy-guide-answer"><p>可先分别查看套餐额度（Free 看3小时和3天，会员看3天）及无限期余额。套餐额度不足时，余额须足够支付本次完整费用，不会把两者相加支付。长期记忆和部分 AI 模型还需要会员；因此看到某一处有余量，不代表当前功能一定可用。</p></div></details>
                <details><summary>套餐到期以后，剩余的无限期X能量还在吗？</summary><div class="x-energy-guide-answer"><p>还在。付费套餐到期后会切回 Free 并重置套餐周期额度；已有无限期X能量余额不会因此清空。</p></div></details>
              </div>
            </div>
            <div class="x-energy-guide-pane" id="xEnergyGuidePurchase" role="tabpanel" aria-labelledby="xEnergyGuideTabPurchase" data-energy-guide-pane="purchase" hidden>
              <div class="x-energy-guide-list">
                <details><summary>怎么购买X能量？</summary><div class="x-energy-guide-answer"><p>从 X世界进入「X能量」，打开「能量包」并选择要购买的档位，点击购买后会显示微信支付二维码。使用微信扫一扫完成付款；如果当前设备不便扫码，可用另一台设备显示二维码，再用微信扫描。</p></div></details>
                <details><summary>支付成功以后为什么还没有直接到账？</summary><div class="x-energy-guide-answer"><p>X能量包支付成功后会自动进入账号的「无限期X能量」，无需兑换；若未显示，可刷新或重新进入 X能量页。会员套餐则是付款成功后生成一枚兑换码，需要在 SHE.X 输入并兑换，套餐才会生效。</p></div></details>
                <details><summary>购买成功后，兑换码在哪里查看？</summary><div class="x-energy-guide-answer"><p>只有会员套餐会生成兑换码（X能量包自动到账，没有兑换码）。支付完成时，付款弹窗会显示可复制的兑换码。若已关闭弹窗，可回到「X能量」→「兑换码 / 购买记录」，在已完成的订单中找回并复制兑换码；必要时点击购买记录旁的刷新按钮。</p></div></details>
                <details><summary>拿到兑换码以后怎么兑换？</summary><div class="x-energy-guide-answer"><p>先确认已登录准备接收能量的 SHE.X 账号。进入「X能量」→「兑换码 / 购买记录」，在「兑换码」输入框粘贴兑换码，点击「立即兑换」。页面提示兑换成功后，能量就记到当前登录账号。请妥善保存兑换码，不要转发给别人。</p></div></details>
                <details><summary>兑换完成以后，X能量在哪里看？</summary><div class="x-energy-guide-answer"><p>回到 X能量个人主页，查看账号卡片中的「无限期X能量」；想核对这笔变化，可打开「消费记录」查看明细。兑换成功时页面会重新读取余额和记录，若显示尚未更新，可点击刷新或重新进入 X能量页。</p></div></details>
                <details><summary>为什么兑换码无法使用？</summary><div class="x-energy-guide-answer"><p>页面可能提示兑换码不存在或已失效、已经使用，或暂时无法完成请求。请核对复制内容是否完整、当前登录账号是否正确，并查看页面的具体提示。购买所得兑换码当前未设置到期时间；如购买记录中有完成订单却始终无法兑换，请联系管理员核对。</p></div></details>
                <details><summary>支付成功，但是兑换码没有显示怎么办？</summary><div class="x-energy-guide-answer"><p>如果买的是 X能量包，没有兑换码是正常的，能量已自动到账。如果买的是会员套餐，先回到购买时使用的账号，在「X能量」→「兑换码 / 购买记录」刷新并查找该订单；确认成功后可在记录中找回兑换码。如果仍未显示，请保存支付订单信息联系管理员，先不要重复付款。</p></div></details>
                <details><summary>兑换以后还是没有看到X能量怎么办？</summary><div class="x-energy-guide-answer"><p>先确认页面已提示「兑换成功」，再核对当前登录账号、主页的「无限期X能量」和「消费记录」。可刷新或重新进入 X能量页；已成功使用的兑换码不能再次兑换。若余额与记录仍对不上，请保留兑换提示和订单信息联系管理员。</p></div></details>
                <details><summary>不会兑换，或者购买/兑换出现异常怎么办？</summary><div class="x-energy-guide-answer"><p>如果按页面提示仍无法完成兑换，可以在 X能量页打开「联系客服」，联系管理员妮妮协助核对。请准备购买的大致时间、购买内容、支付截图或订单、兑换码相关截图、当前 SHE.X 账号，以及页面报错截图。</p><p>有问题找妮妮，妮妮可以帮你解答一切。</p></div></details>
              </div>
            </div>
          </section>

          <section class="x-energy-page-section x-energy-guide x-energy-beautify-guide" data-energy-section="beautify-guide" hidden>
            <nav class="x-energy-guide-tabs" role="tablist" aria-label="高级美化帮助分类">
              <button type="button" role="tab" id="xBeautifyGuideTabStart" aria-controls="xBeautifyGuideStart" aria-selected="true" data-beautify-guide-tab="start">美化入门</button>
              <button type="button" role="tab" id="xBeautifyGuideTabTemplates" aria-controls="xBeautifyGuideTemplates" aria-selected="false" data-beautify-guide-tab="templates">模板库</button>
              <button type="button" role="tab" id="xBeautifyGuideTabAI" aria-controls="xBeautifyGuideAI" aria-selected="false" data-beautify-guide-tab="ai">AI美化指南</button>
            </nav>
            <div class="x-energy-guide-pane" id="xBeautifyGuideStart" role="tabpanel" aria-labelledby="xBeautifyGuideTabStart" data-beautify-guide-pane="start">
              <p class="x-energy-beautify-intro">第一次接触 SHE.X 美化，从这里开始。</p>
              <div class="x-energy-guide-list">
                <details><summary>SHE.X 美化到底是什么？</summary><div class="x-energy-guide-answer"><p>最简单的理解：<strong>就是把 SHE.X 变成更符合你角色和世界风格的样子。</strong>它不只是“换个颜色”。</p><p>你既可以修改 SHE.X 原本就有的界面，比如聊天气泡、顶部人物区、输入框、X世界背景和原本的状态区域；也可以自己增加人物介绍、相册、地图、世界介绍、修炼状态卷、餐厅经营账本、NPC档案或小型互动组件。</p><p>所以以后看到“美化”，可以把它理解成两件事：<strong>改原来的。加新的。</strong></p></div></details>
                <details><summary>完全不会代码，也可以做吗？</summary><div class="x-energy-guide-answer"><p>可以。普通创作者真正需要会的，不是写 HTML、CSS。你只需要会说：“我想做什么。”</p><p>例如：“我想做一个浅粉色的人物介绍卡。”“我想做一个餐厅状态栏，平时收起来，点开以后看现金、食材和行动点。”“我想把聊天做成复古信纸风。”</p><p>以后代码可以交给 AI。你负责想效果、选图片、看预览、判断喜不喜欢；AI 负责写代码、按 SHE.X 规则修改、帮你排查错误。</p></div></details>
                <details><summary>什么叫“组件”？</summary><div class="x-energy-guide-answer"><p>组件可以理解成：<strong>自己往页面里加的一块新东西。</strong>一张人物介绍卡、一张地图、一个修炼状态卷、一个“今日心情”小卡片，都可以是组件。</p><p>X传讯和 X世界使用同一套自由组件基础能力，包括 HTML / CSS、Interaction、Image Slot、Motion。但它们所在页面和可使用的数据环境不同。</p></div></details>
                <details><summary>那聊天气泡也是组件吗？</summary><div class="x-energy-guide-answer"><p>不是一个概念。把原来的聊天气泡改颜色、把顶部人物栏改漂亮、把输入框换风格，是<strong>修改原本界面</strong>；额外加人物卡、地图、状态卷或相册，才是<strong>组件</strong>。</p><p>可以先记：<strong>改旧东西 = 界面美化；加新东西 = 组件。</strong></p></div></details>
                <details><summary>X传讯和 X世界有什么区别？</summary><div class="x-energy-guide-answer"><p><strong>X传讯是聊天房间。</strong>比较适合聊天气泡、聊天背景、开场介绍、小型人物卡、小型相册、修炼状态、经营状态、模拟器数据，以及每轮前后出现的小组件。经营、养成、模拟器很适合在聊天里放一个小状态栏。</p><p><strong>X世界更像世界主页 / 游戏主页。</strong>比较适合世界主视觉、地图、世界介绍、人物档案、NPC图鉴、地点介绍、大型相册、APP入口和世界功能区。</p><p>简单判断：<strong>经常聊天时要看的 → X传讯；整个世界的展示 → X世界。</strong></p></div></details>
                <details><summary>一个组件可以同时用在 X传讯和 X世界吗？</summary><div class="x-energy-guide-answer"><p>设计思路可以共用。例如一张人物介绍卡，可以做 X传讯版，也可以做 X世界版。但不是在 X传讯放一次，X世界就自动出现；它们还是两个不同位置。</p><p>可以理解成：<strong>同一种家具，可以放进两个房间。</strong></p></div></details>
                <details><summary>做美化时，经常会看到哪些词？</summary><div class="x-energy-guide-answer"><p><strong>Theme：</strong>整套风格，比如奶油黄、黑粉摇滚、星空、古风、清透仙侠；主要控制颜色、字体、圆角、阴影和整体气质。</p><p><strong>Host CSS：</strong>修改 SHE.X 原本就有的界面。看到它就想：改原来的东西。</p><p><strong>组件：</strong>自己新增加的一块内容，就像自己加了一件新家具。</p><p><strong>Image Slot：</strong>图片位置，可以理解成相框。</p><p><strong>Interaction：</strong>点击以后会发生变化，点一下会动。</p><p><strong>Binding：</strong>显示真实数据；这里不是写死的，而是从 SHE.X 当前数据里读出来的。</p><p><strong>Random Choice：</strong>非 AI 随机内容。例如提前准备“开心、想你、平静、😴”，打开组件或点击时随机显示一个。它不是 AI 状态，也不代表角色真实状态。</p></div></details>
                <details><summary>真实动态数据和随机内容有什么区别？</summary><div class="x-energy-guide-answer"><p>例如“现金：800”，买东西以后变成“现金：680”，这是作品里的真实事实，应该使用 <strong>Binding / 动态数据</strong>。</p><p>如果“今日幸运值：7”只是从 3 / 5 / 7 / 9 / 11 随机抽出来，那只是 <strong>Random Choice</strong>。</p><p>最简单判断：<strong>真的状态 → Binding；好玩的小随机 → Random Choice。</strong></p></div></details>
                <details><summary>Random Choice 会不会影响角色？</summary><div class="x-energy-guide-answer"><p>不会。比如随机组件显示“今日心情：想你”，不代表角色真实状态一定是“想你”，也不会自动修改世界状态。它只是装饰、彩蛋或小互动。</p><p>随机结果本身不写入聊天记录、AI上下文或世界状态。</p></div></details>
                <details><summary>第一次做美化，应该从什么开始？</summary><div class="x-energy-guide-answer"><p>第一次不要挑战巨大游戏主页、20个按钮或30个动态变量。建议先做一张人物卡、一个横滑相册、一个三项状态栏，或者一个开场介绍。</p><p>先完整跑一遍：<strong>创建 → 预览 → 换图 → 保存。</strong></p></div></details>
                <details><summary>第一次实际操作应该怎么做？</summary><div class="x-energy-guide-answer"><ol><li>先决定做 X传讯还是 X世界。</li><li>告诉 AI 想做什么。</li><li>说风格。</li><li>说需要哪些功能。</li><li>让 AI 给完整可复制版本，并告诉每部分放在哪里。</li><li>放进 SHE.X 预览。检查好不好看、字能不能看清、图片有没有裁坏、手机会不会太挤、按钮能不能点、动态数据有没有变化。</li><li>满意以后再保存。</li></ol></div></details>
                <details><summary>我不会改代码，AI给我的东西怎么用？</summary><div class="x-energy-guide-answer"><p>让 AI 明确告诉你：哪段放 HTML、哪段放 CSS、Interaction 要不要填、图片槽有几个、每张图片是什么比例、动态数据用了什么，以及 Random Choice 有没有用。</p><p>不要让 AI 只说“改第35行”。最好直接要求：<strong>给我整体替换版本。</strong></p></div></details>
                <details><summary>为什么预览有时候是空白的？</summary><div class="x-energy-guide-answer"><p>正常美化工作台应该提供模拟内容。例如 X传讯预览至少可以看到用户消息、角色消息、旁白、动作和较长文字，这样才能判断气泡、旁白、长文本和间距。</p><p>如果出现完全空白，可以先退出重新进入或刷新预览；若持续出现，再按页面错误提示排查。</p></div></details>
                <details><summary>为什么美化预览里会出现我刚刚真实聊过的话？</summary><div class="x-energy-guide-answer"><p>当前正常设计：<strong>美化预览使用独立模拟消息，不依赖用户真实聊天记录。</strong>真实聊天正文不应该成为高级美化工作台的预览内容。</p></div></details>
                <details><summary>为什么图片不显示？</summary><div class="x-energy-guide-answer"><p>先检查有没有真正上传图片、有没有放进正确 Image Slot，以及图片比例是否适合当前设计。</p><p>如果设计里有多个 Image Slot，而只上传部分图片，对应位置可能没有内容。</p></div></details>
                <details><summary>为什么点击没有反应？</summary><div class="x-energy-guide-answer"><p>普通静态组件本身不会自动产生点击行为。如果要求点人物切资料、点按钮换内容、点下一张换照片，通常需要 Interaction。</p><p>简单展开 / 收起也可以采用普通折叠结构，不一定需要复杂 Interaction。</p></div></details>
                <details><summary>为什么 AI 说“花了120块”，现金却没有变化？</summary><div class="x-energy-guide-answer"><p>正文写“你付了120元”，只表示剧情文本发生了这件事，不一定代表世界状态已经完成更新。</p><p>如果动态组件里的现金没有变化，应优先检查<strong>模拟器状态是否真正结算</strong>，而不是先修改美化代码。</p></div></details>
                <details><summary>怎么测试模拟器有没有正常推进？</summary><div class="x-energy-guide-answer"><p>例如当前现金800、行动点3、食材20，然后发生“花120元采购食材”。回复后再看动态组件。</p><p>如果现金减少、食材增加、行动点变化，说明状态确实发生了改变。如果只有正文变化、动态数据没有变化，应检查模拟器运行和状态结算。</p></div></details>
                <details><summary>“本轮状态未执行”是什么意思？</summary><div class="x-energy-guide-answer"><p>它表示：<strong>本轮没有产生最终被系统执行的状态变化。</strong>它不等于高级美化坏了。</p><p>如果页面组件本身能够正常显示数据，而只有本轮状态没有变化，应优先检查模拟器 AI / 状态结算链，而不是 CSS。不要把所有原因归成一种。</p></div></details>
                <details><summary>为什么有的东西 X传讯能做，X世界不一定一样？</summary><div class="x-energy-guide-answer"><p>因为两者虽然共用组件基础能力，但运行环境并不完全相同。特别是世界状态、模拟器进度和动态 Binding，需要当前宿主真正拥有对应数据上下文。</p><p>具体可用的位置和数据，可查看<strong>「AI美化指南」</strong>中的公开创作说明。</p></div></details>
                <details><summary>保存失败怎么办？</summary><div class="x-energy-guide-answer"><p>第一件事：<strong>不要自己乱删代码。</strong>直接把 SHE.X 返回的完整错误提示复制给 AI。</p><p>例如 CSS 属性不允许、Interaction 无效、Binding 上下文不对、图片槽名称错误。然后告诉 AI：“这是 SHE.X 返回的原始错误，请只针对这个错误修复，并给我完整替换版本。”</p></div></details>
                <details><summary>怎么避免把一个好好的美化改坏？</summary><div class="x-energy-guide-answer"><p>三个习惯：大改前保留当前正常版本；一次不要同时改很多东西；出问题以后只修真正报错的部分。</p></div></details>
                <details><summary>我到底应该选哪种美化能力？</summary><div class="x-energy-guide-answer"><ul><li>想统一整体风格 → Theme</li><li>想改原本聊天气泡、顶部栏 → Host CSS</li><li>想新加人物卡、地图、相册、状态卷 → 组件</li><li>想以后换图 → Image Slot</li><li>想点击有反应 → Interaction</li><li>想显示真实数据 → Binding</li><li>想随机一个小彩蛋 → Random Choice</li></ul></div></details>
                <details><summary>我需要自己学 HTML 和 CSS 吗？</summary><div class="x-energy-guide-answer"><p>不是必须。如果只是想做漂亮作品，不需要先成为程序员。可以自己负责创意、AI 负责代码、SHE.X 负责运行。</p><p>以后想自己精细调整时，再慢慢学习 HTML / CSS。</p></div></details>
              </div>
              <div class="x-energy-beautify-recap"><strong>第一次只记住这六件事</strong><p>改原来的 → 界面美化<br>加新的 → 组件<br>要放图 → Image Slot<br>要点击 → Interaction<br>要真实数据 → Binding<br>要随机彩蛋 → Random Choice</p></div>
            </div>
            <div class="x-energy-guide-pane" id="xBeautifyGuideTemplates" role="tabpanel" aria-labelledby="xBeautifyGuideTabTemplates" data-beautify-guide-pane="templates" hidden></div>
            <div class="x-energy-guide-pane x-energy-ai-guide-pane" id="xBeautifyGuideAI" role="tabpanel" aria-labelledby="xBeautifyGuideTabAI" data-beautify-guide-pane="ai" hidden>
              <h3>SHE.X 全域美化 AI 指南</h3>
              <p>把这份指南和你的美化需求一起发给 DeepSeek、豆包、ChatGPT 或其他 AI，它会更清楚该怎样帮你完成美化。</p>
              <div class="x-energy-ai-guide-actions">
                <button type="button" data-beautify-guide-copy>复制完整指南</button>
                <a href="${escapeHtml(BEAUTIFY_GUIDE_URL)}" download="${escapeHtml(BEAUTIFY_GUIDE_FILENAME)}">下载指南文件</a>
              </div>
              <p class="x-energy-ai-guide-status" data-beautify-guide-status aria-live="polite"></p>
              <pre class="x-energy-ai-guide-text" data-beautify-guide-text role="region" aria-label="美化助手公开指南原文" tabindex="0">正在读取完整指南…</pre>
            </div>
          </section>

          <section class="x-energy-page-section x-energy-contact" data-energy-section="contact" hidden>
            <div class="x-energy-section-heading">
              <div><h3>联系管理员</h3><p>支付或兑换遇到复杂问题，可以直接联系。</p></div>
            </div>
            <div class="x-energy-contact-card">
              <img src="${escapeHtml(ADMIN_QR_URL)}" alt="管理员二维码">
              <div>
                <strong>管理员QQ：2140980147</strong>
                <p>请说明账号ID、订单时间和遇到的问题，方便更快核对。</p>
                <button type="button" data-energy-copy-admin>复制管理员QQ</button>
              </div>
            </div>
          </section>

          <section class="x-energy-page-section x-energy-ledger" data-energy-section="ledger" hidden>
            <div class="x-energy-ledger-heading">
              <div><h3>消费记录</h3><p>每一笔消费、充值和奖励都可以在这里核对。</p></div>
            </div>
            <div class="x-energy-tabs" role="tablist" aria-label="记录分类">
              <button class="active" type="button" data-energy-category="all">全部</button>
              <button type="button" data-energy-category="consume">消费</button>
              <button type="button" data-energy-category="recharge">充值</button>
              <button type="button" data-energy-category="reward">奖励</button>
            </div>
            <div class="x-energy-log-list" data-energy-log-list aria-live="polite"></div>
            <button class="x-energy-load-more" type="button" data-energy-load-more hidden>加载更多</button>
          </section>
        </div>
        <div class="x-energy-modal" data-energy-email-modal hidden>
          <section class="x-energy-modal-card" role="dialog" aria-modal="true" aria-labelledby="xEnergyEmailTitle">
            <button class="x-energy-modal-close" type="button" data-energy-email-cancel aria-label="关闭">×</button>
            <h3 id="xEnergyEmailTitle">绑定邮箱</h3>
            <p>验证成功后，该邮箱会绑定到当前账号，并可用于邮箱验证码登录。</p>
            <label>邮箱地址<input type="email" data-energy-email-input autocomplete="email" placeholder="name@example.com"></label>
            <div class="x-energy-email-code-row"><label>验证码<input type="text" data-energy-email-code inputmode="numeric" autocomplete="one-time-code" maxlength="12" placeholder="邮箱验证码"></label><button type="button" data-energy-email-send>发送验证码</button></div>
            <label class="x-energy-email-invite-row">邀请码（选填）<input type="text" data-energy-email-invite autocomplete="off" maxlength="8" placeholder="有邀请码可以填写，没有可以留空"></label>
            <p class="x-energy-modal-status" data-energy-email-status aria-live="polite"></p>
            <div class="x-energy-modal-actions"><button type="button" data-energy-email-cancel>取消</button><button class="is-primary" type="button" data-energy-email-submit>确认绑定</button></div>
          </section>
        </div>
        <div class="x-energy-modal" data-energy-delete-modal hidden>
          <section class="x-energy-modal-card" role="dialog" aria-modal="true" aria-labelledby="xEnergyDeleteTitle">
            <h3 id="xEnergyDeleteTitle">申请注销账号</h3>
            <div data-energy-delete-step="1"><p>这里只会提交注销申请，不会立即删除或停用账号。申请处理中，你仍可正常使用并随时撤回。</p><div class="x-energy-modal-actions"><button type="button" data-energy-delete-cancel>取消</button><button class="is-danger" type="button" data-energy-delete-next>继续</button></div></div>
            <div data-energy-delete-step="2" hidden><p>请再次确认：提交后管理员会进行人工核对，当前不会自动删除任何数据。</p><p class="x-energy-modal-status" data-energy-delete-status aria-live="polite"></p><div class="x-energy-modal-actions"><button type="button" data-energy-delete-cancel>返回</button><button class="is-danger" type="button" data-energy-delete-confirm>确认提交申请</button></div></div>
          </section>
        </div>
      </div>
    `;
    const tabbar = document.getElementById("xTabbar");
    if (tabbar?.parentNode === transmission) transmission.insertBefore(panel, tabbar);
    else transmission.appendChild(panel);
    buildHubGrid(panel);
    bindPanel(panel);
    return panel;
  }

  function buildHubGrid(panel) {
    const grid = panel?.querySelector("[data-energy-app-grid]");
    if (!grid) return;
    grid.innerHTML = HUB_TILES.map((tile) => `
      <button class="x-energy-hub-tile" type="button" data-energy-app-action="${escapeHtml(tile.view)}">
        <span class="x-energy-hub-tile-icon"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${HUB_ICONS[tile.icon] || ""}</svg></span>
        <span class="x-energy-hub-tile-label" data-energy-app-label>${escapeHtml(tile.label)}</span>
      </button>
    `).join("");
  }
  function closeEnergyGuideDetails(panel) {
    panel.querySelectorAll('[data-energy-section="energy-guide"] .x-energy-guide-list details[open]').forEach((item) => { item.open = false; });
  }
  function selectEnergyGuideTab(panel, tab) {
    const selected = panel.querySelector(`[data-energy-guide-tab="${tab}"]`);
    if (!selected) return;
    closeEnergyGuideDetails(panel);
    panel.querySelectorAll("[data-energy-guide-tab]").forEach((button) => {
      button.setAttribute("aria-selected", String(button === selected));
    });
    panel.querySelectorAll("[data-energy-guide-pane]").forEach((pane) => {
      pane.hidden = pane.dataset.energyGuidePane !== tab;
    });
  }
  function closeBeautifyGuideDetails(panel) {
    panel.querySelectorAll('[data-energy-section="beautify-guide"] .x-energy-guide-list details[open]').forEach((item) => { item.open = false; });
  }
  async function loadBeautifyGuide(panel) {
    const content = panel.querySelector("[data-beautify-guide-text]");
    const status = panel.querySelector("[data-beautify-guide-status]");
    if (!content) return "";
    if (!beautifyGuideTextPromise) {
      beautifyGuideTextPromise = fetch(BEAUTIFY_GUIDE_URL)
        .then((response) => {
          if (!response.ok) throw new Error("GUIDE_LOAD_FAILED");
          return response.text();
        })
        .catch((error) => {
          beautifyGuideTextPromise = null;
          throw error;
        });
    }
    try {
      const text = await beautifyGuideTextPromise;
      content.textContent = text;
      if (status) status.textContent = "";
      return text;
    } catch (_) {
      content.textContent = "完整指南暂时无法读取，请稍后重新打开本栏。";
      if (status) status.textContent = "读取失败，请稍后重试。";
      return "";
    }
  }
  function selectBeautifyGuideTab(panel, tab) {
    const selected = panel.querySelector('[data-beautify-guide-tab="' + tab + '"]');
    if (!selected) return;
    closeBeautifyGuideDetails(panel);
    panel.querySelectorAll("[data-beautify-guide-tab]").forEach((button) => {
      button.setAttribute("aria-selected", String(button === selected));
    });
    panel.querySelectorAll("[data-beautify-guide-pane]").forEach((pane) => {
      pane.hidden = pane.dataset.beautifyGuidePane !== tab;
    });
    if (tab === "ai") void loadBeautifyGuide(panel);
    if (tab === "templates") {
      const mount = panel.querySelector("#xBeautifyGuideTemplates");
      if (mount && !mount.dataset.templateLibraryMounted) {
        mount.dataset.templateLibraryMounted = "true";
        if (window.SHEXBeautifyTemplateLibrary?.mount) window.SHEXBeautifyTemplateLibrary.mount(mount);
        else mount.textContent = "模板库暂时无法打开，请刷新后重试。";
      }
    }
  }
  function applyView(view) {
    const panel = ensurePanel();
    if (!panel) return;
    const previousView = state.view;
    state.view = view;
    const isHub = view === "hub";
    panel.classList.toggle("is-hub-view", isHub);
    panel.classList.toggle("is-plan-view", view === "plans");
    panel.classList.toggle("is-ledger-view", view === "ledger");
    const hub = panel.querySelector('[data-energy-view="hub"]');
    const detail = panel.querySelector('[data-energy-view="detail"]');
    if (hub) hub.hidden = !isHub;
    if (detail) detail.hidden = isHub;
    panel.querySelectorAll("[data-energy-section]").forEach((section) => {
      section.hidden = section.dataset.energySection !== view;
    });
    if (view === "energy-guide" && previousView !== view) selectEnergyGuideTab(panel, "consume");
    if (view === "beautify-guide" && previousView !== view) selectBeautifyGuideTab(panel, "start");
    const homeBack = panel.querySelector(".x-energy-back");
    if (homeBack) homeBack.hidden = !isHub;
    const detailBack = panel.querySelector(".x-energy-detail-back");
    if (detailBack) detailBack.hidden = isHub;
    const titleEl = panel.querySelector("[data-energy-title]");
    const subtitleEl = panel.querySelector("[data-energy-subtitle]");
    const eyebrowEl = panel.querySelector("[data-energy-eyebrow]");
    const detailTitleEl = panel.querySelector("[data-energy-detail-title]");
    if (isHub) {
      if (titleEl) titleEl.textContent = "X能量";
      if (subtitleEl) subtitleEl.textContent = "套餐、能量包、兑换与每一笔记录，都在这里。";
    } else {
      if (titleEl) titleEl.textContent = VIEW_TITLES[view] || "X能量";
      if (detailTitleEl) detailTitleEl.textContent = "返回";
    }
    if (eyebrowEl) eyebrowEl.hidden = !isHub;
    if (subtitleEl) subtitleEl.hidden = !isHub;
    const refreshBtn = panel.querySelector("[data-energy-refresh]");
    if (refreshBtn) refreshBtn.hidden = !(isHub || view === "redeem" || view === "ledger");
    panel.scrollTo({ top: 0, behavior: "auto" });
  }

  function renderFeedbackFiles() {
    const panel = ensurePanel();
    const mount = panel?.querySelector("[data-energy-feedback-previews]");
    if (!mount) return;
    feedbackPreviewUrls.forEach((url) => URL.revokeObjectURL(url));
    feedbackPreviewUrls = [];
    mount.hidden = !feedbackFiles.length;
    mount.innerHTML = "";
    feedbackFiles.forEach((file, index) => {
      const url = URL.createObjectURL(file);
      feedbackPreviewUrls.push(url);
      const item = document.createElement("div");
      item.className = "x-energy-feedback-preview";
      const image = document.createElement("img");
      image.src = url;
      image.alt = "待提交截图" + (index + 1);
      const remove = document.createElement("button");
      remove.type = "button";
      remove.dataset.energyFeedbackRemove = String(index);
      remove.setAttribute("aria-label", "移除截图" + (index + 1));
      remove.textContent = "×";
      item.append(image, remove);
      mount.append(item);
    });
  }

  function renderFeedbackHistory() {
    const panel = ensurePanel();
    const mount = panel?.querySelector("[data-energy-feedback-list]");
    const more = panel?.querySelector("[data-energy-feedback-more]");
    if (!mount || !more) return;
    more.hidden = !state.feedbackHasMore;
    more.disabled = state.feedbackLoading;
    more.textContent = state.feedbackLoading ? "加载中…" : "加载更多";
    if (!state.feedbackItems.length) {
      mount.innerHTML = state.feedbackLoading
        ? '<p class="x-energy-feedback-empty">正在读取反馈记录…</p>'
        : state.feedbackError
          ? '<p class="x-energy-feedback-empty">' + escapeHtml(state.feedbackError) + '</p>'
          : '<div class="x-energy-feedback-empty">还没有提交过反馈<small>如果遇到没有在常见问题里找到的情况，可以在上方告诉我们。</small></div>';
      return;
    }
    mount.innerHTML = state.feedbackItems.map((item) => {
      const images = (Array.isArray(item.images) ? item.images : []).filter((image) => image?.url);
      const imageHtml = images.map((image, index) =>
        '<img src="' + escapeHtml(image.url) + '" alt="反馈截图' + (index + 1) + '" loading="lazy">'
      ).join("");
      const replied = item.status === "replied" && Boolean(item.adminReply);
      return '<article class="x-energy-feedback-item">'
        + '<div class="x-energy-feedback-meta"><time>' + escapeHtml(formatTime(item.createdAt)) + '</time>'
        + '<span class="' + (replied ? "is-replied" : "") + '">' + (replied ? "已回复" : "等待回复") + '</span></div>'
        + '<p class="x-energy-feedback-question">' + escapeHtml(item.content || "") + '</p>'
        + (imageHtml ? '<div class="x-energy-feedback-images">' + imageHtml + '</div>' : "")
        + (replied ? '<div class="x-energy-feedback-reply"><strong>妮妮回复</strong><p>'
          + escapeHtml(item.adminReply) + '</p><time>回复时间：'
          + escapeHtml(formatTime(item.repliedAt)) + '</time></div>' : "")
        + '</article>';
    }).join("") + (state.feedbackError ? '<p class="x-energy-feedback-empty">' + escapeHtml(state.feedbackError) + '</p>' : "");
    mount.querySelectorAll(".x-energy-feedback-images img").forEach((image) => {
      image.addEventListener("error", () => {
        const note = document.createElement("span");
        note.className = "x-energy-feedback-image-error";
        note.textContent = "截图暂时无法显示";
        image.replaceWith(note);
      }, { once: true });
    });
  }

  async function loadFeedbackHistory(reset = false) {
    if (state.feedbackLoading && !reset) return;
    const requestId = ++state.feedbackRequestId;
    if (reset) {
      state.feedbackItems = [];
      state.feedbackNextSkip = 0;
      state.feedbackHasMore = false;
    }
    state.feedbackError = "";
    state.feedbackLoading = true;
    renderFeedbackHistory();
    const requestSkip = state.feedbackNextSkip;
    const knownIds = new Set(state.feedbackItems.map((item) => item.feedbackId));
    try {
      const result = await window.SHEXFeedback.listMine(requestSkip, 20);
      if (requestId !== state.feedbackRequestId) return;
      if (result?.ok === false || result?.success === false) throw new Error(result.message || "读取失败");
      const items = Array.isArray(result?.items) ? result.items : [];
      const returnedIds = new Set(items.map((item) => item.feedbackId));
      const localAdds = state.feedbackItems.filter((item) => !knownIds.has(item.feedbackId));
      const presentIds = new Set(state.feedbackItems.map((item) => item.feedbackId));
      state.feedbackItems = (reset ? localAdds : state.feedbackItems)
        .concat(items.filter((item) => !presentIds.has(item.feedbackId)));
      state.feedbackNextSkip = Number(result?.nextSkip ?? requestSkip + items.length)
        + localAdds.filter((item) => !returnedIds.has(item.feedbackId)).length;
      state.feedbackHasMore = Boolean(result?.hasMore);
    } catch (error) {
      if (requestId !== state.feedbackRequestId) return;
      state.feedbackError = errorText(error, "反馈记录暂时无法读取，请稍后重试");
      return;
    } finally {
      if (requestId === state.feedbackRequestId) {
        state.feedbackLoading = false;
        renderFeedbackHistory();
      }
    }
  }

  async function submitEnergyFeedback(event) {
    event.preventDefault();
    if (state.feedbackSubmitting) return;
    const form = event.currentTarget;
    const content = form.querySelector("#xEnergyFeedbackContent");
    const button = form.querySelector("[data-energy-feedback-submit]");
    const status = form.querySelector("[data-energy-feedback-status]");
    const value = content.value.trim();
    const submittingOwner = String(window.SHEXAuth?.current?.()?.userId || "");
    if (!value) {
      status.textContent = "请先填写问题内容";
      content.focus();
      return;
    }
    state.feedbackSubmitting = true;
    const submitRequestId = ++state.feedbackSubmitRequestId;
    button.disabled = true;
    button.textContent = "提交中…";
    status.textContent = "";
    try {
      const result = await window.SHEXFeedback.submit({ content: value, files: feedbackFiles });
      if (String(window.SHEXAuth?.current?.()?.userId || "") !== submittingOwner) return;
      if (result?.ok === false || result?.success === false) throw new Error(result.message || "提交失败");
      content.value = "";
      feedbackFiles = [];
      form.querySelector("[data-energy-feedback-images]").value = "";
      renderFeedbackFiles();
      status.textContent = "反馈已提交";
      if (result?.item) {
        state.feedbackItems.unshift(result.item);
        state.feedbackNextSkip += 1;
        renderFeedbackHistory();
      }
    } catch (error) {
      if (String(window.SHEXAuth?.current?.()?.userId || "") === submittingOwner) {
        status.textContent = errorText(error, "提交失败，请稍后重试");
      }
    } finally {
      if (submitRequestId === state.feedbackSubmitRequestId) {
        state.feedbackSubmitting = false;
        button.disabled = false;
        button.textContent = "提交反馈";
      }
    }
  }

  async function showView(view) {
    const target = SECTION_TO_VIEW[view] || view || "hub";
    applyView(target);
    if (target === "feedback") void loadFeedbackHistory(true);
    if (target === "redeem") await loadOrders();
    if (target === "ledger") await loadLogs(true);
  }  // 使用指南里的价格格：只显示当前用户自己的价格（Free 价或会员价），不并排展示两种。
  function fillFeaturePrices(root = document) {
    root.querySelectorAll("[data-energy-feature-price]").forEach((cell) => {
      const [key, freePrice, memberPrice] = String(cell.dataset.energyFeaturePrice || "").split(":");
      const price = key === "x_letter_card" ? 2 : Number(window.SHEXAuth?.featurePrice?.(key, Number(freePrice), Number(memberPrice)) ?? freePrice);
      const text = price === 0 ? "会员权益 · 免费" : `${price}点`;
      if (cell.textContent !== text) cell.textContent = text;
    });
  }

  function isMemberPlanCode(code) {
    return ["plus", "pro", "ultra"].includes(String(code || "").trim().toLowerCase());
  }

  function logBalanceLines(item) {
    const balance = item?.balanceAfter || {};
    const lines = [];
    // 展示以当前有效套餐为准：历史记录可能没有 plan，或仍保存升级前的 Free。
    const currentPlan = state.plan?.currentPlan;
    const planCode = currentPlan?.code || currentPlan?.plan || item?.plan;
    if (!isMemberPlanCode(planCode) && Number.isFinite(Number(balance.cycle3h))) lines.push(`3小时：${Number(balance.cycle3h)}`);
    if (Number.isFinite(Number(balance.cycle3d))) lines.push(`3天：${Number(balance.cycle3d)}`);
    if (Number.isFinite(Number(balance.pack))) lines.push(`能量包：${Number(balance.pack)}`);
    return lines;
  }

  function renderLogs() {
    const panel = ensurePanel();
    const list = panel?.querySelector("[data-energy-log-list]");
    if (!list) return;
    const filtered = state.category === "all"
      ? state.logs
      : state.logs.filter((item) => item.category === state.category);
    if (!filtered.length) {
      list.innerHTML = `<p class="x-energy-empty">${state.loading ? "正在读取记录…" : "这里还没有记录"}</p>`;
    } else {
      list.innerHTML = filtered.map((item) => {
        const direction = item.direction === "out" || item.direction === "debit" ? -1 : 1;
        const change = Number(item.amount || item.change?.pack || item.change?.cycle3h || 0);
        return `
          <article class="x-energy-log-row" data-category="${escapeHtml(item.category || "consume")}">
            <div class="x-energy-log-copy">
              <strong>${escapeHtml(item.title || "其他X能量消费")}</strong>
              <small>${escapeHtml(formatTime(item.createdAt))}</small>
            </div>
            <div class="x-energy-log-value">
              <strong>${direction > 0 ? "+" : "−"}${Math.abs(change)}</strong>
              <small class="x-energy-log-balance">${logBalanceLines(item).map((line) => `<span>${escapeHtml(line)}</span>`).join("")}</small>
            </div>
          </article>
        `;
      }).join("");
    }
    const loadMore = panel.querySelector("[data-energy-load-more]");
    if (loadMore) loadMore.hidden = !state.hasMore;
  }

  function renderCampaign() {
    const panel = ensurePanel();
    const box = panel?.querySelector("[data-energy-campaign]");
    if (!box) return;
    const campaign = state.campaign;
    if (!campaign || campaign.status !== "active") {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    box.querySelector("[data-energy-campaign-title]").textContent = campaign.title || "全员赠送能量包";
    const packAmount = Number(campaign.packAmount || 0);
    box.querySelector("[data-energy-campaign-description]").textContent =
      campaign.description || `每个账号可领取一次，到账 ${packAmount} 点能量包。`;
    const button = box.querySelector("[data-energy-campaign-claim]");
    button.disabled = Boolean(campaign.claimed);
    button.textContent = campaign.claimed ? "已经领取" : "立即领取";
    box.querySelector("[data-energy-campaign-status]").textContent =
      campaign.claimed ? "本次福利已经领取过啦" : "";
  }

  function renderOverview() {
    const panel = ensurePanel();
    const box = panel?.querySelector("[data-energy-account-card]");
    if (!box) return;
    const currentPlan = state.plan?.currentPlan || {};
    const quota = state.plan?.quota || {};
    const planEl = box.querySelector("[data-energy-plan-name]");
    const expireEl = box.querySelector("[data-energy-overview-expire]");
    const middleLabelEl = box.querySelector("[data-energy-overview-middle-label]");
    const packEl = box.querySelector("[data-energy-overview-pack]");
    const cycle3hEl = box.querySelector("[data-energy-overview-cycle3h]");
    if (planEl) planEl.textContent = planBadgeLabel(currentPlan.code || currentPlan.plan, currentPlan.name);
    const planCode = currentPlan.code || currentPlan.plan;
    const freeQuota = planCode === "free_cloud" || (!planCode && currentPlan.isFree === true);
    if (middleLabelEl) middleLabelEl.textContent = freeQuota ? "3天额度" : "套餐到期时间";
    if (expireEl) {
      if (freeQuota) {
        const cap = Number(quota.cycle3dLimit || 0);
        const used = Number(quota.cycle3dUsed || 0);
        const balance = Math.max(0, Math.min(cap, Number(quota.cycle3dBalance ?? Math.max(0, cap - used))));
        expireEl.textContent = cap > 0 && Number.isFinite(balance) ? `${balance}/${cap}` : "—";
      } else {
        expireEl.textContent = currentPlan.isFree || !Number(currentPlan.expireAt) ? "长期有效" : formatDate(currentPlan.expireAt);
      }
    }
    // 「无限期X能量」不是新账本、也不做第二套汇总：直接复用「详情」弹窗里已经在展示的
    // quota.packBalance（详情弹窗标题为「资源包余额」），它本身已经包含能量包、奖励、
    // 兑换等长期余额来源。首页只是把这个既有值提到主卡上，不做任何再计算。
    if (packEl) {
      const packBalance = Number(quota.packBalance);
      packEl.textContent = Number.isFinite(packBalance) ? `${packBalance} 点` : "—";
    }
    if (cycle3hEl) {
      fillFeaturePrices();
      // Plus / Pro / Ultra 只受 3 天额度限制：直接展示 3 天剩余额度；Free 保留 3 小时额度。
      const memberQuota = isMemberPlanCode(currentPlan.code || currentPlan.plan);
      const labelEl = box.querySelector("[data-energy-overview-cycle-label]");
      if (labelEl) labelEl.textContent = memberQuota ? "3天额度" : "3小时额度";
      const cap = Number((memberQuota ? quota.cycle3dLimit : quota.cycle3hLimit) || 0);
      const used = Number((memberQuota ? quota.cycle3dUsed : quota.cycle3hUsed) || 0);
      const reported = memberQuota ? quota.cycle3dBalance : quota.cycle3hBalance;
      const balance = Math.min(cap, Number(reported ?? Math.max(0, cap - used)));
      cycle3hEl.textContent = cap ? `${balance}/${cap}` : "—";
    }
  }

  function isNativeAppShell() {
    try {
      if (window.ShexNativeStorage && typeof window.ShexNativeStorage.isNative === "function") return Boolean(window.ShexNativeStorage.isNative());
      const capacitor = window.Capacitor || window.ShexCapacitorBridge?.Capacitor;
      return Boolean(capacitor?.isNativePlatform?.());
    } catch (_) {
      return false;
    }
  }

  function errorText(error, fallback = "操作失败，请稍后重试") {
    return String(error?.message || error?.detail || fallback).trim() || fallback;
  }

  function setAccountStatus(message = "", isError = false) {
    const status = ensurePanel()?.querySelector("[data-energy-account-status]");
    if (!status) return;
    status.textContent = String(message || "");
    status.hidden = !status.textContent;
    status.classList.toggle("is-error", Boolean(isError));
  }

  function setModalStatus(selector, message = "", isError = false) {
    const status = ensurePanel()?.querySelector(selector);
    if (!status) return;
    status.textContent = String(message || "");
    status.classList.toggle("is-error", Boolean(isError));
  }

  function bindingEmail() {
    const value = document.getElementById(PAGE_ID)?.querySelector("[data-energy-email-input]")?.value || "";
    try { return window.SHEXEmailAuth?.normalizeEmail?.(value) || ""; } catch (_) { return ""; }
  }

  function bindingPending(email) {
    const pending = window.SHEXEmailAuth?.getPendingVerification?.();
    return pending?.email === email && pending?.verificationInfo?.verification_id ? pending : null;
  }

  function resetBindingCodeUI(keepSendDisabled = false) {
    const modal = document.getElementById(PAGE_ID)?.querySelector("[data-energy-email-modal]");
    if (!modal) return;
    const codeInput = modal.querySelector("[data-energy-email-code]");
    const sendButton = modal.querySelector("[data-energy-email-send]");
    if (codeInput) codeInput.value = "";
    if (sendButton) { sendButton.disabled = keepSendDisabled; sendButton.textContent = "发送验证码"; }
    setModalStatus("[data-energy-email-status]", "");
  }

  async function releaseEmailIdentity({ keepSendDisabled = false } = {}) {
    const token = state.emailIdentityTransition;
    state.emailIdentityTransition = null;
    state.emailFlowEmail = "";
    state.verifiedEmail = "";
    state.emailFlowEpoch += 1;
    window.SHEXEmailAuth?.clearPendingVerification?.();
    resetBindingCodeUI(keepSendDisabled);
    try {
      await window.SHEXAuth?.resetCloudBaseIdentityToAnonymous?.();
    } finally {
      if (token) window.SHEXCloudBaseClient?.endVerifiedIdentityTransition?.(token);
    }
  }

  async function closeEmailModal() {
    state.emailModalOwnerUserId = "";
    const modal = document.getElementById(PAGE_ID)?.querySelector("[data-energy-email-modal]");
    if (modal) {
      modal.hidden = true;
      const emailInput = modal.querySelector("[data-energy-email-input]");
      if (emailInput) emailInput.value = "";
    }
    await releaseEmailIdentity().catch(() => {});
  }

  async function openEmailModal() {
    await releaseEmailIdentity().catch(() => {});
    const modal = ensurePanel()?.querySelector("[data-energy-email-modal]");
    if (!modal) return;
    state.emailModalOwnerUserId = String(state.homeSummary?.account?.userId || "");
    modal.querySelector("[data-energy-email-input]").value = "";
    const inviteInput = modal.querySelector("[data-energy-email-invite]");
    if (inviteInput) inviteInput.value = "";
    setModalStatus("[data-energy-email-status]", "");
    modal.hidden = false;
    modal.querySelector("[data-energy-email-input]")?.focus();
  }

  async function sendBindingEmailCode(button) {
    const panel = ensurePanel();
    const email = bindingEmail();
    if (!email) return setModalStatus("[data-energy-email-status]", "请输入有效的邮箱地址", true);
    if (typeof window.SHEXEmailAuth?.sendCode !== "function" || typeof window.SHEXCloudBaseClient?.beginVerifiedIdentityTransition !== "function") {
      return setModalStatus("[data-energy-email-status]", "邮箱验证组件尚未就绪，请刷新后重试", true);
    }
    button.disabled = true;
    let epoch = state.emailFlowEpoch;
    try {
      if (!bindingPending(email)) await releaseEmailIdentity({ keepSendDisabled: true });
      epoch = state.emailFlowEpoch;
      if (bindingEmail() !== email) return;
      if (!state.emailIdentityTransition) state.emailIdentityTransition = window.SHEXCloudBaseClient.beginVerifiedIdentityTransition("email");
      if (!state.emailIdentityTransition) throw new Error("邮箱身份切换组件未就绪");
      state.emailFlowEmail = email;
      epoch = state.emailFlowEpoch;
      const transition = state.emailIdentityTransition;
      const sent = await window.SHEXEmailAuth.sendCode(email);
      if (state.emailFlowEpoch !== epoch || state.emailIdentityTransition !== transition || bindingEmail() !== email) return;
      state.verifiedEmail = "";
      panel.querySelector("[data-energy-email-input]").value = sent?.email || email;
      panel.querySelector("[data-energy-email-code]").value = "";
      setModalStatus("[data-energy-email-status]", "验证码已发送，请查收邮箱。", false);
    } catch (error) {
      if (state.emailFlowEpoch !== epoch) return;
      if (!bindingPending(email)) await releaseEmailIdentity().catch(() => {});
      setModalStatus("[data-energy-email-status]", errorText(error, "验证码发送失败"), true);
    } finally {
      if (state.emailFlowEpoch === epoch) button.disabled = false;
    }
  }

  async function submitEmailBinding(button) {
    const panel = ensurePanel();
    const email = bindingEmail();
    const code = String(panel?.querySelector("[data-energy-email-code]")?.value || "").trim();
    if (!email) return setModalStatus("[data-energy-email-status]", "请输入有效的邮箱地址", true);
    if (!bindingPending(email)) {
      await releaseEmailIdentity().catch(() => {});
      return setModalStatus("[data-energy-email-status]", "请重新获取当前邮箱的验证码", true);
    }
    if (!code) return setModalStatus("[data-energy-email-status]", "请输入验证码", true);
    if (typeof window.SHEXEmailAuth?.verifyAndSignIn !== "function" || typeof window.SHEXAuth?.bindVerifiedEmail !== "function")
      return setModalStatus("[data-energy-email-status]", "邮箱验证组件尚未就绪，请刷新后重试", true);
    if (!state.emailIdentityTransition) state.emailIdentityTransition = window.SHEXCloudBaseClient?.beginVerifiedIdentityTransition?.("email") || null;
    button.disabled = true;
    const transition = state.emailIdentityTransition;
    const epoch = state.emailFlowEpoch;
    try {
      if (!transition) throw new Error("邮箱身份切换组件未就绪");
      const identity = state.verifiedEmail === email
        ? { email }
        : await window.SHEXEmailAuth.verifyAndSignIn(email, code, "register");
      if (state.emailFlowEpoch !== epoch || state.emailIdentityTransition !== transition || bindingEmail() !== email) {
        await window.SHEXAuth?.resetCloudBaseIdentityToAnonymous?.();
        return;
      }
      state.verifiedEmail = email;
      window.SHEXCloudBaseClient?.touchVerifiedIdentityTransition?.(transition);
      // X奖励系统：首次绑定邮箱是邀请码的第二个正式入口，与邮箱注册汇入同一条服务端邀请主链。
      // 邀请码为选填；是否真的建立邀请关系、发多少能量全部由服务端判定，前端只透传。
      const inviteCode = String(panel?.querySelector("[data-energy-email-invite]")?.value || "")
        .trim().toUpperCase();
      const result = await window.SHEXAuth.bindVerifiedEmail(
        identity?.email || email,
        inviteCode ? { inviteCode } : {}
      );
      if (state.emailFlowEpoch !== epoch || state.emailIdentityTransition !== transition) return;
      if (result?.ok === false || result?.success === false) throw new Error(result?.detail || result?.message || "绑定失败");
      await closeEmailModal();
      const inviteeAmount = Number(result?.inviteReward?.inviteeAmount || 0);
      setAccountStatus(
        result?.inviteReward?.applied === true && inviteeAmount > 0
          ? `邮箱绑定成功，受邀奖励 +${inviteeAmount} X能量已到账`
          : "邮箱绑定成功",
        false
      );
      await loadHomeSummary();
    } catch (error) {
      if (state.emailFlowEpoch !== epoch) return;
      if (!bindingPending(email) || bindingEmail() !== email) await releaseEmailIdentity().catch(() => {});
      setModalStatus("[data-energy-email-status]", errorText(error, "邮箱绑定失败"), true);
    } finally {
      button.disabled = false;
    }
  }

  function openDeletionModal() {
    const modal = ensurePanel()?.querySelector("[data-energy-delete-modal]");
    if (!modal) return;
    modal.hidden = false;
    modal.querySelector('[data-energy-delete-step="1"]').hidden = false;
    modal.querySelector('[data-energy-delete-step="2"]').hidden = true;
    setModalStatus("[data-energy-delete-status]", "");
  }

  function closeDeletionModal() {
    const modal = document.getElementById(PAGE_ID)?.querySelector("[data-energy-delete-modal]");
    if (modal) modal.hidden = true;
  }

  async function submitDeletionRequest(button) {
    if (typeof window.SHEXAuth?.submitAccountDeletionRequest !== "function") {
      return setModalStatus("[data-energy-delete-status]", "注销申请服务尚未就绪，请刷新后重试", true);
    }
    button.disabled = true;
    try {
      const result = await window.SHEXAuth.submitAccountDeletionRequest();
      if (result?.ok === false || result?.success === false) throw new Error(result?.detail || result?.message || "提交失败");
      closeDeletionModal();
      setAccountStatus("注销申请已提交，你仍可正常使用账号。", false);
      await loadHomeSummary();
    } catch (error) {
      setModalStatus("[data-energy-delete-status]", errorText(error, "注销申请提交失败"), true);
    } finally {
      button.disabled = false;
    }
  }

  let rewardPanelMountedSlot = null;
  let rewardSubmitPanelMountedSlot = null;
  let rewardSubmitPanelMountedCreatorSlot = null;
  let rewardSubmitPanelMountedHistorySlot = null;

  function syncRewardPanel(summary) {
    const rewardPanel = window.SHEXRewardPanel;
    if (!rewardPanel) return;
    const slot = ensurePanel()?.querySelector("[data-energy-reward-panel-slot]");
    if (!slot) return;
    const account = summary?.account || null;
    try {
      if (rewardPanelMountedSlot !== slot) {
        rewardPanel.mount({
          container: slot,
          api: {
            getMyInviteInfo: () => window.SHEXAuth.getMyInviteInfo(),
            submitInviteCode: (payload) => window.SHEXAuth.submitInviteCode(payload && payload.inviteCode ? payload.inviteCode : payload)
          }
        });
        rewardPanelMountedSlot = slot;
      }
      rewardPanel.render({ account, invite: null });
      // 可见性（含请求与否）只由面板自己的 isVisible(account) 决定，它读取后端 rewardSystemEnabled。
      if (rewardPanel.isVisible(account) === true) void rewardPanel.refresh();
    } catch (error) {
      console.warn("[SHEX] X奖励面板接线失败", error);
    }
    syncRewardSubmitPanel(summary);
  }

  // 奖励申请面板（评论 / 发布作品 / 点赞里程碑）。与邀请面板同为账户中心奖励区的姊妹模块，
  // 可见性与后端一致：account.rewardSystemEnabled !== true 时整块不渲染、也不发任何请求。
  function syncRewardSubmitPanel(summary) {
    const submitPanel = window.SHEXRewardSubmitPanel;
    if (!submitPanel) return;
    const slot = ensurePanel()?.querySelector("[data-energy-reward-submit-slot]");
    const creatorSlot = ensurePanel()?.querySelector("[data-energy-creator-reward-slot]");
    const historySlot = ensurePanel()?.querySelector("[data-energy-reward-history-slot]");
    if (!slot || !creatorSlot || !historySlot) return;
    const account = summary?.account || null;
    try {
      if (rewardSubmitPanelMountedSlot !== slot || rewardSubmitPanelMountedCreatorSlot !== creatorSlot || rewardSubmitPanelMountedHistorySlot !== historySlot) {
        submitPanel.mount({
          container: slot,
          creatorContainer: creatorSlot,
          historyContainer: historySlot,
          showCreatorEntry: false,
          api: {
            submitRewardApplication: (payload) => window.SHEXAuth.submitRewardApplication(payload),
            getMyRewardApplications: (options) => window.SHEXAuth.getMyRewardApplications(options),
            getLimitedCreatorRewardWorks: (options) => window.SHEXAuth.getLimitedCreatorRewardWorks(options),
            uploadProof: (file) => window.SHEXCloudStorage.uploadFile(file, "reward-proof", { allowLocalFallback: false })
          }
        });
        rewardSubmitPanelMountedSlot = slot;
        rewardSubmitPanelMountedCreatorSlot = creatorSlot;
        rewardSubmitPanelMountedHistorySlot = historySlot;
      }
      submitPanel.render({ account });
      if (submitPanel.isVisible(account) === true) void submitPanel.refresh();
    } catch (error) {
      console.warn("[SHEX] X奖励申请面板接线失败", error);
    }
  }

  function renderHomeSummary() {
    const panel = ensurePanel();
    const summary = state.homeSummary || {};
    const account = summary.account || {};
    const accountCard = panel?.querySelector("[data-energy-account-card]");
    if (!accountCard) return;
    accountCard.querySelector("[data-energy-account-name]").textContent = account.displayName || account.username || "未命名账号";
    accountCard.querySelector("[data-energy-account-id]").textContent = `账号ID：${account.userId || "—"}`;
    accountCard.querySelector("[data-energy-account-email]").textContent = account.emailBound && account.emailMasked ? `邮箱：${account.emailMasked}` : "邮箱：未绑定";
    const bindEmail = accountCard.querySelector("[data-energy-bind-email]");
    if (bindEmail) bindEmail.hidden = Boolean(account.emailBound);
    const download = accountCard.querySelector("[data-energy-download-app]");
    if (download) download.hidden = isNativeAppShell();
    const admin = accountCard.querySelector("[data-energy-open-admin]");
    if (admin) admin.hidden = !account.isAdmin;
    const deletion = summary.deletionRequest;
    const deletionBox = accountCard.querySelector("[data-energy-deletion]");
    const deletionIsActive = ["pending", "processing"].includes(deletion?.status);
    const deleteAccount = accountCard.querySelector("[data-energy-delete-account]");
    if (deleteAccount) deleteAccount.hidden = deletionIsActive;
    if (deletionIsActive) {
      const labels = { pending: "注销申请待处理", processing: "注销申请正在处理" };
      deletionBox.hidden = false;
      deletionBox.innerHTML = `<strong data-energy-deletion-status>${escapeHtml(labels[deletion.status] || "注销申请处理中")}</strong>${deletion.note ? `<p data-energy-deletion-note>${escapeHtml(deletion.note)}</p>` : ""}<button type="button" data-energy-cancel-deletion>取消注销</button>`;
    } else {
      deletionBox.hidden = true;
      deletionBox.innerHTML = "";
    }
    state.plan = summary.plan || null;
    state.campaign = summary.campaign || null;
    renderOverview();
    renderLogs(); // 套餐后到或切换时同步刷新消费记录的额度展示。
    renderCampaign();
    syncRewardPanel(summary);
    // 面板先同步可见性，再汇总，避免首次打开时父区域一直保持隐藏。
    // 创作者两项仅隐藏首页入口，旧申请记录和既有业务保持可读取。
    const rewardsSection = panel?.querySelector("[data-energy-rewards]");
    if (rewardsSection) {
      const creatorCard = rewardsSection.querySelector('[data-energy-reward-card="creator"]');
      if (creatorCard) creatorCard.hidden = true;
      const rewardSlots = [
        rewardsSection.querySelector("[data-energy-reward-submit-slot]"),
        rewardsSection.querySelector("[data-energy-reward-panel-slot]"),
        rewardsSection.querySelector("[data-energy-reward-history-slot]")
      ];
      rewardsSection.hidden = !rewardSlots.some((node) => node && node.hidden !== true);
    }
    if (!state.tierManuallySelected) {
      state.selectedTier = null;
      renderPlansTierRow();
      renderPlansTierCard();
    }
  }

  async function loadHomeSummary() {
    const requestId = ++state.homeSummaryRequestId;
    try {
      if (typeof window.SHEXAuth?.getEnergyHomeSummary !== "function") throw new Error("账户信息服务尚未就绪，请刷新后重试");
      const result = await window.SHEXAuth.getEnergyHomeSummary();
      if (requestId !== state.homeSummaryRequestId) return;
      if (result?.ok === false || result?.success === false) throw new Error(result?.detail || result?.message || "账户信息读取失败");
      state.homeSummary = result;
      setAccountStatus("", false);
    } catch (error) {
      if (requestId !== state.homeSummaryRequestId) return;
      setAccountStatus(errorText(error, "账户信息读取失败"), true);
    }
    if (requestId !== state.homeSummaryRequestId) return;
    renderHomeSummary();
  }
  const TIER_SHORT_LABEL = {
    free_cloud: "Free",
    plus: "Plus",
    pro: "Pro",
    ultra: "Ultra"
  };
  const DURATION_LABEL = (days) => (
    days === 30 ? "1个月" : days === 90 ? "3个月" : days === 180 ? "半年" : `${days}天`
  );
  const TIER_MEMBER_LABEL = Object.freeze({
    plus: "Plus 会员",
    pro: "Pro 会员",
    ultra: "Ultra 会员"
  });
  // 会员权益 = 长期记忆 + 全部 AI 模型 + 功能优惠价 + 更高额度 + 无3小时限制；其余功能对 Free 同样开放。
  // 这里的价格必须和 shexAuth 的 FEATURE_PRICE_TABLE 保持一致。
  const BENEFIT_ROWS = Object.freeze([
    { key: "long-term-memory", label: "AI 长期记忆（会员专属）", values: { free_cloud: { kind: "no" }, plus: { kind: "yes" }, pro: { kind: "yes" }, ultra: { kind: "yes" } } },
    { key: "ai-models", label: "AI 模型（会员专属）", values: { free_cloud: { kind: "text", text: "2 个基础模型" }, plus: { kind: "text", text: "全部 17 个模型" }, pro: { kind: "text", text: "全部 17 个模型" }, ultra: { kind: "text", text: "全部 17 个模型" } } },
    { key: "short-window", label: "3小时额度限制", values: { free_cloud: { kind: "text", text: "每3小时 30 点" }, plus: { kind: "text", text: "无3小时限制" }, pro: { kind: "text", text: "无3小时限制" }, ultra: { kind: "text", text: "无3小时限制" } } },
    { key: "voice-clone", label: "克隆专属声音", values: { free_cloud: { kind: "text", text: "499 点" }, plus: { kind: "text", text: "会员优惠价 399 点" }, pro: { kind: "text", text: "会员优惠价 399 点" }, ultra: { kind: "text", text: "会员优惠价 399 点" } } },
    { key: "dating", label: "X约会", values: { free_cloud: { kind: "text", text: "每次 20 点" }, plus: { kind: "text", text: "会员优惠价 15 点" }, pro: { kind: "text", text: "会员优惠价 15 点" }, ultra: { kind: "text", text: "会员优惠价 15 点" } } },
    { key: "divination", label: "梦占解读", values: { free_cloud: { kind: "text", text: "每次 50 点" }, plus: { kind: "text", text: "会员优惠价 39 点" }, pro: { kind: "text", text: "会员优惠价 39 点" }, ultra: { kind: "text", text: "会员优惠价 39 点" } } },
    { key: "ta-status", label: "TA的状态", values: { free_cloud: { kind: "text", text: "每次 2 点" }, plus: { kind: "text", text: "会员免费" }, pro: { kind: "text", text: "会员免费" }, ultra: { kind: "text", text: "会员免费" } } },
    { key: "link-status", label: "双方链接", values: { free_cloud: { kind: "text", text: "每次 2 点" }, plus: { kind: "text", text: "会员免费" }, pro: { kind: "text", text: "会员免费" }, ultra: { kind: "text", text: "会员免费" } } },
    { key: "letter-card", label: "X信回信（字卡）", values: { free_cloud: { kind: "text", text: "每次 5 点" }, plus: { kind: "text", text: "会员免费" }, pro: { kind: "text", text: "会员免费" }, ultra: { kind: "text", text: "会员免费" } } },
    { key: "voice-reply", label: "语音回复", values: { free_cloud: { kind: "text", text: "已开放，按字数扣费" }, plus: { kind: "text", text: "已开放，按字数扣费" }, pro: { kind: "text", text: "已开放，按字数扣费" }, ultra: { kind: "text", text: "已开放，按字数扣费" } } },
    {
      key: "concurrent-devices", label: "同时登录设备",
      values: {
        free_cloud: { kind: "text", text: "一台" },
        plus: { kind: "text", text: "2 台" },
        pro: { kind: "text", text: "3 台" },
        ultra: { kind: "text", text: "3 台" }
      }
    },
    {
      key: "monthly-limit", label: "月度额度上限",
      valueSource: "catalog-monthly-limit"
    }
  ]);

  function benefitValueMarkup(value) {
    if (value?.kind === "yes") {
      return '<span class="x-energy-benefit-state is-yes"><span aria-hidden="true">✓</span><span>已解锁</span></span>';
    }
    if (value?.kind === "no") {
      return '<span class="x-energy-benefit-state is-no"><span aria-hidden="true">✕</span><span>未开放</span></span>';
    }
    return `<span class="x-energy-benefit-text">${escapeHtml(value?.text || "")}</span>`;
  }

  function benefitValueForTier(row, tier, plans) {
    if (row.valueSource === "catalog-monthly-limit") {
      const plan = plans.find((item) => item.code === tier);
      return { kind: "text", text: String(Number(plan?.cycle3dLimit || 0) * 10) };
    }
    return row.values?.[tier] || { kind: "text", text: "—" };
  }

  function benefitComparisonMarkup(selectedTier) {
    const rightTier = selectedTier === "free_cloud" ? "ultra" : selectedTier;
    const title = selectedTier === "free_cloud" ? "Free 与 Ultra 对比" : "与 Free 版对比";
    const rightLabel = TIER_MEMBER_LABEL[rightTier] || `${TIER_SHORT_LABEL[rightTier] || rightTier} 会员`;
    const plans = currentTierPlans();
    const rows = BENEFIT_ROWS.map((row) => {
      const freeValue = benefitValueForTier(row, "free_cloud", plans);
      const rightValue = benefitValueForTier(row, rightTier, plans);
      return `<div class="x-energy-benefit-row" data-energy-benefit-row data-energy-benefit-key="${escapeHtml(row.key)}" role="row">
          <div class="x-energy-benefit-label" data-energy-benefit-label role="rowheader">${escapeHtml(row.label)}</div>
          <div class="x-energy-benefit-value is-free" data-energy-benefit-value role="cell">${benefitValueMarkup(freeValue)}</div>
          <div class="x-energy-benefit-value is-current" data-energy-benefit-value role="cell">${benefitValueMarkup(rightValue)}</div>
        </div>`;
    }).join("");
    return `
      <section class="x-energy-benefits" aria-label="${escapeHtml(title)}">
        <div class="x-energy-benefit-table" role="table" aria-label="${escapeHtml(title)}">
          <div class="x-energy-benefit-head" role="row">
            <div role="columnheader">权益</div>
            <div data-energy-compare-column role="columnheader">Free 普通用户</div>
            <div data-energy-compare-column role="columnheader">${escapeHtml(rightLabel)}</div>
          </div>
          ${rows}
        </div>
      </section>`;
  }

  function currentTierPlans() {
    return Array.isArray(state.catalog.plans) ? state.catalog.plans : [];
  }

  function ensureSelectedTier() {
    const plans = currentTierPlans();
    if (!plans.length) return null;
    if (!state.selectedTier || !plans.some((plan) => plan.code === state.selectedTier)) {
      const activeCode = state.plan?.currentPlan?.code || state.plan?.currentPlan?.plan || "free_cloud";
      state.selectedTier = plans.some((plan) => plan.code === activeCode) ? activeCode : plans[0].code;
    }
    return plans.find((plan) => plan.code === state.selectedTier) || plans[0];
  }

  function ensureSelectedDuration(plan) {
    const durations = Array.isArray(plan?.durations) ? plan.durations : [];
    if (!durations.length) return null;
    if (!durations.some((duration) => Number(duration.days) === Number(state.selectedDurationDays))) {
      state.selectedDurationDays = Number(durations[0].days);
    }
    return durations.find((duration) => Number(duration.days) === Number(state.selectedDurationDays)) || durations[0];
  }

  function renderPlansTierRow() {
    const panel = ensurePanel();
    const row = panel?.querySelector("[data-energy-tier-row]");
    if (!row) return;
    const plans = currentTierPlans();
    if (!plans.length) {
      row.innerHTML = '<p class="x-energy-empty">套餐信息暂时没有加载出来，请刷新重试。</p>';
      return;
    }
    ensureSelectedTier();
    row.innerHTML = plans.map((plan) => {
      const isSelected = plan.code === state.selectedTier;
      const label = TIER_SHORT_LABEL[plan.code] || plan.code;
      return `<button type="button" class="${isSelected ? "is-selected" : ""}" data-energy-tier-select="${escapeHtml(plan.code)}">${escapeHtml(label)}</button>`;
    }).join("");
  }

  function renderPlansTierCard() {
    const panel = ensurePanel();
    const card = panel?.querySelector("[data-energy-tier-card]");
    if (!card) return;
    const plan = ensureSelectedTier();
    if (!plan) {
      card.hidden = true;
      return;
    }
    card.hidden = false;
    const isFree = plan.code === "free_cloud";
    const monthlyEst = Number(plan.cycle3dLimit || 0) * 10;
    let durationBlock = "";
    if (isFree) {
      durationBlock = `
        <div class="x-energy-tier-purchase x-energy-tier-free-note">
          <p>你当前是免费用户，以下是升级后可获得的权益</p>
          <button type="button" data-energy-upgrade-ultra>升级 Ultra</button>
        </div>`;
    } else {
      const duration = ensureSelectedDuration(plan);
      const durationButtons = (plan.durations || []).map((item) => {
        const isSelected = Number(item.days) === Number(state.selectedDurationDays);
        return `<button type="button" class="${isSelected ? "is-selected" : ""}" data-energy-duration-select="${Number(item.days)}">${escapeHtml(DURATION_LABEL(Number(item.days)))}</button>`;
      }).join("");
      durationBlock = `
        <div class="x-energy-tier-purchase">
          <div class="x-energy-tier-duration-label">选择购买时长</div>
          <div class="x-energy-tier-duration-row">${durationButtons}</div>
          <div class="x-energy-tier-buy-row">
            <strong class="x-energy-tier-price">${escapeHtml(duration?.price || "")}</strong>
            <button type="button" class="x-energy-tier-buy" data-energy-plan-buy="${escapeHtml(plan.code)}" data-energy-plan-days="${Number(duration?.days || 0)}">立即购买</button>
          </div>
        </div>
      `;
    }
    card.innerHTML = `
      <strong class="x-energy-tier-name">${escapeHtml(plan.name || plan.code)}</strong>
      ${durationBlock}
      <p class="x-energy-tier-quota-note">AI 对话额度（滚动窗口计算）</p>
      <div class="x-energy-tier-stats">
        <article><small>3小时额度</small><strong>${isMemberPlanCode(plan.code || plan.plan) ? "不限" : `${Number(plan.cycle3hLimit || 0)}点`}</strong></article>
        <article><small>3天额度</small><strong>${Number(plan.cycle3dLimit || 0)}点</strong></article>
        <article><small>月度上限</small><strong>${monthlyEst}点</strong></article>
      </div>
      ${benefitComparisonMarkup(plan.code)}
    `;
  }

  function renderCatalog() {
    const panel = ensurePanel();
    const packList = panel?.querySelector("[data-energy-pack-list]");
    renderPlansTierRow();
    renderPlansTierCard();
    if (packList) {
      const packs = Array.isArray(state.catalog.packs) ? state.catalog.packs : [];
      packList.innerHTML = packs.length ? packs.map((pack) => `
        <button class="x-energy-pack-row" type="button" data-energy-pack-buy="${escapeHtml(pack.packType || pack.name)}">
          <span class="x-energy-pack-row-copy">
            <strong>${escapeHtml(pack.name)} · ${escapeHtml(pack.price)}</strong>
            <small>${Number(pack.amount || 0)} 点X能量</small>
          </span>
          <span class="x-energy-pack-row-buy">购买</span>
        </button>
      `).join("") : '<p class="x-energy-empty">能量包信息暂时没有加载出来，请刷新重试。</p>';
    }
  }

  async function copyText(value, button) {
    const text = String(value || "");
    if (!text) return;
    const copied = await window.SHEXAuth?.copyText?.(text);
    if (copied) {
      const original = button?.textContent;
      if (button) button.textContent = "已复制";
      window.setTimeout(() => {
        if (button) button.textContent = original;
      }, 1600);
      return;
    }
    window.SHEXAuth?.notify?.("复制失败，请手动选中复制", "error");
  }

  function orderItemLabel(order) {
    return order.orderType === "plan"
      ? `${planLabel(order.plan)} · ${Number(order.durationDays || 0)}天`
      : `${packLabel(order.packType)} · ${Number(order.energyAmount || 0)}点`;
  }

  function renderOrders() {
    const panel = ensurePanel();
    const list = panel?.querySelector("[data-energy-order-list]");
    if (!list) return;
    list.innerHTML = state.orders.length ? state.orders.map((order) => {
      const hasRedeemCode = order.redeemCode && order.status === "completed";
      const codeBlock = hasRedeemCode ? `
        <div class="x-energy-order-code">
          <code>${escapeHtml(order.redeemCode)}</code>
          <button type="button" data-energy-copy-code="${escapeHtml(order.redeemCode)}">复制兑换码</button>
        </div>
      ` : (order.autoCredited ? `<div class="x-energy-order-code"><code>已自动到账</code></div>` : "");
      return `
        <article class="x-energy-order-row">
          <div class="x-energy-order-row-top">
            <div>
              <strong>${escapeHtml(orderItemLabel(order))}</strong>
              <small>${escapeHtml(formatTime(order.createdAt))}</small>
            </div>
            <div>
              <strong>¥${(Number(order.amountFen || 0) / 100).toFixed(2)}</strong>
              <span data-status="${escapeHtml(order.status)}">${escapeHtml(statusLabel(order.status))}</span>
            </div>
          </div>
          ${codeBlock}
        </article>
      `;
    }).join("") : '<p class="x-energy-empty">这里还没有购买记录。</p>';
  }

  async function loadLogs(reset = true) {
    if (state.loading && !reset) return;
    const requestId = ++state.logsRequestId;
    state.loading = true;
    renderLogs();
    try {
      const result = await window.SHEXAuth?.getMyEnergyLogs?.({
        limit: PAGE_SIZE,
        beforeCreatedAt: reset ? 0 : state.nextCursor
      });
      if (requestId !== state.logsRequestId) return;
      const items = Array.isArray(result?.items) ? result.items : [];
      state.logs = reset ? items : [...state.logs, ...items];
      state.nextCursor = Number(result?.nextCursor || 0);
      state.hasMore = Boolean(result?.hasMore);
    } catch (error) {
      if (requestId !== state.logsRequestId) return;
      const list = ensurePanel()?.querySelector("[data-energy-log-list]");
      if (list) list.innerHTML = `<p class="x-energy-empty is-error">${escapeHtml(error?.message || "记录加载失败，请稍后重试")}</p>`;
    } finally {
      if (requestId !== state.logsRequestId) return;
      state.loading = false;
      renderLogs();
    }
  }

  async function loadCampaign() {
    const requestId = ++state.campaignRequestId;
    try {
      const result = await window.SHEXAuth?.getMyEnergyCampaign?.();
      if (requestId !== state.campaignRequestId) return;
      state.campaign = result?.campaign || null;
    } catch (_) {
      if (requestId !== state.campaignRequestId) return;
      state.campaign = null;
    }
    if (requestId !== state.campaignRequestId) return;
    renderCampaign();
  }

  async function loadPlanOverview() {
    const requestId = ++state.planRequestId;
    try {
      const plan = await window.SHEXAuth?.getMyPlan?.();
      if (requestId !== state.planRequestId) return;
      state.plan = plan;
    } catch (_) {
      if (requestId !== state.planRequestId) return;
      state.plan = null;
    }
    if (requestId !== state.planRequestId) return;
    renderOverview();
    renderLogs(); // 套餐后到或切换时同步刷新消费记录的额度展示。
    if (!state.tierManuallySelected) {
      state.selectedTier = null;
      renderPlansTierRow();
      renderPlansTierCard();
    }
  }

  async function loadOrders() {
    const requestId = ++state.ordersRequestId;
    const list = ensurePanel()?.querySelector("[data-energy-order-list]");
    if (list) list.innerHTML = '<p class="x-energy-empty">正在读取购买记录…</p>';
    try {
      const result = await window.SHEXAuth?.getMyPaymentHistory?.();
      if (requestId !== state.ordersRequestId) return;
      state.orders = Array.isArray(result?.orders) ? result.orders : [];
      renderOrders();
    } catch (error) {
      if (requestId !== state.ordersRequestId) return;
      const message = escapeHtml(error?.message || "购买记录加载失败，请稍后重试");
      if (list) list.innerHTML = `<p class="x-energy-empty is-error">${message}</p>`;
    }
  }

  async function loadCatalog() {
    try {
      const catalog = await Promise.resolve(window.SHEXAuth?.getEnergyCatalog?.());
      state.catalog = catalog || { plans: [], packs: [] };
    } catch (_) {
      state.catalog = { plans: [], packs: [] };
    }
    renderCatalog();
  }

  async function claimCampaign(button) {
    if (!state.campaign?.eventId || button.disabled) return;
    button.disabled = true;
    button.textContent = "正在领取…";
    const status = ensurePanel()?.querySelector("[data-energy-campaign-status]");
    try {
      const result = await window.SHEXAuth?.claimEnergyCampaign?.(state.campaign.eventId);
      if (status) status.textContent = result?.message || "领取成功，X能量已经到账。";
      await loadHomeSummary();
    } catch (error) {
      if (status) status.textContent = error?.message || "领取失败，请稍后重试";
      button.disabled = false;
      button.textContent = "重新领取";
    }
  }
  async function focusRequestedSection(section = "") {
    const requested = String(section || sessionStorage.getItem(FOCUS_KEY) || "").trim();
    sessionStorage.removeItem(FOCUS_KEY);
    if (!requested) return showView("hub");
    return showView(requested);
  }

  async function refresh(options = {}) {
    const panel = ensurePanel();
    if (!panel) return;
    panel.classList.add("is-loading");
    await Promise.allSettled([loadCatalog(), loadHomeSummary()]);
    panel.classList.remove("is-loading");
    await focusRequestedSection(options.section);
  }
  function bindPanel(panel) {
    if (panel.dataset.energyBound) return;
    panel.dataset.energyBound = "true";
    panel.addEventListener("input", (event) => {
      if (!event.target.matches("[data-energy-email-input]")) return;
      const pendingEmail = window.SHEXEmailAuth?.getPendingVerification?.()?.email || "";
      const activeEmail = state.emailFlowEmail || pendingEmail || state.verifiedEmail;
      if (activeEmail && bindingEmail() !== activeEmail) {
        void releaseEmailIdentity().catch(() => {});
        setModalStatus("[data-energy-email-status]", "邮箱已更换，请重新获取当前邮箱的验证码", true);
      }
    });
    panel.addEventListener("click", (event) => {
      if (event.target.closest("[data-energy-guide-open]")) { void showView("energy-guide"); return; }
      if (event.target.closest("[data-beautify-guide-open]")) { void showView("beautify-guide"); return; }
      if (event.target.closest("[data-energy-feedback-open]")) { void showView("feedback"); return; }
      const removeFeedbackImage = event.target.closest("[data-energy-feedback-remove]");
      if (removeFeedbackImage) {
        feedbackFiles.splice(Number(removeFeedbackImage.dataset.energyFeedbackRemove), 1);
        renderFeedbackFiles();
        return;
      }
      const guideTab = event.target.closest("[data-energy-guide-tab]");
      if (guideTab) { selectEnergyGuideTab(panel, guideTab.dataset.energyGuideTab); return; }
      const beautifyTab = event.target.closest("[data-beautify-guide-tab]");
      if (beautifyTab) { selectBeautifyGuideTab(panel, beautifyTab.dataset.beautifyGuideTab); return; }
      const guideSummary = event.target.closest(".x-energy-guide-list summary");
      if (guideSummary) {
        event.preventDefault();
        const item = guideSummary.parentElement;
        const shouldOpen = !item.open;
        if (guideSummary.closest('[data-energy-section="beautify-guide"]')) closeBeautifyGuideDetails(panel);
        else closeEnergyGuideDetails(panel);
        item.open = shouldOpen;
        return;
      }
      const faqSummary = event.target.closest(".x-energy-faq-list summary");
      if (faqSummary) {
        event.preventDefault();
        const item = faqSummary.parentElement;
        const shouldOpen = !item.open;
        panel.querySelectorAll(".x-energy-faq-list details[open]").forEach((openItem) => { openItem.open = false; });
        item.open = shouldOpen;
        return;
      }
      const action = event.target.closest("[data-energy-app-action]");
      if (action) {
        void showView(action.dataset.energyAppAction);
        return;
      }
      // 「创作收益」必须进入**唯一那一个**创作者中心：角色广场里的创作者分区。
      // 这里只派发事件，由主站路由复用角色广场自己的入口链路（与用户手点广场「创作者」标签完全一致），
      // 不再用 #x-creator-workbench 直跳独立面板——那是历史上的第二套外壳（浅色、且多一块 CREATOR 大标题）。
      if (event.target.closest("[data-energy-open-creator]")) {
        window.dispatchEvent(new CustomEvent("shex:open-creator-center"));
        return;
      }
      if (event.target.closest("[data-energy-open-plan]")) { window.SHEXAuth?.openPlan?.(); return; }
      if (event.target.closest("[data-energy-open-admin]")) { window.location.href = "./admin.html"; return; }
      if (event.target.closest("[data-energy-logout]")) { void window.SHEXAuth?.logout?.(); return; }
      if (event.target.closest("[data-energy-bind-email]")) {
        void openEmailModal();
        return;
      }
      if (event.target.closest("[data-energy-delete-account]")) {
        openDeletionModal();
        return;
      }
      if (event.target.closest("[data-energy-cancel-deletion]")) {
        const expectedRevision = state.homeSummary?.deletionRequest?.revision;
        if (typeof window.SHEXAuth?.cancelAccountDeletionRequest !== "function") return setAccountStatus("注销申请服务尚未就绪，请刷新后重试", true);
        void Promise.resolve(window.SHEXAuth.cancelAccountDeletionRequest({ expectedRevision }))
          .then((result) => {
            if (result?.ok === false || result?.success === false) throw new Error(result?.detail || result?.message || "撤回失败");
            setAccountStatus("注销申请已撤回", false);
            return loadHomeSummary();
          })
          .catch((error) => setAccountStatus(errorText(error, "撤回注销申请失败"), true));
        return;
      }
      if (event.target.closest("[data-energy-email-cancel]")) { void closeEmailModal(); return; }
      const sendEmail = event.target.closest("[data-energy-email-send]");
      if (sendEmail) { void sendBindingEmailCode(sendEmail); return; }
      const submitEmail = event.target.closest("[data-energy-email-submit]");
      if (submitEmail) { void submitEmailBinding(submitEmail); return; }
      if (event.target.closest("[data-energy-delete-cancel]")) { closeDeletionModal(); return; }
      if (event.target.closest("[data-energy-delete-next]")) {
        panel.querySelector('[data-energy-delete-step="1"]').hidden = true;
        panel.querySelector('[data-energy-delete-step="2"]').hidden = false;
        return;
      }
      const confirmDeletion = event.target.closest("[data-energy-delete-confirm]");
      if (confirmDeletion) { void submitDeletionRequest(confirmDeletion); return; }
    });
    panel.querySelector("[data-energy-refresh]")?.addEventListener("click", () => refresh());
    panel.querySelector("[data-energy-orders-refresh]")?.addEventListener("click", () => loadOrders());
    panel.querySelector("[data-energy-load-more]")?.addEventListener("click", () => loadLogs(false));
    panel.querySelector("[data-energy-detail-back]")?.addEventListener("click", () => applyView(["energy-guide", "beautify-guide", "feedback"].includes(state.view) ? "faq" : "hub"));
    panel.querySelector("[data-energy-feedback-form]")?.addEventListener("submit", (event) => { void submitEnergyFeedback(event); });
    panel.querySelector("[data-energy-feedback-images]")?.addEventListener("change", (event) => {
      const selected = Array.from(event.currentTarget.files || []);
      feedbackFiles = feedbackFiles.concat(selected).slice(0, 3);
      event.currentTarget.value = "";
      renderFeedbackFiles();
    });
    panel.querySelector("[data-energy-feedback-more]")?.addEventListener("click", () => { void loadFeedbackHistory(false); });
    panel.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      const tablist = event.target.closest(".x-energy-guide-tabs");
      if (!tablist) return;
      const isBeautify = Boolean(tablist.closest('[data-energy-section="beautify-guide"]'));
      const tabs = [...tablist.querySelectorAll(isBeautify ? "[data-beautify-guide-tab]" : "[data-energy-guide-tab]")];
      const index = tabs.indexOf(document.activeElement);
      if (index < 0) return;
      event.preventDefault();
      const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1
        : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
      tabs[next].focus();
      if (isBeautify) selectBeautifyGuideTab(panel, tabs[next].dataset.beautifyGuideTab);
      else selectEnergyGuideTab(panel, tabs[next].dataset.energyGuideTab);
    });
    panel.querySelector("[data-energy-campaign-claim]")?.addEventListener("click", (event) => {
      void claimCampaign(event.currentTarget);
    });
    panel.querySelector("[data-energy-gift-exchange]")?.addEventListener("click", () => {
      applyView("contact");
    });
    panel.querySelector("[data-energy-copy-admin]")?.addEventListener("click", (event) => {
      void copyText("2140980147", event.currentTarget);
    });
    panel.querySelector("[data-beautify-guide-copy]")?.addEventListener("click", async (event) => {
      const text = await loadBeautifyGuide(panel);
      if (text) await copyText(text, event.currentTarget);
    });
    panel.querySelector("[data-energy-hub-grid]")?.addEventListener("click", (event) => {
      const tile = event.target.closest("[data-energy-hub-tile]");
      if (!tile) return;
      applyView(tile.dataset.energyHubTile);
    });
    panel.addEventListener("click", (event) => {
      const tierSelect = event.target.closest("[data-energy-tier-select]");
      if (tierSelect) {
        state.selectedTier = tierSelect.dataset.energyTierSelect;
        state.tierManuallySelected = true;
        renderPlansTierRow();
        renderPlansTierCard();
        return;
      }
      const upgradeUltra = event.target.closest("[data-energy-upgrade-ultra]");
      if (upgradeUltra && currentTierPlans().some((plan) => plan.code === "ultra")) {
        state.selectedTier = "ultra";
        state.tierManuallySelected = true;
        renderPlansTierRow();
        renderPlansTierCard();
        return;
      }
      const durationSelect = event.target.closest("[data-energy-duration-select]");
      if (durationSelect) {
        state.selectedDurationDays = Number(durationSelect.dataset.energyDurationSelect);
        renderPlansTierCard();
        return;
      }
      const planBuy = event.target.closest("[data-energy-plan-buy]");
      if (planBuy) {
        void window.SHEXAuth?.startEnergyPurchase?.({
          orderType: "plan",
          plan: planBuy.dataset.energyPlanBuy,
          durationDays: Number(planBuy.dataset.energyPlanDays)
        });
        return;
      }
      const packBuy = event.target.closest("[data-energy-pack-buy]");
      if (packBuy) {
        void window.SHEXAuth?.startEnergyPurchase?.({
          orderType: "energy_pack",
          packType: packBuy.dataset.energyPackBuy
        });
        return;
      }
      const copyCodeButton = event.target.closest("[data-energy-copy-code]");
      if (copyCodeButton) {
        void copyText(copyCodeButton.dataset.energyCopyCode, copyCodeButton);
      }
    });
    panel.querySelectorAll("[data-energy-category]").forEach((button) => {
      button.addEventListener("click", () => {
        state.category = button.dataset.energyCategory || "all";
        panel.querySelectorAll("[data-energy-category]").forEach((item) => {
          item.classList.toggle("active", item === button);
        });
        renderLogs();
      });
    });
    panel.querySelector("[data-energy-redeem-form]")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const input = form.querySelector("input");
      const button = form.querySelector("button[type='submit']");
      const status = form.querySelector("[data-energy-redeem-status]");
      button.disabled = true;
      status.textContent = "正在兑换…";
      try {
        const result = await window.SHEXAuth.redeemCode(input.value);
        status.textContent = result?.message || "兑换成功，X能量已经到账。";
        input.value = "";
        await Promise.all([loadOrders(), loadLogs(true), loadPlanOverview()]);
      } catch (error) {
        status.textContent = error?.message || "兑换失败，请检查兑换码";
      } finally {
        button.disabled = false;
      }
    });
  }

  function open(options = {}) {
    syncEnergyViewport();
    ensurePanel();
    return refresh(options);
  }

  document.addEventListener("DOMContentLoaded", ensurePanel, { once: true });
  window.addEventListener("resize", syncEnergyViewport, { passive: true });
  window.addEventListener("orientationchange", syncEnergyViewport, { passive: true });
  window.visualViewport?.addEventListener("resize", syncEnergyViewport, { passive: true });
  window.addEventListener("pageshow", syncEnergyViewport, { passive: true });
  window.addEventListener("hashchange", () => {
    if (window.location.hash === PAGE_HASH) void open();
  });
  window.addEventListener("shex:energy-page-open", (event) => {
    void open({ section: event.detail?.section || "" });
  });
  document.addEventListener("shex:auth-change", (event) => {
    const sameEmailOwner = Boolean(state.emailModalOwnerUserId &&
      state.emailModalOwnerUserId === String(event.detail?.userId || ""));
    state.homeSummaryRequestId += 1;
    state.logsRequestId += 1;
    state.ordersRequestId += 1;
    state.campaignRequestId += 1;
    state.planRequestId += 1;
    state.feedbackRequestId += 1;
    state.feedbackSubmitRequestId += 1;
    state.homeSummary = null;
    state.plan = null;
    state.campaign = null;
    state.logs = [];
    state.orders = [];
    state.category = "all";
    state.nextCursor = 0;
    state.hasMore = false;
    state.loading = false;
    state.feedbackItems = [];
    state.feedbackNextSkip = 0;
    state.feedbackHasMore = false;
    state.feedbackLoading = false;
    state.feedbackError = "";
    feedbackFiles = [];
    renderFeedbackFiles();
    const feedbackForm = ensurePanel()?.querySelector("[data-energy-feedback-form]");
    if (feedbackForm) {
      feedbackForm.reset();
      feedbackForm.querySelector("[data-energy-feedback-status]").textContent = "";
      const feedbackButton = feedbackForm.querySelector("[data-energy-feedback-submit]");
      feedbackButton.disabled = false;
      feedbackButton.textContent = "提交反馈";
    }
    state.feedbackSubmitting = false;
    closeDeletionModal();
    if (!sameEmailOwner) void closeEmailModal();
    setAccountStatus("", false);
    renderHomeSummary();
    renderLogs();
    renderOrders();
    applyView("hub");
    if (window.location.hash === PAGE_HASH) void refresh();
  });

  window.SHEXEnergy = { ensurePanel, open, refresh, showView };
  syncEnergyViewport();
})();
