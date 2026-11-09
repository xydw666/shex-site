(() => {
  const raw = {
    getItem: Storage.prototype.getItem,
    setItem: Storage.prototype.setItem,
    removeItem: Storage.prototype.removeItem,
    key: Storage.prototype.key
  };

  const SESSION_KEY = "shex_auth_session_v1";
  const AUTH_EXPIRED_KEY = "shex_auth_expired_v1";
  const FRIENDLY_SESSION_MESSAGE = "当前账号已在其他设备登录，本设备登录状态已过期，请重新登录。";
  const STORAGE_QUOTA_MESSAGE = "浏览器本地存储空间不足，云端账号可能已登录成功，但本机数据恢复失败。请清理浏览器缓存后重试，或换一个浏览器打开。";
  const SYNC_SLOW_MESSAGE = "正在后台同步云端数据，当前页面内容不会丢失";
  const SYNC_FAILED_MESSAGE = "云端同步有点慢，稍后会继续尝试";
  const DATA_NOT_READY_MESSAGE = "正在同步云端数据，请稍后再试，当前页面内容不会丢失";
  const CHAT_STORAGE_PROTOCOL_VERSION = 1;
  const DREAM_PROFILE_STORAGE_PROTOCOL_VERSION = 1;
  const CHAT_STORAGE_REFRESH_MESSAGE = "聊天存储已升级。为了保护聊天记录，请刷新页面后再继续使用。";
  const SYNC_SAVE_DEBOUNCE_MS = 10000;
  const SYNC_SAVE_MAX_WAIT_MS = 30000;
  const SYNC_RETRY_BASE_MS = 3000;
  const SYNC_RETRY_MAX_MS = 30000;
  const SYNC_RETRY_MAX_ATTEMPTS = 5;
  const SYNC_NOTICE_INTERVAL_MS = 16000;
  const SYNC_SLOW_NOTICE_THRESHOLD = 2;
  const LOGIN_KEYS = [
    SESSION_KEY,
    AUTH_EXPIRED_KEY,
    "currentUser",
    "shex_current_user",
    "shex_user",
    "userId",
    "username",
    "displayName",
    "sessionId",
    "sessionToken",
    "deviceId",
    "loginAt",
    "authToken"
  ];
  const CONFIG = {
    envId: "dushe1344-d0gkkazhi84de696a",
    region: "ap-shanghai",
    sdkUrl: "https://static.cloudbase.net/cloudbase-js-sdk/2.9.0/cloudbase.full.js",
    functions: { auth: "shexAuth", chatSync: "shexChatSyncTest" },
    collections: {
      users: "shex_users",
      userData: "shex_user_data",
      students: "shex_students",
      feedback: "shex_feedback"
    },
    ...(window.SHEX_CLOUDBASE_CONFIG || {})
  };
  const ADMIN_USER_IDS = [
    "shex_fee7aa44-4790-47fc-a89c-fb6f886a6714"
  ];
  const ADMIN_USERNAMES = [
    "创世神414",
    "administrator"
  ];
  const PLAN_TABLE = {
    free_cloud: { name: "初链版 Free", price: "0 元", cycle3hLimit: 30, cycle3dLimit: 120, maxSessions: 1, memoryLabel: "基础连续记忆" },
    plus: {
      name: "共振版 Plus",
      cycle3hLimit: 60,
      cycle3dLimit: 300,
      maxSessions: 2,
      memoryLabel: "增强连续记忆",
      durations: [
        { days: 30, price: "19.9 元", amountFen: 1990 },
        { days: 90, price: "48 元", amountFen: 4800 },
        { days: 180, price: "84 元", amountFen: 8400 }
      ]
    },
    pro: {
      name: "深链版 Pro",
      cycle3hLimit: 160,
      cycle3dLimit: 900,
      maxSessions: 3,
      memoryLabel: "深度连续记忆",
      durations: [
        { days: 30, price: "39.9 元", amountFen: 3990 },
        { days: 90, price: "96 元", amountFen: 9600 },
        { days: 180, price: "168 元", amountFen: 16800 }
      ]
    },
    ultra: {
      name: "恒链版 Ultra",
      cycle3hLimit: 300,
      cycle3dLimit: 1800,
      maxSessions: 3,
      memoryLabel: "最长连续记忆",
      durations: [
        { days: 30, price: "69.9 元", amountFen: 6990 },
        { days: 90, price: "168 元", amountFen: 16800 },
        { days: 180, price: "294 元", amountFen: 29400 }
      ]
    }
  };
  const ENERGY_PACKS = [
    { packType: "small_pack", name: "小能量包", price: "9.9 元", amount: 600 },
    { packType: "medium_pack", name: "中能量包", price: "22.9 元", amount: 1600 },
    { packType: "large_pack", name: "大能量包", price: "49.9 元", amount: 4000 }
  ];
  const SHOW_USER_ENERGY_PANEL_FOR_NORMAL_USERS = true;
  const ADMIN_ENERGY_FREE_MODE = false;
  const LOCAL_PREVIEW_SESSION_TOKEN = "local-plan-preview";
  const CYCLE_3H_MS = 3 * 60 * 60 * 1000;
  const CYCLE_3D_MS = 3 * 24 * 60 * 60 * 1000;
  const planDisplayPrice = (plan = {}) => plan.price || (Array.isArray(plan.durations) && plan.durations[0]?.price) || "";
  const IS_LOCAL_PREVIEW_HOST = /^(localhost|127\.0\.0\.1)$/i.test(location.hostname);
  const PREVIEW_QUERY = new URLSearchParams(location.search);
  const PLAN_PREVIEW_MODE = IS_LOCAL_PREVIEW_HOST
    && !/auth\.html$/i.test(location.pathname)
    && PREVIEW_QUERY.get("previewPlan") !== "0";
  const SHEX_DEBUG_MODE = PREVIEW_QUERY.get("debug") === "1"
    || localStorage.getItem("shex_debug_mode") === "1";
  const debugLog = (label, payload) => {
    if (!SHEX_DEBUG_MODE) return;
    console.log(label, payload);
  };
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
  // X小宠存档（每只宠物一条 + 每个梦角一份领养名单）也随账号云端快照同步，换设备以云端为准。
  const PET_SYNC_PREFIXES = ["shex_pet_local_v2:", "shex_pet_roster_v1:"];
  // X小宠存档已改为单独集合（x-world/pet/pet-cloud.js），不再进账号整体快照。
  const DATA_PREFIXES = ["shex_x_", "shex-transmission-", "shex_s_reply_"];
  const PLAN_CACHE_TTL_MS = 60 * 1000;
  const TRANSMISSION_RETENTION_DAYS = 90;
  const TRANSMISSION_CLEANUP_MARKER_PREFIX = "shex_local_transmission_cleanup_v1:";
  const LOCAL_ONLY_SYNC_KEYS = new Set([
    "shex_beautify_chat_appearance_hydrated_v1",
    "shex_x_message_reply_delivery_v1",
    "shex_x_message_favorites_v1",
    "shex_x_message_next_proactive_at_v1",
    "shex_x_message_last_proactive_dream_v1",
    "shex_x_proactive_test_mode_v1",
    "shex_x_message_proactive_cooldown_v1",
    "shex_x_message_current_proactive_cooldown_v1",
    "shex_x_incoming_call_cooldown_v1",
    "shex_x_data_size_warned_at"
  ]);
  const LEGACY_FAVORITES_KEY = "shex_x_message_favorites_v1";
  const LEGACY_FAVORITES_MIGRATION_KEY = "shex_legacy_favorites_migrated_v1";
  const LOCAL_IMAGE_DATA_KEYS = new Set([
    "shex_x_message_stickers_v1",
    "shex_x_stolen_stickers_v1"
  ]);
  const MIXED_IMAGE_DATA_KEYS = new Set([
    "shex_x_multi_state_v1",
    "shex_x_link_identity",
    "shex_x_message_background_v1",
    "shex_x_message_backgrounds_v1",
    "shex_x_stickers",
    "shex_x_album_v1",
    "shex_x_music_library_v1"
  ]);
  const LEGACY_KEYS = [
    "shex_x_link_identity",
    "shex_x_message_stickers_v1",
    "shex_x_stickers",
    "shex_x_stolen_stickers_v1",
    "shex_x_message_background_v1",
    "shex_x_message_custom_cards_v1",
    "shex_x_multi_state_v1",
    "shex_x_companion_final_v1",
    "shex_s_reply_history_v1"
  ];

  let syncTimer = 0;
  let syncFirstDirtyAt = 0;
  let isSavingSnapshot = false;
  let pendingSnapshotSave = false;
  const syncDiagnostics = {
    scheduled: 0,
    coalesced: 0,
    authoritativeInstanceMirrorWritesSuppressed: 0,
    savesStarted: 0,
    savesSucceeded: 0,
    savesSkippedNoChange: 0,
    reasons: Object.create(null)
  };
  const snapshotSyncTrace = [];
  let lastSyncGuardNoticeAt = 0;
  let consecutiveSyncSlowCount = 0;
  let consecutiveSyncFailureCount = 0;
  let syncRetryAttempt = 0;
  let cloudSnapshotVersion = 0;
  let dreamProfileStorageIndexRevision = 0;
  let dreamProfileStatuses = new Map();
  let dreamProfileLocalWriteDepth = 0;
  let authoritativeInstanceMirrorWriteDepth = 0;
  let beautifyAppearanceMirrorWriteDepth = 0;
  let lastCloudSnapshotFingerprint = "";
  let dataLoadStatus = "idle";
  let restoringFromCloud = false;
  let latestCloudSnapshotMeta = { keyCount: 0, hasXIdentity: false, hasXState: false, hasXStateKey: false, hasLegacyXChat: false, loaded: false, xDreamCount: null, xDeletedDreamCount: null };

  function recordSnapshotSyncTrace(stage, detail = {}) {
    const entry = {
      stage: String(stage || "unknown"),
      at: now(),
      localSnapshotVersion: cloudSnapshotVersion,
      ...detail
    };
    snapshotSyncTrace.push(entry);
    if (snapshotSyncTrace.length > 50) snapshotSyncTrace.splice(0, snapshotSyncTrace.length - 50);
    console.warn("[SNAPSHOT_SYNC_TRACE]", entry);
    return entry;
  }
  window.SHEX_RESTORING_FROM_CLOUD = false;
  let latestPlanData = null;
  let latestPlanCachedAt = 0;
  let latestPlanUserId = "";
  let planRequestInFlight = null;
  let latestCharacterCapabilities = null;
  let latestCharacterCapabilitiesUserId = "";
  let latestChatIndexedDbRollout = null;
  let latestChatIndexedDbRolloutUserId = "";
  let planRefreshTimer = 0;
  let paymentPollTimer = null;
  let transmissionCleanupScheduled = false;

  const now = () => Date.now();
  const setDataLoadStatus = (status, detail = {}) => {
    dataLoadStatus = status;
    window.SHEX_RESTORING_FROM_CLOUD = restoringFromCloud;
    debugLog("[DATA_LOAD_STATUS_DEBUG]", {
      step: "setDataLoadStatus",
      userId: session()?.userId || "",
      dataLoadStatus,
      restoringFromCloud,
      ...detail
    });
    document.dispatchEvent(new CustomEvent("shex:data-load-status", {
      detail: { status, ...detail }
    }));
  };
  const getDataLoadStatus = () => dataLoadStatus;
  const isRestoringFromCloud = () => restoringFromCloud;
  const getCloudSnapshotMeta = () => ({ ...latestCloudSnapshotMeta });
  const session = () => {
    try {
      const current = JSON.parse(raw.getItem.call(localStorage, SESSION_KEY) || "null");
      if (current?.userId && !current.sessionToken) return null;
      return current;
    } catch (_) {
      return null;
    }
  };
  const isLocalPreviewSession = (current = session()) => /^(localhost|127\.0\.0\.1)$/i.test(location.hostname)
    && current?.sessionToken === LOCAL_PREVIEW_SESSION_TOKEN;
  // 免登录访客：只使用本机数据，不请求云端快照，也不写回云端。
  const isGuestSession = (current = session()) => Boolean(current?.guest) || current?.sessionToken === "guest-local";
  const shouldUsePlanPreview = (current = session()) => PLAN_PREVIEW_MODE || isLocalPreviewSession(current) || isGuestSession(current);
  const previewSessionPayload = () => ({
    userId: "shex_fee7aa44-4790-47fc-a89c-fb6f886a6714",
    username: "创世神414",
    displayName: "创世神414",
    sessionToken: LOCAL_PREVIEW_SESSION_TOKEN,
    isAdmin: true
  });
  const ownerId = () => session()?.userId || "guest";
  const normalizeAdminName = (value) => String(value || "").trim().normalize("NFKC").toLowerCase();
  const adminNameSet = new Set(ADMIN_USERNAMES.map((name) => normalizeAdminName(name)));
  const isAdminSession = (current = session()) => Boolean(
    current?.isAdmin
      || current?.role === "admin"
      || ADMIN_USER_IDS.includes(current?.userId)
      || adminNameSet.has(normalizeAdminName(current?.username))
      || adminNameSet.has(normalizeAdminName(current?.displayName))
  );
  const CHARACTER_CAPABILITY_FIELDS = Object.freeze([
    "characterAccessContractVersion",
    "characterGalleryMode",
    "characterCreatorMode",
    "characterAIMode",
    "characterGalleryAccess",
    "characterCreatorAccess",
    "characterAIEnabled",
    "characterInstanceLimit"
  ]);
  function rememberCharacterCapabilities(value, userId) {
    const owner = String(userId || "");
    if (!owner || !value || typeof value !== "object"
      || !Object.prototype.hasOwnProperty.call(value, "characterAIEnabled")) {
      latestCharacterCapabilities = null;
      latestCharacterCapabilitiesUserId = "";
      return null;
    }
    latestCharacterCapabilities = Object.freeze(Object.fromEntries(
      CHARACTER_CAPABILITY_FIELDS
        .filter((field) => Object.prototype.hasOwnProperty.call(value, field))
        .map((field) => [field, value[field]])
    ));
    latestCharacterCapabilitiesUserId = owner;
    return latestCharacterCapabilities;
  }
  function getCachedCharacterCapabilities() {
    const currentUserId = String(session()?.userId || "");
    return currentUserId && latestCharacterCapabilitiesUserId === currentUserId
      ? latestCharacterCapabilities
      : null;
  }
  const deviceId = () => {
    const existing = raw.getItem.call(localStorage, "deviceId") || raw.getItem.call(localStorage, "shex_device_id");
    if (existing) return existing;
    const next = `device_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    raw.setItem.call(localStorage, "deviceId", next);
    raw.setItem.call(localStorage, "shex_device_id", next);
    return next;
  };
  const ownsKey = (key) => typeof key === "string" && DATA_PREFIXES.some((prefix) => key.startsWith(prefix));
  const scopedKey = (key, userId = ownerId()) => ownsKey(key) ? `shex_user:${userId}:${key}` : key;
  const unscopedKey = (key) => String(key).replace(/^shex_user:[^:]+:/, "");
  function cleanupTransmissionDateKeysNow(userId = ownerId(), options = {}) {
    const normalizedUserId = String(userId || "").trim();
    const policy = window.SHEXTransmissionRetention;
    if (!normalizedUserId || normalizedUserId === "guest" || !policy?.shouldRemoveTransmissionDateKey || !policy?.chinaDateKey) {
      return { ok: false, skipped: true, reason: "unavailable", removedKeys: [] };
    }
    const todayKey = policy.chinaDateKey(options.now);
    const markerKey = `${TRANSMISSION_CLEANUP_MARKER_PREFIX}${normalizedUserId}`;
    if (!options.force && raw.getItem.call(localStorage, markerKey) === todayKey) {
      return { ok: true, skipped: true, reason: "already_cleaned_today", removedKeys: [], todayKey };
    }

    const physicalPrefix = `shex_user:${normalizedUserId}:`;
    const candidates = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const physicalKey = raw.key.call(localStorage, index);
      if (typeof physicalKey !== "string" || !physicalKey.startsWith(physicalPrefix)) continue;
      const logicalKey = physicalKey.slice(physicalPrefix.length);
      if (policy.shouldRemoveTransmissionDateKey(logicalKey, {
        todayKey,
        retentionDays: TRANSMISSION_RETENTION_DAYS
      })) candidates.push({ physicalKey, logicalKey });
    }
    candidates.forEach(({ physicalKey }) => raw.removeItem.call(localStorage, physicalKey));
    raw.setItem.call(localStorage, markerKey, todayKey);
    return {
      ok: true,
      skipped: false,
      removedKeys: candidates.map(({ logicalKey }) => logicalKey),
      todayKey
    };
  }

  function scheduleTransmissionDateKeyCleanup(userId = ownerId()) {
    if (transmissionCleanupScheduled) return false;
    transmissionCleanupScheduled = true;
    const run = () => {
      transmissionCleanupScheduled = false;
      cleanupTransmissionDateKeysNow(userId);
    };
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(run, { timeout: 1500 });
    } else {
      window.setTimeout(run, 250);
    }
    return true;
  }
  const ensureLocalPreviewXLinkData = () => {
    if (!shouldUsePlanPreview()) return;
    const current = session() || previewSessionPayload();
    const userId = current.userId || previewSessionPayload().userId;
    const identityKey = scopedKey("shex_x_link_identity", userId);
    const stateKey = scopedKey("shex_x_multi_state_v1", userId);
    const disclaimerKey = scopedKey("shex_x_link_disclaimer_v1", userId);
    const existingState = safeJson(raw.getItem.call(localStorage, stateKey), {});
    if (!raw.getItem.call(localStorage, identityKey)) {
      raw.setItem.call(localStorage, identityKey, JSON.stringify({
        taName: "测试梦角",
        userCode: "小蛇",
        taAvatar: "",
        userAvatar: ""
      }));
    }
    if (!Array.isArray(existingState.dreams) || !existingState.dreams.length) {
      const dreamId = "dream_local_preview";
      raw.setItem.call(localStorage, stateKey, JSON.stringify({
        userName: "小蛇",
        userAvatar: "",
        currentDreamId: dreamId,
        migratedFromSingle: true,
        dreams: [{
          id: dreamId,
          name: "测试梦角",
          userNickname: "小蛇",
          userCall: "小蛇",
          avatar: "",
          backgroundPhotoId: "",
          createdAt: Date.now()
        }],
        groups: [],
        singleChats: { [dreamId]: [] },
        groupChats: {},
        letters: { [dreamId]: {} },
        replies: { [dreamId]: [] },
        companions: { [dreamId]: {} }
      }));
    }
    if (!raw.getItem.call(localStorage, disclaimerKey)) {
      raw.setItem.call(localStorage, disclaimerKey, JSON.stringify({
        xLinkDisclaimerRead: true,
        xLinkDisclaimerAgreed: true
      }));
    }
    if (PREVIEW_QUERY.get("demoChat") === "1") {
      const demoState = safeJson(raw.getItem.call(localStorage, stateKey), {});
      const dream = Array.isArray(demoState.dreams) && demoState.dreams.length
        ? demoState.dreams[0]
        : null;
      if (dream?.id) {
        const baseTime = Date.now() - (75 * 60 * 1000);
        dream.name = "祁煜";
        dream.nickname = "祁煜";
        dream.userNickname = "小蛇";
        dream.userCall = "小蛇";
        dream.fixedOpeningHandledAt = Date.now();
        demoState.userName = "小蛇";
        demoState.currentDreamId = dream.id;
        demoState.singleChats = demoState.singleChats && typeof demoState.singleChats === "object"
          ? demoState.singleChats
          : {};
        demoState.singleChats[dream.id] = [
          {
            id: "demo-chat-01",
            time: baseTime,
            role: "ta",
            text: "只是有些话要慢一点讲"
          },
          {
            id: "demo-chat-02",
            time: baseTime + (12 * 60 * 1000),
            role: "user",
            text: "我在听，你慢慢说。"
          },
          {
            id: "demo-chat-03",
            time: baseTime + (24 * 60 * 1000),
            role: "ta",
            text: "我是想告诉你，这一次不是顺口说说。我把今天发生的事从头到尾想了一遍，最后还是觉得应该认真地来见你。"
          },
          {
            id: "demo-chat-04",
            time: baseTime + (39 * 60 * 1000),
            role: "user",
            text: "那就靠近一点，我想看着你把话说完。"
          },
          {
            id: "demo-chat-05",
            time: baseTime + (40 * 60 * 1000),
            role: "ta",
            text: "傍晚的风从窗边绕进来。他放轻声音，抬眼看向你。我不是一时兴起，也不是因为今天恰好想起你。是很多个普通的瞬间叠在一起，让我越来越确定——我是真的很想你，也很想把以后那些看起来不起眼的日子，慢慢说给你听。",
            sourceType: "ai",
            sourceRoute: "character_ai",
            segments: [
              { type: "scene", text: "傍晚的风从半开的窗边绕进来，远处的灯一盏一盏亮起。" },
              { type: "action", text: "他稍稍靠近，目光停在你脸上，声音也跟着放轻。" },
              { type: "dialogue", text: "我不是一时兴起，也不是因为今天恰好想起你。" },
              { type: "action", text: "像是在斟酌最郑重的说法，他短暂地停了一下。" },
              { type: "dialogue", text: "是很多个普通的瞬间叠在一起，让我越来越确定——我是真的很想你，也很想把以后那些看起来不起眼的日子，慢慢说给你听。" }
            ]
          },
          {
            id: "demo-chat-06",
            time: baseTime + (58 * 60 * 1000),
            role: "user",
            text: "好，那你继续说。我今天有很多时间，可以把后面的故事都听完。"
          },
          {
            id: "demo-chat-07",
            time: baseTime + (59 * 60 * 1000),
            role: "ta",
            text: "夜色落在窗外。他笑了一下，把剩下的话慢慢讲给你听。那就从今天开始说吧。先说我路过花店的时候为什么停了很久，再说我看到晚霞时第一个想到的人是谁。还有那些没有发出去的消息、走到一半又折回去的路，以及每一次想见你时，我心里悄悄亮起来的那盏灯。",
            sourceType: "ai",
            sourceRoute: "character_ai",
            segments: [
              { type: "scene", text: "夜色落在窗外，玻璃上映出两个人靠得很近的影子。" },
              { type: "action", text: "他笑了一下，把原本微微蜷起的手指舒展开。" },
              { type: "dialogue", text: "那就从今天开始说吧。" },
              { type: "dialogue", text: "先说我路过花店的时候为什么停了很久，再说我看到晚霞时第一个想到的人是谁。" },
              { type: "action", text: "他的语速很慢，像是真的准备把每一件小事都认真交给你。" },
              { type: "dialogue", text: "还有那些没有发出去的消息、走到一半又折回去的路，以及每一次想见你时，我心里悄悄亮起来的那盏灯。" }
            ]
          }
        ];
        raw.setItem.call(localStorage, stateKey, JSON.stringify(demoState));
        raw.setItem.call(localStorage, identityKey, JSON.stringify({
          taName: "祁煜",
          userCode: "小蛇",
          taAvatar: "",
          userAvatar: ""
        }));
        raw.removeItem.call(localStorage, scopedKey("shex_x_message_immersive_modes_v1", userId));
        window.SHEXLocalDemoChat = Object.freeze({
          ownerId: userId,
          dreamId: String(dream.id),
          messages: demoState.singleChats[dream.id]
        });
      }
    }
  };
  const safeJson = (value, fallback) => {
    try {
      return JSON.parse(value) ?? fallback;
    } catch (_) {
      return fallback;
    }
  };
  const hasObjectContent = (value) => value && typeof value === "object" && Object.keys(value).length > 0;
  const hasMappedRecords = (value) => hasObjectContent(value) && Object.values(value).some((item) => {
    if (Array.isArray(item)) return item.length > 0;
    if (item && typeof item === "object") return Object.keys(item).length > 0;
    return Boolean(item);
  });
  function hasMeaningfulXState(rawValue) {
    const state = typeof rawValue === "string" ? safeJson(rawValue, null) : rawValue;
    if (!state || typeof state !== "object") return false;
    if (Array.isArray(state.dreams) && state.dreams.length > 0) return true;
    if (Array.isArray(state.groups) && state.groups.length > 0) return true;
    if (hasMappedRecords(state.singleChats)) return true;
    if (hasMappedRecords(state.groupChats)) return true;
    if (hasMappedRecords(state.letters)) return true;
    if (hasMappedRecords(state.replies)) return true;
    if (hasMappedRecords(state.companions)) return true;
    return false;
  }
  function xStateSnapshotCounts(rawValue) {
    const state = typeof rawValue === "string" ? safeJson(rawValue, null) : rawValue;
    if (!state || typeof state !== "object") return { xDreamCount: null, xDeletedDreamCount: null };
    return {
      xDreamCount: Array.isArray(state.dreams) ? state.dreams.length : 0,
      xDeletedDreamCount: state.deletedDreams && typeof state.deletedDreams === "object"
        ? Object.keys(state.deletedDreams).length
        : 0
    };
  }
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[char]));
  const randomId = () => crypto.randomUUID ? crypto.randomUUID() : `user-${now()}-${Math.random().toString(16).slice(2)}`;
  const normalizeUsername = (value) => String(value || "").trim().normalize("NFKC").toLowerCase();
  const formatError = (error) => {
    if (!error) return "未知错误";
    if (error.message) return error.message;
    if (error.error_description) return error.error_description;
    if (error.error) return error.error;
    try {
      return JSON.stringify(error);
    } catch (_) {
      return String(error);
    }
  };
  const errorDetails = (error) => {
    if (!error) return { message: "未知错误" };
    const detail = {};
    ["message", "code", "error", "error_description", "requestId", "traceId", "errCode", "errMsg"].forEach((key) => {
      if (error[key] !== undefined) detail[key] = error[key];
    });
    if (!Object.keys(detail).length) {
      try {
        return JSON.parse(JSON.stringify(error));
      } catch (_) {
        return { message: String(error) };
      }
    }
    return detail;
  };
  const isPermissionDenied = (error) => /PERMISSION_DENIED|permission denied|not authorized|unauthorized|access denied/i.test(formatError(error));
  const isFunctionTimeoutError = (value) => /FUNCTIONS_TIME_LIMIT_EXCEEDED|TIME_LIMIT_EXCEEDED|task timed out|timed out after/i.test([
    value?.code,
    value?.msg,
    value?.message,
    value?.detail,
    value?.error,
    formatError(value)
  ].filter(Boolean).join(" "));
  const isStorageQuotaError = (value) => /QuotaExceededError|quota has been exceeded|storage quota|exceeded the quota|Failed to execute 'setItem'.*Storage/i.test([
    value?.name,
    value?.code,
    value?.message,
    value?.detail,
    value?.error,
    formatError(value)
  ].filter(Boolean).join(" "));
  const isDangerousOverwriteError = (value) => /DANGEROUS_INIT_OVERWRITE_BLOCKED|检测到可能覆盖已有数据/i.test([
    value?.code,
    value?.message,
    value?.detail,
    formatError(value)
  ].filter(Boolean).join(" "));
  // X奖励系统：服务端已给出明确错误码时，前端显示人能看懂的原因，不再统一吞成「操作失败啦」。
  // 只做文案映射，不改变任何奖励规则；未知的 REWARD_* 码继续走统一兜底。
  const REWARD_ERROR_MESSAGES = Object.freeze({
    REWARD_WORK_URL_NOT_FOUND: "未识别到作品链接，请重新粘贴分享链接",
    REWARD_WORK_URL_INVALID: "链接无法识别，请确认所选平台与作品链接一致",
    REWARD_PLATFORM_INVALID: "请选择支持的平台（抖音 / 小红书 / B站 / 快手）",
    REWARD_DAILY_LIMIT_REACHED: "今日该类奖励申请次数已用完，请明天再来",
    REWARD_APPLICATION_DUPLICATE: "该作品已有进行中的申请，请等待审核结果",
    REWARD_WORK_ALREADY_GRANTED: "该作品已领取过发布奖励",
    REWARD_WORK_ALL_TIERS_GRANTED: "该作品当前点赞档位已全部领取",
    REWARD_WORK_OWNER_MISMATCH: "该作品已被其他账号绑定",
    REWARD_PROOF_REQUIRED: "请上传 1-6 张截图凭证",
    REWARD_SYSTEM_ADMIN_ONLY: "奖励系统暂未开放",
    REWARD_TYPE_INVALID: "奖励类型无效，请刷新页面后重试",
    REWARD_STORAGE_NOT_READY: "奖励系统数据库尚未准备好，请联系管理员",
    REWARD_REVIEW_NOTE_REQUIRED: "驳回必须填写审核建议",
    REWARD_LIKE_COUNT_INVALID: "请填写管理员确认的点赞数（大于 0 的整数）",
    REWARD_REVISION_CONFLICT: "这条申请刚刚被更新过，请刷新后再操作",
    REWARD_INVALID_TRANSITION: "这条申请当前状态不能执行该操作，请刷新",
    REWARD_APPLICATION_NOT_FOUND: "奖励申请不存在，请刷新"
  });
  const rewardErrorMessage = (value) => {
    const code = String(value?.code || value?.error?.code || "").trim();
    return Object.prototype.hasOwnProperty.call(REWARD_ERROR_MESSAGES, code) ? REWARD_ERROR_MESSAGES[code] : "";
  };
  const friendlyErrorMessage = (value, fallback = "操作失败啦，请稍后再试") => {
    const text = [
      value?.code,
      value?.message,
      value?.detail,
      value?.step,
      value?.error,
      formatError(value)
    ].filter(Boolean).join(" ");
    if (/CHAT_STORAGE_PROTOCOL_UPGRADE_REQUIRED|聊天存储已升级|请刷新页面后再继续使用/i.test(text)) {
      return CHAT_STORAGE_REFRESH_MESSAGE;
    }
    if (isStorageQuotaError(value)) return STORAGE_QUOTA_MESSAGE;
    if (isSessionExpiredError(value)) return FRIENDLY_SESSION_MESSAGE;
    const rewardMessage = rewardErrorMessage(value);
    if (rewardMessage) return rewardMessage;
    if (/CLOUDBASE_SDK_LOAD_FAILED|CLOUDBASE_SDK_TIMEOUT/i.test(text)) return "系统连接组件加载失败，请刷新页面后再试。";
    if (/CLOUDBASE_AUTH_BUSY/i.test(text)) return "另一个页面正在准备系统身份，请关闭重复页面或稍后重试。";
    if (/CLOUDBASE_AUTH_COOLDOWN/i.test(text)) return "系统身份连接连续失败，已暂停短暂重试，请稍后刷新。";
    if (/CLOUDBASE_REAUTH_FAILED/i.test(text)) return "系统身份连接恢复失败，请刷新页面后再试。";
    if (/CLOUDBASE_AUTH_NOT_READY/i.test(text)) return "系统身份连接尚未准备好，请刷新页面后再试。";
    if (isFunctionTimeoutError(value)) return SYNC_SLOW_MESSAGE;
    if (/CAPTCHA_REQUIRED|请完成人机验证/i.test(text)) return "请完成人机验证。";
    if (/CAPTCHA_INVALID|invalid_captcha|captcha_invalid|验证码不正确|验证码错误/i.test(text)) return "人机验证码不正确，请重新输入。";
    if (/CAPTCHA_EXPIRED|CAPTCHA_USED|captcha_expired|captcha_used|验证码已过期|验证码已使用/i.test(text)) return "人机验证码已失效，请刷新验证码后重试。";
    if (/CAPTCHA_NOT_CONFIGURED/i.test(text)) return "人机验证尚未配置，请联系管理员（验证码配置异常）。";
    if (/CAPTCHA_SERVICE_UNAVAILABLE|CAPTCHA_SERVICE_ERROR|人机验证服务/i.test(text)) return "人机验证服务暂时不可用，请刷新验证码后重试（验证码服务异常）。";
    if (/DANGEROUS_INIT_OVERWRITE_BLOCKED|EMPTY_SNAPSHOT_BLOCKED|DANGEROUS_OVERWRITE_BLOCKED|危险覆盖|覆盖已有数据/i.test(text)) return DATA_NOT_READY_MESSAGE;
    if (/NO_PERMISSION|PERMISSION_DENIED|无权限访问|无权访问/i.test(text)) return "无权限访问。";
    if (/ENERGY_NOT_ENOUGH|X能量不足/i.test(text)) return "X能量不足，可以等待恢复或前往充值。";
    if (/EMPTY_REDEEM_CODE|请输入兑换码/i.test(text)) return "请输入兑换码";
    if (/REDEEM_CODE_USED|该兑换码已被使用/i.test(text)) return "该兑换码已被使用，无法重复兑换。";
    if (/REDEEM_CODE_INVALID|兑换码不存在|已失效/i.test(text)) return "兑换码不存在或已失效，请检查后重试。";
    if (/EMAIL_ALREADY_BOUND_TO_ANOTHER_ACCOUNT/i.test(text)) return "该邮箱已绑定其他账号，请换一个邮箱。";
    if (/ACCOUNT_ALREADY_BOUND_TO_ANOTHER_EMAIL/i.test(text)) return "当前账号已绑定其他邮箱。";
    if (/EMAIL_IDENTITY_REQUIRED/i.test(text)) return "邮箱验证未完成，请重新获取验证码后再试。";
    if (/EMAIL_BINDING_TRANSACTION_UNAVAILABLE/i.test(text)) return "邮箱绑定服务配置异常，请联系管理员。";
    if (/EMAIL_BINDING_TRANSACTION_FAILED|EMAIL_BINDING_LOOKUP_FAILED/i.test(text)) return "邮箱绑定暂时失败，请稍后重试。";
    if (/PHONE_IDENTITY_LOOKUP_FAILED/i.test(text)) return "手机号身份核验服务暂时不可用，请稍后重试。";
    if (/PHONE_IDENTITY_REQUIRED/i.test(text)) return "手机号身份切换尚未完成，请重新获取验证码后再试。";
    if (/PHONE_NOT_VERIFIED/i.test(text)) return "尚未确认手机号验证状态，请重新获取验证码后再试。";
    if (/PHONE_UID_MISMATCH|PHONE_PROFILE_UID_MISMATCH/i.test(text)) return "当前手机号身份不一致，请刷新页面后重新验证。";
    if (/PHONE_ALREADY_REGISTERED/i.test(text)) return "该手机号已经注册过 SHE.X 账号，请直接使用用户名密码登录。";
    if (/PHONE_VERIFICATION_REQUIRED/i.test(text)) return "注册前需要完成手机号验证，请刷新页面后重试。";
    if (/PHONE_BINDINGS_COLLECTION_MISSING/i.test(text)) return "手机号注册功能尚未完成数据库配置，请联系管理员。";
    if (/PHONE_ALREADY_BOUND_TO_ACCOUNT/i.test(text)) return "当前账号已经绑定手机号，绑定后不能直接解绑。";
    if (/PHONE_REUSE_COOLDOWN/i.test(text)) return "该手机号仍在换绑冷却期，请稍后再试。";
    if (/MULTIPLE_ACTIVE_PHONE_BINDINGS/i.test(text)) return "账号手机号绑定状态异常，请联系管理员。";
    if (/PHONE_BINDING_ACCOUNT_CHANGED/i.test(text)) return "账号状态已经变化，请重新登录后再试。";
    if (/PHONE_NOT_BOUND/i.test(text)) return "当前账号尚未绑定手机号。";
    if (/OLD_PHONE_UID_MISMATCH/i.test(text)) return "验证的旧手机号与当前绑定手机号不一致。";
    if (/PHONE_CHANGE_SAME_PHONE/i.test(text)) return "新手机号不能与当前绑定手机号相同。";
    if (/PHONE_CHANGE_REQUEST_EXPIRED/i.test(text)) return "换绑验证已过期，请重新验证旧手机号。";
    if (/PHONE_CHANGE_REQUEST_INVALID|PHONE_CHANGE_SESSION_CHANGED/i.test(text)) return "换绑状态已经失效，请重新开始。";
    if (/PHONE_CHANGE_COLLECTION_MISSING/i.test(text)) return "手机号换绑功能尚未完成数据库配置，请联系管理员。";
    if (/PHONE_CHANGE_TRANSACTION_CONFLICT/i.test(text)) return "换绑请求发生冲突，请重新操作一次。";
    if (/PHONE_BINDING_PERMISSION_DENIED|PHONE_BINDING_TRANSACTION_UNAVAILABLE|PHONE_BINDING_FAILED/i.test(text)) return "手机号绑定服务暂时不可用，请稍后再试。";
    if (/REGISTER_DATABASE_PERMISSION_DENIED|PHONE_REGISTRATION_TRANSACTION_UNAVAILABLE/i.test(text)) return "手机号注册服务配置异常，请联系管理员。";
    if (/REGISTER_TRANSACTION_CONFLICT/i.test(text)) return "注册请求发生冲突，请重新提交一次。";
    if (/REGISTER_CREATED_SESSION_FAILED/i.test(text)) return "账号已经创建，请直接使用刚设置的用户名和密码登录。";
    if (/USERNAME_EXISTS|用户名已被注册|已被注册/i.test(text)) return "当前用户名已被注册过，请更换用户名或直接登录";
    if (/INVALID_CREDENTIALS|invalid-credentials|invalid credentials|账号或密码|密码不对/i.test(text)) return "账号或密码不对，再检查一下";
    if (/LOGIN_LOCKED/.test(text)) return String(value?.message || value?.detail || "登录尝试次数过多，请稍后再试");
    if (/USER_NOT_FOUND|account not found|账号不存在/i.test(text)) return "账号不存在，请先注册";
    if (/ResourceNotFound|Db or Table not exist|collection .*not exist|not exist|not found/i.test(text)) return "系统配置还没准备好，请稍后再试";
    if (/upload|上传|file|storage/i.test(text)) return "图片上传失败啦，换一张小一点的试试";
    if (/network|timeout|timed out|ECONN|fetch|网络/i.test(text)) return "网络有点不稳定，稍后再试试";
    if (/saveSnapshot|loadSnapshot|数据同步|CloudBase 数据同步失败/i.test(text)) return SYNC_FAILED_MESSAGE;
    return fallback;
  };
  const isAuthExpired = () => raw.getItem.call(sessionStorage, AUTH_EXPIRED_KEY) === "true";
  const isSessionExpiredError = (value) => {
    const text = [
      value?.code,
      value?.message,
      value?.detail,
      value?.step,
      formatError(value)
    ].filter(Boolean).join(" ");
    return /SESSION_EXPIRED|SESSION_LIMIT|invalid session|missing userId|missing .*sessionToken|登录状态(?:已)?失效|登录状态(?:已)?过期|会话(?:已)?失效|会话(?:已)?过期/i.test(text);
  };
  const notify = (message, type = "error") => {
    document.dispatchEvent(new CustomEvent("shex:cloudbase-status", { detail: { message, type } }));
    let toast = document.querySelector("#shexCloudbaseToast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "shexCloudbaseToast";
      document.body.appendChild(toast);
    }
    toast.onclick = null;
    toast.style.cursor = "";
    const xWorldThemePages = new Set(["world", "letter", "reply", "companion", "settings", "avatar-display", "album", "ta-status", "link-status"]);
    const useXWorldTheme = xWorldThemePages.has(document.body?.dataset?.xPage || "");
    toast.classList.toggle("is-x-world-themed", useXWorldTheme);
    if (useXWorldTheme) {
      const themePanel = document.querySelector("#xWorldHome, #xSettingsPanel, #xAvatarDisplayPanel, #xAlbumPanel, #xTaStatusPanel, #xLinkStatusPanel");
      const accentRgb = themePanel ? getComputedStyle(themePanel).getPropertyValue("--x-world-accent-rgb").trim() : "";
      toast.style.setProperty("--x-world-accent-rgb", accentRgb || "185, 120, 74");
    } else {
      toast.style.removeProperty("--x-world-accent-rgb");
    }
    const isInfo = type === "info";
    toast.style.cssText = [
      "position:fixed",
      "left:50%",
      "bottom:22px",
      "z-index:100000",
      "max-width:min(520px,calc(100vw - 32px))",
      "padding:12px 16px",
      "border-radius:14px",
      isInfo ? "background:rgba(255,251,244,.94)" : "background:rgba(40,38,58,.92)",
      isInfo ? "color:#5f5275" : "color:#fff",
      isInfo ? "border:1px solid rgba(185,142,101,.24)" : "border:0",
      isInfo ? "box-shadow:0 16px 42px rgba(120,85,50,.16)" : "box-shadow:0 18px 48px rgba(40,38,58,.28)",
      useXWorldTheme ? "border:1px solid rgba(var(--x-world-accent-rgb),.34)" : "",
      useXWorldTheme ? "box-shadow:0 16px 42px rgba(var(--x-world-accent-rgb),.18)" : "",
      "font-size:14px",
      "line-height:1.6",
      "transform:translateX(-50%)"
    ].join(";");
    toast.textContent = "";
    const text = document.createElement("span");
    text.textContent = message;
    toast.appendChild(text);
    if (message === FRIENDLY_SESSION_MESSAGE || isAuthExpired()) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "去登录";
      button.style.cssText = "margin-left:12px;border:1px solid rgba(255,255,255,.56);border-radius:999px;padding:6px 10px;color:#fff;background:rgba(255,255,255,.14);cursor:pointer;";
      button.addEventListener("click", goAuth);
      toast.appendChild(button);
    }
    toast.dataset.type = type;
    window.clearTimeout(toast._timer);
    toast._timer = window.setTimeout(() => toast.remove(), type === "error" ? 6200 : 3200);
  };

  const modalScrollState = {
    lockCount: 0,
    scrollY: 0
  };

  function lockPageScroll() {
    if (modalScrollState.lockCount === 0) {
      modalScrollState.scrollY = window.scrollY || document.documentElement.scrollTop || 0;
      document.documentElement.classList.add("shex-modal-scroll-lock");
      document.body.classList.add("shex-modal-scroll-lock");
      document.body.style.top = `-${modalScrollState.scrollY}px`;
    }
    modalScrollState.lockCount += 1;
  }

  function unlockPageScroll() {
    modalScrollState.lockCount = Math.max(0, modalScrollState.lockCount - 1);
    if (modalScrollState.lockCount > 0) return;
    const scrollY = modalScrollState.scrollY || 0;
    document.documentElement.classList.remove("shex-modal-scroll-lock");
    document.body.classList.remove("shex-modal-scroll-lock");
    document.body.style.top = "";
    window.scrollTo(0, scrollY);
  }

  function makeModalScrollController(mask, options = {}) {
    let locked = false;
    let touchY = null;
    const selector = options.scrollTarget || "";
    const fallbackSelector = options.fallbackTarget || "";
    const getScroller = (target) => {
      if (!mask) return null;
      const node = target instanceof Element ? target : null;
      if (selector) {
        const closest = node?.closest?.(selector);
        if (closest && mask.contains(closest)) return closest;
        return mask.querySelector(selector);
      }
      const fallback = node?.closest?.("[data-shex-scroll-area], .shex-plan-dialog, .shex-admin-dialog, .update-notice-body, .update-notice-modal");
      if (fallback && mask.contains(fallback)) return fallback;
      return fallbackSelector ? mask.querySelector(fallbackSelector) : mask;
    };
    const canScroll = (node) => node && node.scrollHeight > node.clientHeight;
    const scrollBy = (node, deltaY) => {
      if (!canScroll(node)) return false;
      const max = Math.max(0, node.scrollHeight - node.clientHeight);
      const previous = node.scrollTop;
      node.scrollTop = Math.max(0, Math.min(max, previous + deltaY));
      return node.scrollTop !== previous;
    };
    const onWheel = (event) => {
      if (!locked) return;
      event.preventDefault();
      event.stopPropagation();
      scrollBy(getScroller(event.target), event.deltaY);
    };
    const onTouchStart = (event) => {
      touchY = event.touches[0]?.clientY ?? null;
    };
    const onTouchMove = (event) => {
      if (!locked) return;
      const currentY = event.touches[0]?.clientY ?? touchY;
      event.preventDefault();
      event.stopPropagation();
      if (touchY !== null && currentY !== null) {
        scrollBy(getScroller(event.target), touchY - currentY);
      }
      touchY = currentY;
    };
    const onTouchEnd = () => {
      touchY = null;
    };
    mask.addEventListener("wheel", onWheel, { passive: false });
    mask.addEventListener("touchstart", onTouchStart, { passive: true });
    mask.addEventListener("touchmove", onTouchMove, { passive: false });
    mask.addEventListener("touchend", onTouchEnd, { passive: true });
    mask.addEventListener("touchcancel", onTouchEnd, { passive: true });
    return {
      open() {
        if (locked) return;
        locked = true;
        touchY = null;
        lockPageScroll();
      },
      close() {
        if (!locked) return;
        locked = false;
        touchY = null;
        unlockPageScroll();
      }
    };
  }

  window.SHEXModalScroll = {
    create: makeModalScrollController,
    lockPage: lockPageScroll,
    unlockPage: unlockPageScroll
  };

  function setSession(next) {
    const previousUserId = String(session()?.userId || "");
    raw.removeItem.call(sessionStorage, AUTH_EXPIRED_KEY);
    const enriched = {
      ...next,
      deviceId: next.deviceId || deviceId(),
      loginAt: next.loginAt || Date.now()
    };
    if (previousUserId && previousUserId !== String(enriched.userId || "")) {
      latestPlanData = null;
      latestPlanCachedAt = 0;
      latestPlanUserId = "";
      planRequestInFlight = null;
      latestCharacterCapabilities = null;
      latestCharacterCapabilitiesUserId = "";
    }
    if (isAdminSession(enriched)) enriched.isAdmin = true;
    raw.setItem.call(localStorage, SESSION_KEY, JSON.stringify(enriched));
    raw.setItem.call(localStorage, "userId", enriched.userId || "");
    raw.setItem.call(localStorage, "username", enriched.username || "");
    raw.setItem.call(localStorage, "displayName", enriched.displayName || "");
    raw.setItem.call(localStorage, "sessionId", enriched.sessionToken || enriched.sessionId || "");
    raw.setItem.call(localStorage, "sessionToken", enriched.sessionToken || "");
    raw.setItem.call(localStorage, "loginAt", String(enriched.loginAt || ""));
    document.dispatchEvent(new CustomEvent("shex:auth-change", { detail: enriched }));
  }

  function clearSession() {
    clearTimeout(syncTimer);
    syncTimer = 0;
    syncFirstDirtyAt = 0;
    cloudSnapshotVersion = 0;
    lastCloudSnapshotFingerprint = "";
    syncRetryAttempt = 0;
    latestPlanData = null;
    latestPlanCachedAt = 0;
    latestPlanUserId = "";
    planRequestInFlight = null;
    latestCharacterCapabilities = null;
    latestCharacterCapabilitiesUserId = "";
    LOGIN_KEYS.forEach((key) => {
      raw.removeItem.call(localStorage, key);
      raw.removeItem.call(sessionStorage, key);
    });
    document.dispatchEvent(new CustomEvent("shex:auth-change", { detail: null }));
  }

  async function endCurrentSession() {
    const current = session();
    if (!current?.userId || !current?.sessionToken || isAuthExpired()) return;
    try {
      await callAuthFunction("logout", {
        userId: current.userId,
        sessionToken: current.sessionToken,
        deviceId: current.deviceId || deviceId()
      });
    } catch (error) {
      console.warn("[shexAuth] logout failed", error);
    }
  }

  async function flushBeforeSessionChange() {
    try {
      window.SHEXFlushXMessageData?.();
    } catch (error) {
      console.warn("[SHEX] local chat flush failed before session change", error);
    }
    clearTimeout(syncTimer);
    syncTimer = 0;
    syncFirstDirtyAt = 0;
    const current = session();
    if (!current || isAuthExpired()) return { ok: true, skipped: true };
    // 资料还没成功加载过：本机没有可靠的新内容可传，不拦退出（本机资料原样保留）。
    if (dataLoadStatus !== "success") return { ok: true, skipped: true };
    try {
      await saveCloudSnapshot(current);
      return { ok: true };
    } catch (error) {
      console.warn("CloudBase 退出前同步失败：", error);
      if (isSessionExpiredError(error) || formatError(error) === FRIENDLY_SESSION_MESSAGE) {
        markSessionExpired();
        return { ok: true, expired: true };
      }
      notify(friendlyErrorMessage(error, SYNC_FAILED_MESSAGE));
      return { ok: false, error };
    }
  }

  const LOGOUT_UNSYNCED_CONFIRM_MESSAGE = "云端同步暂时失败，这台设备上还有没同步成功的改动。\n\n这些改动会保留在这台设备上，下次在这台设备登录同一账号时会自动继续同步；在同步成功之前，其他设备看不到它们。\n\n仍要退出登录吗？";
  async function logoutAndRedirect(target = "./auth.html?login=1") {
    const flushed = await flushBeforeSessionChange();
    // X103：退出前保存失败时不再静默退出。本机资料与同步基线都不会被清除，
    // 重新登录后会与云端合并并继续上传；这里让用户知情并可以选择先不退出。
    if (flushed && flushed.ok === false && typeof window.confirm === "function") {
      if (!window.confirm(LOGOUT_UNSYNCED_CONFIRM_MESSAGE)) return { cancelled: true };
    }
    await endCurrentSession();
    clearSession();
    await resetCloudBaseIdentityToAnonymous();
    if (/auth\.html$/i.test(location.pathname) && target === "./auth.html") {
      renderAuthLinks();
      return;
    }
    window.location.href = target;
  }

  function goAuth() {
    void logoutAndRedirect("./auth.html");
  }

  function markSessionExpired() {
    raw.setItem.call(sessionStorage, AUTH_EXPIRED_KEY, "true");
    document.dispatchEvent(new CustomEvent("shex:auth-expired", { detail: { message: FRIENDLY_SESSION_MESSAGE } }));
    renderAuthLinks();
    notify("当前账号已在其他设备登录，本设备登录状态已过期，请重新登录");
  }

  function sharedCloudBaseClient() {
    if (window.SHEXCloudBaseClient?.getClient && window.SHEXCloudBaseClient?.run) return window.SHEXCloudBaseClient;
    const error = new Error("CloudBase 共享鉴权组件未就绪");
    error.code = "CLOUDBASE_AUTH_NOT_READY";
    throw error;
  }

  function cloud() {
    return sharedCloudBaseClient().getClient();
  }

  function withCloudBaseAuth(operation, options = {}) {
    return sharedCloudBaseClient().run(operation, options);
  }

  const AUTH_RETRY_SAFE_READ_ACTIONS = new Set([
    "getRegistrationCaptcha", "getPhoneBindingStatus", "loadSnapshot", "getChatIndexedDbRollout",
    "getMyPlan", "getEnergyHomeSummary", "getPaymentOrderStatus", "getMyPaymentHistory", "getMyEnergyLogs",
    "getMyEnergyCampaign", "getDashboardStats", "getRevenueByDateRange", "getUserPaymentHistory",
    "getFeedbackList", "getMyFeedbackList", "getMonitorEvents", "getBackendDiagnostics", "getCloudFileTempUrl",
    "getRedeemCodeRecords", "adminSearchUsers", "adminGetEnergyCampaign", "adminListEnergyCampaigns", "adminListAccountDeletionRequests",
    "getMyInviteInfo", "getMyRewardApplications", "getLimitedCreatorRewardWorks", "adminListRewardApplications"
  ]);

  function authActionAllowsTransportRetry(action, payload = {}, options = {}) {
    if (options.retryAuthOnce === true || options.retryAuthOnce === false) return options.retryAuthOnce;
    if (AUTH_RETRY_SAFE_READ_ACTIONS.has(String(action || ""))) return true;
    if (action === "consumeEnergy") return Boolean(String(payload?.requestId || "").trim());
    if (action === "saveSnapshot") return Number.isFinite(Number(payload?.baseSnapshotVersion));
    if (action === "registerPendingFileCleanup") return Boolean(String(payload?.fileId || "").trim());
    if (action === "registerPendingFileCleanups") return Array.isArray(payload?.items) && payload.items.length > 0;
    return false;
  }

  async function getCloudBaseAuth() {
    const api = await cloud();
    return api.auth;
  }

  function hasVerifiedIdentity(state, kind) {
    const user = state?.user && typeof state.user === "object" ? state.user : {};
    const uid = String(user.uid || user.sub || "").trim();
    if (!uid || user.isAnonymous === true) return false;
    if (kind === "email" && String(user.email || user.emailAddress || user.email_address || "").trim()) return true;
    if (kind === "phone" && String(user.phoneNumber || user.phone_number || "").trim()) return true;
    const typePattern = kind === "email" ? /EMAIL|MAIL/i : /PHONE|SMS|MOBILE/i;
    return [...(Array.isArray(user.providers) ? user.providers : []), ...(Array.isArray(user.identities) ? user.identities : [])]
      .some((provider) => typePattern.test(String(provider?.id || provider?.name || provider?.type || provider?.platform || ""))
        && Boolean(String(provider?.providerUserId || provider?.provider_user_id || provider?.platformId || "").trim()));
  }

  async function withFreshVerifiedIdentityClient(kind, operation) {
    const sourceApi = await cloud();
    const state = await sourceApi.auth.getLoginState().catch(() => null);
    if (!hasVerifiedIdentity(state, kind)) {
      const isEmail = kind === "email";
      const error = new Error(`${isEmail ? "邮箱" : "手机号"}身份切换尚未完成，请重新获取验证码后再试。`);
      error.code = isEmail ? "EMAIL_IDENTITY_REQUIRED" : "PHONE_IDENTITY_REQUIRED";
      throw error;
    }
    if (typeof sourceApi.auth.getAccessToken === "function") await sourceApi.auth.getAccessToken();

    const initOptions = {
      env: CONFIG.envId,
      region: CONFIG.region || "ap-shanghai"
    };
    const app = window.cloudbase.init(initOptions);
    const auth = app.auth({ persistence: "local" });
    const api = { app, auth, db: app.database() };
    sharedCloudBaseClient().replaceClient(api);
    return operation(api);
  }

  async function resetCloudBaseIdentityToAnonymous() {
    const client = sharedCloudBaseClient();
    if (typeof client.resetToAnonymous !== "function") {
      const error = new Error("CloudBase 共享鉴权组件缺少匿名身份恢复能力");
      error.code = "CLOUDBASE_AUTH_NOT_READY";
      throw error;
    }
    await client.resetToAnonymous();
  }

  const collections = () => ({
    users: CONFIG.collections?.users || "shex_users",
    userData: CONFIG.collections?.userData || "shex_user_data",
    students: CONFIG.collections?.students || "shex_students",
    feedback: CONFIG.collections?.feedback || "shex_feedback"
  });

  async function callAuthFunction(action, payload = {}, options = {}) {
    let data = null;
    const functionName = CONFIG.functions?.auth || "shexAuth";
    try {
      debugLog("[shexAuth] calling", {
        action,
        functionName,
        envId: CONFIG.envId,
        hasCloudConfig: Boolean(CONFIG.envId)
      });
      const invoke = (api) => api.app.callFunction({
          name: functionName,
          data: {
            action,
            collections: collections(),
            ...payload
          }
        });
      const verifiedIdentity = String(options.verifiedIdentity || (options.verifiedPhoneIdentity === true ? "phone" : "")).trim().toLowerCase();
      const result = verifiedIdentity
        ? await withFreshVerifiedIdentityClient(verifiedIdentity, invoke)
        : await withCloudBaseAuth(invoke, {
            retryAuthOnce: authActionAllowsTransportRetry(action, payload, options)
          });
      data = result?.result || result;
    } catch (error) {
      const detail = errorDetails(error);
      console.error("[shexAuth] callFunction failed", {
        action,
        functionName,
        envId: CONFIG.envId,
        detail,
        raw: error
      });
      if (isSessionExpiredError(error)) {
        markSessionExpired();
        throw new Error(FRIENDLY_SESSION_MESSAGE);
      }
      if (isFunctionTimeoutError(error) || isFunctionTimeoutError(detail)) {
        throw new Error(SYNC_SLOW_MESSAGE);
      }
      const wrapped = new Error(friendlyErrorMessage(error, "系统连接有点不稳定，请稍后再试"));
      wrapped.code = error?.code || error?.errCode || "CLOUDBASE_CALL_FAILED";
      wrapped.step = action;
      wrapped.rawError = error;
      throw wrapped;
    }
    debugLog("[shexAuth] result", {
      action,
      ok: Boolean(data?.ok),
      code: data?.code || "",
      step: data?.step || "",
      message: data?.message || ""
    });
    if (!data?.ok) {
      if (isSessionExpiredError(data)) {
        markSessionExpired();
        const error = new Error(FRIENDLY_SESSION_MESSAGE);
        error.code = data?.error?.code || data?.code || '';
        error.step = data?.error?.step || data?.step || '';
        error.detail = data?.error?.detail || data?.detail || data?.message || '';
        throw error;
      }
      if (isDangerousOverwriteError(data)) {
        console.warn("[shexAuth] saveSnapshot rejected by protection", {
          action,
          code: data?.code || "",
          step: data?.step || "",
          detail: data?.detail || data?.message || "",
          rawError: data
        });
        const error = new Error(DATA_NOT_READY_MESSAGE);
        error.code = data?.code || "";
        error.step = data?.step || "";
        error.detail = data?.detail || data?.message || "";
        error.rawError = data;
        throw error;
      }
      console.error("[SHEX_ERROR]", {
        code: data?.code || "",
        step: data?.step || "",
        detail: data?.detail || data?.message || "",
        message: data?.message || data?.detail || "",
        action,
        source: "shexAuth.callAuthFunction",
        requestId: data?.requestId || payload?.requestId || "",
        stack: new Error("shexAuth rejected response").stack || "",
        rawError: data
      });
      const error = new Error(friendlyErrorMessage(data));
      error.code = data?.error?.code || data?.code || "";
      error.step = data?.error?.step || data?.step || "";
      error.detail = data?.error?.detail || data?.detail || data?.message || "";
      error.rawError = data;
      throw error;
    }
    return data;
  }

  async function registerPendingFileCleanup(fileId, resourceType = 'chat_user_avatar') {
    const current = session();
    if (!current?.userId || !current?.sessionToken || isAuthExpired()) throw new Error(FRIENDLY_SESSION_MESSAGE);
    return callAuthFunction('registerPendingFileCleanup', {
      userId: current.userId,
      sessionToken: current.sessionToken,
      fileId: String(fileId || '').trim(),
      resourceType: String(resourceType || 'chat_user_avatar').trim()
    });
  }

  async function registerPendingFileCleanups(items = []) {
    const current = session();
    if (!current?.userId || !current?.sessionToken || isAuthExpired()) throw new Error(FRIENDLY_SESSION_MESSAGE);
    const normalized = Array.from(items || []).map((item) => ({
      fileId: String(item?.fileId || '').trim(),
      resourceType: String(item?.resourceType || '').trim()
    })).filter((item) => item.fileId && item.resourceType);
    if (!normalized.length || normalized.length > 30) throw new Error('单次只能登记1至30个待清理文件');
    return callAuthFunction('registerPendingFileCleanups', {
      userId: current.userId,
      sessionToken: current.sessionToken,
      items: normalized
    });
  }

  async function callChatSyncFunction(action, payload = {}) {
    const current = session();
    if (!current?.userId || !current?.sessionToken || isAuthExpired()) throw new Error(FRIENDLY_SESSION_MESSAGE);
    const functionName = CONFIG.functions?.chatSync || "shexChatSyncTest";
    let data = null;
    try {
      const retryAuthOnce = /^(?:load|list|get|pull|status|health|preview)/i.test(String(action || ""))
        || Boolean(String(payload?.operationId || payload?.requestId || payload?.messageId || "").trim());
      const result = await withCloudBaseAuth((api) => api.app.callFunction({
        name: functionName,
        data: {
          action,
          userId: current.userId,
          sessionToken: current.sessionToken,
          deviceId: current.deviceId || deviceId(),
          ...payload
        }
      }), { retryAuthOnce });
      data = result?.result || result;
    } catch (error) {
      const wrapped = new Error(friendlyErrorMessage(error, "聊天同步服务暂时不可用"));
      wrapped.code = error?.code || error?.errCode || "CHAT_SYNC_CALL_FAILED";
      wrapped.rawError = error;
      throw wrapped;
    }
    if (!data?.ok) {
      if (isSessionExpiredError(data)) markSessionExpired();
      const error = new Error(data?.detail || data?.message || "聊天同步失败");
      error.code = data?.code || "CHAT_SYNC_FAILED";
      error.step = data?.step || action;
      error.rawError = data;
      throw error;
    }
    return data;
  }

  async function saveCloudSnapshotViaFunction(user = session(), explicitData, options = {}) {
    const current = user || session();
    if (!current) return;
    if (isAuthExpired()) throw new Error(FRIENDLY_SESSION_MESSAGE);
    if (restoringFromCloud) {
      debugLog("[SAVE_GUARD_DEBUG]", {
        userId: current.userId,
        dataLoadStatus,
        restoringFromCloud,
        rawDataKeyCount: 0,
        hasLocalXIdentity: false,
        hasCloudXData: "",
        allowSave: false,
        blockedReason: "restoring_from_cloud"
      });
      throw new Error(DATA_NOT_READY_MESSAGE);
    }
    if (!options.allowBeforeRestore && !/auth\.html$/i.test(location.pathname) && dataLoadStatus !== "success") {
      debugLog("[SAVE_GUARD_DEBUG]", {
        userId: current.userId,
        dataLoadStatus,
        restoringFromCloud,
        rawDataKeyCount: 0,
        hasLocalXIdentity: false,
        hasCloudXData: "",
        allowSave: false,
        blockedReason: "data_not_success"
      });
      throw new Error("数据加载失败，请刷新或重新登录");
    }
    const rawData = explicitData || collectUserData(current.userId);
    const cloudPayload = prepareCloudRawData(rawData);
    const cloudRawData = cloudPayload.rawData;
    const nextFingerprint = cloudSnapshotFingerprint(cloudRawData);
    if (!options.force && lastCloudSnapshotFingerprint && nextFingerprint === lastCloudSnapshotFingerprint) {
      syncDiagnostics.savesSkippedNoChange += 1;
      debugLog("[SYNC_GUARD_DEBUG]", {
        action: "skip_unchanged_snapshot",
        userId: current.userId,
        snapshotVersion: cloudSnapshotVersion,
        cloudRawDataKeyCount: Object.keys(cloudRawData).length
      });
      return {
        ok: true,
        skippedCloud: true,
        noChange: true,
        snapshotVersion: cloudSnapshotVersion
      };
    }
    debugLog("[SAVE_GUARD_DEBUG]", {
      userId: current.userId,
      dataLoadStatus,
      restoringFromCloud,
      rawDataKeyCount: Object.keys(rawData || {}).length,
      cloudRawDataKeyCount: Object.keys(cloudRawData || {}).length,
      rawDataApproxBytes: estimateRawDataBytes(rawData),
      cloudRawDataApproxBytes: estimateRawDataBytes(cloudRawData),
      strippedImageKeys: cloudPayload.strippedKeys,
      strippedImageFields: cloudPayload.strippedFields,
      hasLocalXIdentity: Boolean(rawData?.shex_x_link_identity),
      hasCloudXData: "",
      allowSave: true,
      blockedReason: ""
    });
    syncDiagnostics.savesStarted += 1;
    recordSnapshotSyncTrace("save_request", {
      action: "saveSnapshot",
      source: "saveCloudSnapshotViaFunction",
      baseSnapshotVersion: cloudSnapshotVersion,
      cloudRawDataKeyCount: Object.keys(cloudRawData || {}).length,
      cloudRawDataApproxBytes: estimateRawDataBytes(cloudRawData)
    });
    const data = await callAuthFunction("saveSnapshot", {
      userId: current.userId,
      sessionToken: current.sessionToken || "",
      baseSnapshotVersion: cloudSnapshotVersion,
      chatStorageProtocolVersion: CHAT_STORAGE_PROTOCOL_VERSION,
      dreamProfileStorageProtocolVersion: DREAM_PROFILE_STORAGE_PROTOCOL_VERSION,
      rawData: cloudRawData
    });
    recordSnapshotSyncTrace("save_success", {
      action: "saveSnapshot",
      source: "saveCloudSnapshotViaFunction",
      baseSnapshotVersion: cloudSnapshotVersion,
      returnedSnapshotVersion: Math.max(0, Math.floor(Number(data?.snapshotVersion || 0)) || 0)
    });
    const returnedSnapshotVersion = Math.max(0, Math.floor(Number(data?.snapshotVersion || 0)) || 0);
    // X103：版本号只前进不后退，晚到的旧响应不能把本机版本号改回去。
    if (returnedSnapshotVersion > cloudSnapshotVersion) cloudSnapshotVersion = returnedSnapshotVersion;
    lastCloudSnapshotFingerprint = nextFingerprint;
    if (!explicitData) writeSyncBase(current.userId, cloudRawData, {});
    return data;
  }

  // X103：快照 rawData 约 1MB，网关不压缩。浏览器支持 DecompressionStream 时请求 gzip+base64 传输（内容不变）。
  const SNAPSHOT_RAW_DATA_ENCODING = "gzip-base64";
  function snapshotRawDataDecodingSupported() {
    return typeof DecompressionStream === "function" && typeof Response === "function" && typeof Blob === "function" && typeof atob === "function";
  }
  async function decodeSnapshotRawData(data) {
    if (data?.rawDataEncoding !== SNAPSHOT_RAW_DATA_ENCODING || typeof data.rawDataEncoded !== "string") throw new Error("SNAPSHOT_ENCODING_UNSUPPORTED");
    const binary = atob(data.rawDataEncoded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    const parsed = JSON.parse(await new Response(stream).text());
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("SNAPSHOT_DECODE_INVALID");
    return parsed;
  }

  async function loadCloudSnapshotViaFunction(userId, options = {}) {
    const current = session();
    if (!current || isAuthExpired()) throw new Error(FRIENDLY_SESSION_MESSAGE);
    const request = {
      userId,
      sessionToken: current?.sessionToken || "",
      dreamProfileStorageProtocolVersion: DREAM_PROFILE_STORAGE_PROTOCOL_VERSION
    };
    // X103：轻量检查——带上本机已知版本，云端没有更新时不回传整份资料。
    const knownSnapshotVersion = Math.max(0, Math.floor(Number(options?.knownSnapshotVersion || 0)) || 0);
    if (knownSnapshotVersion > 0) request.knownSnapshotVersion = knownSnapshotVersion;
    const canDecode = snapshotRawDataDecodingSupported();
    let data = await callAuthFunction("loadSnapshot", canDecode ? { ...request, acceptRawDataEncoding: SNAPSHOT_RAW_DATA_ENCODING } : request);
    if (data?.notModified === true) return null;
    if (data?.rawDataEncoding) {
      try {
        data = { ...data, rawData: await decodeSnapshotRawData(data) };
      } catch (error) {
        // 解压失败时退回未压缩请求，保证启动不因传输优化而失败。
        console.warn("[SHEX_SNAPSHOT_DECODE_FAILED]", String(error?.message || error).slice(0, 160));
        data = await callAuthFunction("loadSnapshot", request);
      }
    }
    rememberCharacterCapabilities(data, current.userId);
    if (data?.chatIndexedDb && typeof data.chatIndexedDb === "object") {
      latestChatIndexedDbRollout = { ...data.chatIndexedDb };
      latestChatIndexedDbRolloutUserId = String(current.userId || "");
    } else {
      latestChatIndexedDbRollout = null;
      latestChatIndexedDbRolloutUserId = "";
    }
    cloudSnapshotVersion = Math.max(0, Math.floor(Number(data?.snapshotVersion || 0)) || 0);
    dreamProfileStorageIndexRevision = Math.max(0, Math.floor(Number(data?.dreamProfileStorageIndexRevision || 0)) || 0);
    dreamProfileStatuses = new Map((Array.isArray(data?.dreamProfileStatuses) ? data.dreamProfileStatuses : [])
      .map((item) => [String(item?.dreamId || ""), {
        dreamId: String(item?.dreamId || ""),
        status: String(item?.status || "legacy"),
        revision: Math.max(0, Math.floor(Number(item?.revision || 0)) || 0)
      }]).filter(([dreamId]) => dreamId));
    rememberCloudSnapshot(data.rawData || {});
    return data.rawData || {};
  }

  function stripLocalOnlyData(rawData = {}) {
    const next = { ...rawData };
    delete next.xLetterDailyReceives;
    delete next.xLetterLocalHistory;
    LOCAL_ONLY_SYNC_KEYS.forEach((key) => delete next[key]);
    return next;
  }

  const hasDataImage = (value) => typeof value === "string" && /data:image\//i.test(value);
  const isDataImageString = (value) => typeof value === "string" && /^\s*data:image\//i.test(value);

  function estimateRawDataBytes(rawData = {}) {
    try {
      return Object.entries(rawData || {}).reduce((total, [key, value]) => total + String(key || "").length + String(value || "").length, 0);
    } catch (_) {
      return 0;
    }
  }

  function stripDataImagesFromJson(value, stats) {
    if (typeof value === "string") {
      if (hasDataImage(value)) {
        stats.fields += 1;
        return "";
      }
      return value;
    }
    if (Array.isArray(value)) {
      return value.map((item) => stripDataImagesFromJson(item, stats));
    }
    if (value && typeof value === "object") {
      const next = {};
      Object.entries(value).forEach(([key, item]) => {
        if (typeof item === "string" && hasDataImage(item)) {
          stats.fields += 1;
          return;
        }
        next[key] = stripDataImagesFromJson(item, stats);
      });
      return next;
    }
    return value;
  }

  function prepareCloudRawData(rawData = {}) {
    const next = {};
    const strippedKeys = [];
    const stats = { fields: 0 };
    const current = session();
    const marker = current?.userId
      ? safeJson(raw.getItem.call(localStorage, scopedKey("shex_beautify_chat_appearance_hydrated_v1", current.userId)), null)
      : null;
    const stripAllLegacyAdminAppearance = Boolean(isAdminSession(current) && marker?.complete === true && Number(marker?.version || 0) === 1);
    const migratedAppearanceScopes = new Set(
      current?.userId && String(marker?.ownerId || "") === String(current.userId) && Number(marker?.version || 0) === 2
        ? (Array.isArray(marker?.migratedScopes) ? marker.migratedScopes.map((item) => String(item || "")).filter(Boolean) : [])
        : []
    );
    const shouldStripAppearanceScope = (scopeType, scopeId) => stripAllLegacyAdminAppearance
      || migratedAppearanceScopes.has(`${scopeType}:${String(scopeId || "")}`);
    Object.entries(rawData || {}).forEach(([key, value]) => {
      if (LOCAL_IMAGE_DATA_KEYS.has(key)) {
        strippedKeys.push(key);
        return;
      }
      if (key === "shex_x_multi_state_v1") {
        const state = safeJson(value, null);
        if (state && typeof state === "object" && !Array.isArray(state)) {
          const compactSource = { ...state };
          delete compactSource.singleChats;
          delete compactSource.groupChats;
          delete compactSource.chats;
          delete compactSource.chatList;
          delete compactSource.deletedChatMessages;
          if (stripAllLegacyAdminAppearance || migratedAppearanceScopes.size) {
            const appearanceFields = ['chatBubbleColorTa','chatBubbleColorUser','chatBubbleStyleTa','chatBubbleStyleUser','chatBubbleOpacity'];
            if (Array.isArray(compactSource.dreams)) compactSource.dreams = compactSource.dreams.map((item) => {
              const dream = { ...(item || {}) };
              if (shouldStripAppearanceScope("user_dream", dream.id)) appearanceFields.forEach((field) => delete dream[field]);
              return dream;
            });
            if (Array.isArray(compactSource.groups)) compactSource.groups = compactSource.groups.map((item) => {
              const group = { ...(item || {}) };
              if (shouldStripAppearanceScope("user_group", group.id)) appearanceFields.forEach((field) => delete group[field]);
              return group;
            });
          }
          const compactState = stripDataImagesFromJson({
            ...compactSource,
            chatStorageProtocolVersion: CHAT_STORAGE_PROTOCOL_VERSION
          }, stats);
          if (Array.isArray(compactState.dreams) && dreamProfileStatuses.size) {
            const syncCore = globalThis.SHEXCharacterProfileSync;
            compactState.dreams = compactState.dreams.map((source) => {
              const dreamId = String(source?.id || "");
              if (dreamProfileStatuses.get(dreamId)?.status !== "cutover") return source;
              const dream = { ...source };
              ["personaProfile", "relationshipProfile", "userRelationProfile", "datingUserProfile", "datingRelationship"]
                .flatMap((group) => syncCore?.GROUP_FIELDS?.[group] || [])
                .forEach((field) => delete dream[field]);
              const groups = { ...(dream.profileSyncMeta?.groups || {}) };
              ["personaProfile", "relationshipProfile", "userRelationProfile", "datingUserProfile", "datingRelationship"]
                .forEach((group) => delete groups[group]);
              dream.profileSyncMeta = { ...(dream.profileSyncMeta || {}), groups };
              if (Array.isArray(dream.profileSyncConflicts)) {
                dream.profileSyncConflicts = dream.profileSyncConflicts.filter((item) => ![
                  "personaProfile", "relationshipProfile", "userRelationProfile", "datingUserProfile", "datingRelationship"
                ].includes(item?.group));
                if (!dream.profileSyncConflicts.length) delete dream.profileSyncConflicts;
              }
              return dream;
            });
          }
          next[key] = JSON.stringify(compactState);
          return;
        }
      }
      if ((stripAllLegacyAdminAppearance || migratedAppearanceScopes.size) && key === "shex_x_message_backgrounds_v1") {
        if (stripAllLegacyAdminAppearance) {
          strippedKeys.push(key);
          return;
        }
        const backgrounds = safeJson(value, null);
        if (backgrounds && typeof backgrounds === "object" && !Array.isArray(backgrounds)) {
          const retained = { ...backgrounds };
          migratedAppearanceScopes.forEach((scopeKey) => {
            const separator = scopeKey.indexOf(":");
            const scopeType = separator > 0 ? scopeKey.slice(0, separator) : "";
            const scopeId = separator > 0 ? scopeKey.slice(separator + 1) : "";
            if (scopeType === "user_dream") delete retained[`single:${scopeId}`];
            if (scopeType === "user_group") delete retained[`group:${scopeId}`];
          });
          next[key] = JSON.stringify(retained);
          return;
        }
      }
      if (MIXED_IMAGE_DATA_KEYS.has(key) || hasDataImage(value)) {
        const parsed = safeJson(value, null);
        if (parsed && typeof parsed === "object") {
          next[key] = JSON.stringify(stripDataImagesFromJson(parsed, stats));
          return;
        }
        if (hasDataImage(value)) {
          strippedKeys.push(key);
          return;
        }
      }
      next[key] = value;
    });
    return {
      rawData: next,
      strippedKeys,
      strippedFields: stats.fields
    };
  }

  function cloudSnapshotFingerprint(rawData = {}) {
    return JSON.stringify(Object.keys(rawData || {}).sort().map((key) => [key, rawData[key]]));
  }

  function rememberCloudSnapshot(rawData = {}) {
    const prepared = prepareCloudRawData(rawData);
    lastCloudSnapshotFingerprint = cloudSnapshotFingerprint(prepared.rawData);
    return lastCloudSnapshotFingerprint;
  }

  function messageTimestamp(message) {
    if (!message || typeof message !== "object") return 0;
    const value = message.time || message.createdAt || message.updatedAt || message.timestamp || 0;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
  }

  function messageVersionTimestamp(message) {
    return Math.max(messageTimestamp(message), Number(message?.updatedAt || 0) || 0);
  }

  function latestMessageTimestamp(messages) {
    if (!Array.isArray(messages)) return 0;
    return messages.reduce((latest, message) => Math.max(latest, messageTimestamp(message)), 0);
  }

  function normalizeChatCleanupWatermarks(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.entries(value).reduce((result, [chatId, timestamp]) => {
      const numeric = Math.floor(Number(timestamp || 0));
      if (chatId && Number.isFinite(numeric) && numeric > 0) result[chatId] = numeric;
      return result;
    }, {});
  }

  function filterChatMessagesByWatermark(messages, watermark) {
    const cutoff = Math.floor(Number(watermark || 0));
    if (!Array.isArray(messages)) return [];
    if (!Number.isFinite(cutoff) || cutoff <= 0) return messages.slice();
    return messages.filter((message) => messageTimestamp(message) >= cutoff);
  }

  function chatMessageIdentity(message = {}) {
    if (message.id !== undefined && message.id !== null && String(message.id).trim()) return `id:${String(message.id)}`;
    return `legacy:${JSON.stringify([
      message.role || "",
      message.type || "",
      message.kind || "",
      message.time || message.createdAt || message.timestamp || 0,
      message.text || message.notice || "",
      message.image || message.media || message.sticker || message.stickerId || ""
    ])}`;
  }

  function mergeDeletedChatMessages(currentValue, incomingValue) {
    const current = currentValue && typeof currentValue === "object" ? currentValue : {};
    const incoming = incomingValue && typeof incomingValue === "object" ? incomingValue : {};
    const merged = {};
    new Set([...Object.keys(current), ...Object.keys(incoming)]).forEach((conversationKey) => {
      const localItems = current[conversationKey] && typeof current[conversationKey] === "object" ? current[conversationKey] : {};
      const cloudItems = incoming[conversationKey] && typeof incoming[conversationKey] === "object" ? incoming[conversationKey] : {};
      const items = {};
      new Set([...Object.keys(localItems), ...Object.keys(cloudItems)]).forEach((messageId) => {
        const local = localItems[messageId];
        const cloud = cloudItems[messageId];
        const localAt = Number(local?.deletedAt || local || 0);
        const cloudAt = Number(cloud?.deletedAt || cloud || 0);
        const selected = localAt >= cloudAt ? local : cloud;
        const deletedAt = Math.max(localAt || 0, cloudAt || 0);
        if (deletedAt > 0) items[messageId] = selected && typeof selected === "object" ? { ...selected, deletedAt } : { deletedAt };
      });
      if (Object.keys(items).length) merged[conversationKey] = items;
    });
    return merged;
  }

  function mergeChatMapByFreshness(currentMap = {}, incomingMap = {}, currentWatermarks = {}, incomingWatermarks = {}, deletedChatMessages = {}, kind = "single") {
    const current = currentMap && typeof currentMap === "object" ? currentMap : {};
    const incoming = incomingMap && typeof incomingMap === "object" ? incomingMap : {};
    const localCleanupWatermarks = normalizeChatCleanupWatermarks(currentWatermarks);
    const cloudCleanupWatermarks = normalizeChatCleanupWatermarks(incomingWatermarks);
    const merged = {};
    const watermarks = {};
    Array.from(new Set([
      ...Object.keys(current),
      ...Object.keys(incoming),
      ...Object.keys(localCleanupWatermarks),
      ...Object.keys(cloudCleanupWatermarks)
    ])).forEach((chatId) => {
      const watermark = Math.max(
        Number(localCleanupWatermarks[chatId] || 0),
        Number(cloudCleanupWatermarks[chatId] || 0)
      );
    if (watermark > 0) watermarks[chatId] = watermark;
    const localMessages = filterChatMessagesByWatermark(current[chatId], watermark);
    const cloudMessages = filterChatMessagesByWatermark(incoming[chatId], watermark);
      const deleted = deletedChatMessages?.[`${kind}:${chatId}`] || {};
      const byId = new Map();
      const add = (message, preferOnTie) => {
        if (!message || typeof message !== "object") return;
        const messageId = message.id === undefined || message.id === null ? "" : String(message.id);
        if (messageId && deleted[messageId]) return;
        const identity = chatMessageIdentity(message);
        const previous = byId.get(identity);
        if (!previous || messageVersionTimestamp(message) > messageVersionTimestamp(previous) || (
          preferOnTie && messageVersionTimestamp(message) === messageVersionTimestamp(previous)
        )) byId.set(identity, message);
      };
      cloudMessages.forEach((message) => add(message, false));
      localMessages.forEach((message) => add(message, true));
      merged[chatId] = Array.from(byId.values()).sort((a, b) => {
        const difference = messageTimestamp(a) - messageTimestamp(b);
        return difference || chatMessageIdentity(a).localeCompare(chatMessageIdentity(b));
      });
    });
    return { chats: merged, watermarks };
  }

  function mergeLettersByFreshness(currentLetters, incomingLetters) {
    const current = (currentLetters && typeof currentLetters === "object") ? currentLetters : {};
    const incoming = (incomingLetters && typeof incomingLetters === "object") ? incomingLetters : {};
    const merged = {};
    const allDreamIds = new Set([...Object.keys(current), ...Object.keys(incoming)]);
    allDreamIds.forEach((dreamId) => {
      const currentEntry = current[dreamId] || {};
      const incomingEntry = incoming[dreamId] || {};
      const currentHistory = Array.isArray(currentEntry.history) ? currentEntry.history : [];
      const incomingHistory = Array.isArray(incomingEntry.history) ? incomingEntry.history : [];
      const historyById = new Map();
      [...incomingHistory, ...currentHistory].forEach((item) => {
        if (!item || !item.id) return;
        if (!historyById.has(item.id)) historyById.set(item.id, item);
      });
      const mergedHistory = Array.from(historyById.values())
        .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
        .slice(0, 200); // X103：与 script.js 旧信上限一致
      const currentTodayAt = Number(currentEntry.todayAt || 0);
      const incomingTodayAt = Number(incomingEntry.todayAt || 0);
      merged[dreamId] = {
        ...incomingEntry,
        ...(currentTodayAt >= incomingTodayAt ? {
          today: currentEntry.today,
          date: currentEntry.date,
          todayAt: currentEntry.todayAt
        } : {}),
        history: mergedHistory
      };
    });
    return merged;
  }

  function mergeRepliesByFreshness(current, incoming) {
    const currentReplies = (current?.replies && typeof current.replies === "object") ? current.replies : {};
    const incomingReplies = (incoming?.replies && typeof incoming.replies === "object") ? incoming.replies : {};
    const currentDeleted = (current?.deletedReplies && typeof current.deletedReplies === "object") ? current.deletedReplies : {};
    const incomingDeleted = (incoming?.deletedReplies && typeof incoming.deletedReplies === "object") ? incoming.deletedReplies : {};

    const mergedDeleted = {};
    new Set([...Object.keys(currentDeleted), ...Object.keys(incomingDeleted)]).forEach((replyId) => {
      const a = currentDeleted[replyId];
      const b = incomingDeleted[replyId];
      if (a && b) mergedDeleted[replyId] = (a.deletedAt || 0) >= (b.deletedAt || 0) ? a : b;
      else mergedDeleted[replyId] = a || b;
    });

    const mergedReplies = {};
    const allDreamIds = new Set([...Object.keys(currentReplies), ...Object.keys(incomingReplies)]);
    allDreamIds.forEach((dreamId) => {
      const currentList = Array.isArray(currentReplies[dreamId]) ? currentReplies[dreamId] : [];
      const incomingList = Array.isArray(incomingReplies[dreamId]) ? incomingReplies[dreamId] : [];
      const byId = new Map();
      [...incomingList, ...currentList].forEach((item) => {
        if (!item || !item.id) return;
        if (mergedDeleted[item.id]) return;
        if (!byId.has(item.id)) byId.set(item.id, item);
      });
      mergedReplies[dreamId] = Array.from(byId.values())
        .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
        .slice(0, 200); // X103：与 script.js 回信上限一致
    });

    return { replies: mergedReplies, deletedReplies: mergedDeleted };
  }

  function selectFreshCurrentDream(current = {}, incoming = {}, dreams = []) {
    const available = new Set((Array.isArray(dreams) ? dreams : []).map((dream) => String(dream?.id || '')).filter(Boolean));
    const localId = String(current?.currentDreamId || '');
    const cloudId = String(incoming?.currentDreamId || '');
    const localAt = Number(current?.currentDreamChangedAt || 0) || 0;
    const cloudAt = Number(incoming?.currentDreamChangedAt || 0) || 0;
    if (localAt > cloudAt && available.has(localId)) return { currentDreamId: localId, currentDreamChangedAt: localAt };
    if (available.has(cloudId)) return { currentDreamId: cloudId, currentDreamChangedAt: cloudAt };
    if (available.has(localId)) return { currentDreamId: localId, currentDreamChangedAt: localAt };
    return { currentDreamId: String((Array.isArray(dreams) ? dreams[0]?.id : '') || ''), currentDreamChangedAt: Math.max(localAt, cloudAt) };
  }

  function mergeXMultiStateByFreshness(current, incoming) {
    const next = { ...incoming };
    next.letters = mergeLettersByFreshness(current?.letters, incoming?.letters);
    const repliesResult = mergeRepliesByFreshness(current, incoming);
    next.replies = repliesResult.replies;
    next.deletedReplies = repliesResult.deletedReplies;
    next.deletedChatMessages = mergeDeletedChatMessages(current?.deletedChatMessages, incoming?.deletedChatMessages);
    const singleChatsResult = mergeChatMapByFreshness(
      current?.singleChats,
      incoming?.singleChats,
      current?.singleChatCleanupWatermarks,
      incoming?.singleChatCleanupWatermarks,
      next.deletedChatMessages,
      "single"
    );
    next.singleChats = singleChatsResult.chats;
    next.singleChatCleanupWatermarks = singleChatsResult.watermarks;
    const groupChatsResult = mergeChatMapByFreshness(
      current?.groupChats,
      incoming?.groupChats,
      current?.groupChatCleanupWatermarks,
      incoming?.groupChatCleanupWatermarks,
      next.deletedChatMessages,
      "group"
    );
    next.groupChats = groupChatsResult.chats;
    next.groupChatCleanupWatermarks = groupChatsResult.watermarks;

    // 合并删除墓碑：取本地和云端各自记录里，每个梦角ID对应的最新一条墓碑
    const currentTombstones = (current?.deletedDreams && typeof current.deletedDreams === 'object') ? current.deletedDreams : {};
    const incomingTombstones = (incoming?.deletedDreams && typeof incoming.deletedDreams === 'object') ? incoming.deletedDreams : {};
    const mergedTombstones = {};
    new Set([...Object.keys(currentTombstones), ...Object.keys(incomingTombstones)]).forEach((dreamId) => {
      const a = currentTombstones[dreamId];
      const b = incomingTombstones[dreamId];
      if (a && b) mergedTombstones[dreamId] = (a.deletedAt || 0) >= (b.deletedAt || 0) ? a : b;
      else mergedTombstones[dreamId] = a || b;
    });
    next.deletedDreams = mergedTombstones;

    // 用墓碑过滤梦角列表：只要这个梦角ID有墓碑记录，就不出现在最终结果里
    // （初版规则：只要有墓碑就删除，不比较梦角自身的updatedAt，因为梦角对象当前没有updatedAt字段）
    const mergedDreamsRaw = Array.isArray(next.dreams) ? next.dreams : [];
    next.dreams = mergedDreamsRaw.filter((dream) => !mergedTombstones[dream?.id]);
    // X103：本机有、云端没有、且没有删除墓碑的梦角 = 本机尚未同步成功的新梦角，必须保留，
    // 不能因为云端旧列表里没有它就丢掉（双设备各自新建梦角时两边都要留下）。
    const incomingDreamIds = new Set(next.dreams.map((dream) => String(dream?.id || "")));
    const localOnlyDreams = (Array.isArray(current?.dreams) ? current.dreams : [])
      .filter((dream) => dream?.id && !incomingDreamIds.has(String(dream.id)) && !mergedTombstones[dream.id]);
    if (localOnlyDreams.length) {
      next.dreams = next.dreams.concat(localOnlyDreams);
      const localCompanions = (current?.companions && typeof current.companions === 'object') ? current.companions : {};
      const keptCompanions = (next.companions && typeof next.companions === 'object') ? { ...next.companions } : {};
      localOnlyDreams.forEach((dream) => {
        if (localCompanions[dream.id] && !keptCompanions[dream.id]) keptCompanions[dream.id] = localCompanions[dream.id];
      });
      next.companions = keptCompanions;
    }
    const currentDreamSelection = selectFreshCurrentDream(current, incoming, next.dreams);
    next.currentDreamId = currentDreamSelection.currentDreamId;
    next.currentDreamChangedAt = currentDreamSelection.currentDreamChangedAt;

    // 同时清理已删除梦角残留的聊天/回信/字卡引用，避免云端旧数据把这些内容带回来
    Object.keys(mergedTombstones).forEach((dreamId) => {
      if (next.singleChats && typeof next.singleChats === 'object') delete next.singleChats[dreamId];
      if (next.letters && typeof next.letters === 'object') delete next.letters[dreamId];
      if (next.replies && typeof next.replies === 'object') delete next.replies[dreamId];
      if (next.companions && typeof next.companions === 'object') delete next.companions[dreamId];
    });

    const currentGroupTombstones = (current?.deletedGroups && typeof current.deletedGroups === 'object') ? current.deletedGroups : {};
    const incomingGroupTombstones = (incoming?.deletedGroups && typeof incoming.deletedGroups === 'object') ? incoming.deletedGroups : {};
    const mergedGroupTombstones = {};
    new Set([...Object.keys(currentGroupTombstones), ...Object.keys(incomingGroupTombstones)]).forEach((groupId) => {
      const a = currentGroupTombstones[groupId];
      const b = incomingGroupTombstones[groupId];
      if (a && b) mergedGroupTombstones[groupId] = (a.deletedAt || 0) >= (b.deletedAt || 0) ? a : b;
      else mergedGroupTombstones[groupId] = a || b;
    });
    next.deletedGroups = mergedGroupTombstones;

    const mergedGroupsRaw = Array.isArray(next.groups) ? next.groups : [];
    next.groups = mergedGroupsRaw.filter((group) => !mergedGroupTombstones[group?.id]);
    // X103：同上，本机尚未同步的新群聊不能被云端旧列表丢掉。
    const incomingGroupIds = new Set(next.groups.map((group) => String(group?.id || "")));
    const localOnlyGroups = (Array.isArray(current?.groups) ? current.groups : [])
      .filter((group) => group?.id && !incomingGroupIds.has(String(group.id)) && !mergedGroupTombstones[group.id]);
    if (localOnlyGroups.length) next.groups = next.groups.concat(localOnlyGroups);

    Object.keys(mergedGroupTombstones).forEach((groupId) => {
      if (next.groupChats && typeof next.groupChats === 'object') delete next.groupChats[groupId];
    });

    // 用户头像：比较更新时间，谁新用谁
    const currentAvatarAt = Number(current?.userAvatarUpdatedAt || 0);
    const incomingAvatarAt = Number(incoming?.userAvatarUpdatedAt || 0);
    if (currentAvatarAt > incomingAvatarAt) {
      next.userAvatar = current.userAvatar;
      next.userAvatarUpdatedAt = currentAvatarAt;
    }

    // 梦角头像：逐个比较更新时间，谁新用谁
    if (Array.isArray(next.dreams) && Array.isArray(current?.dreams)) {
      const currentDreamsById = {};
      current.dreams.forEach((d) => { if (d?.id) currentDreamsById[d.id] = d; });
      next.dreams = next.dreams.map((dream) => {
        const localDream = currentDreamsById[dream?.id];
        if (!localDream) return dream;
        const localAt = Number(localDream.avatarUpdatedAt || 0);
        const incomingAt = Number(dream.avatarUpdatedAt || 0);
        if (localAt > incomingAt) {
          return { ...dream, avatar: localDream.avatar, avatarUpdatedAt: localAt };
        }
        return dream;
      });
    }

    // 每个单聊的“我的头像”：独立时间戳，空值也代表一次有效的恢复默认操作
    if (Array.isArray(next.dreams) && Array.isArray(current?.dreams)) {
      const currentDreamsById = {};
      current.dreams.forEach((d) => { if (d?.id) currentDreamsById[d.id] = d; });
      next.dreams = next.dreams.map((dream) => {
        const localDream = currentDreamsById[dream?.id];
        if (!localDream) return dream;
        const localAt = Number(localDream.chatUserAvatarUpdatedAt || 0);
        const incomingAt = Number(dream.chatUserAvatarUpdatedAt || 0);
        if (localAt > incomingAt) {
          return { ...dream, chatUserAvatar: localDream.chatUserAvatar || '', chatUserAvatarUpdatedAt: localAt };
        }
        return dream;
      });
    }

    // 梦角整体字段（name/nickname/userNickname/userCall等）按updatedAt比较，谁新用谁
    if (Array.isArray(next.dreams) && Array.isArray(current?.dreams)) {
      const currentDreamsById2 = {};
      current.dreams.forEach((d) => { if (d?.id) currentDreamsById2[d.id] = d; });
      next.dreams = next.dreams.map((dream) => {
        const localDream = currentDreamsById2[dream?.id];
        if (!localDream) return dream;
        const localAt = Number(localDream.updatedAt || 0);
        const incomingAt = Number(dream.updatedAt || 0);
        let baseDream = dream;
        if (localAt > incomingAt) {
          // 本地更新，保留本地的非头像字段，但头像相关字段已经在前面单独按avatarUpdatedAt处理过，这里不要覆盖那部分结果
          baseDream = {
            ...localDream,
            avatar: dream.avatar,
            avatarUpdatedAt: dream.avatarUpdatedAt,
            chatUserAvatar: dream.chatUserAvatar || '',
            chatUserAvatarUpdatedAt: Number(dream.chatUserAvatarUpdatedAt || 0)
          };
        }
        const profileSync = typeof globalThis !== 'undefined' ? globalThis.SHEXCharacterProfileSync : null;
        const profileResult = profileSync?.mergeDreamProfileGroups?.(localDream, dream, { baseDream });
        return profileResult?.dream || baseDream;
      });
    }

    // 每个群聊的“我的头像”：独立时间戳，避免其他群资料更新覆盖头像清空操作
    if (Array.isArray(next.groups) && Array.isArray(current?.groups)) {
      const currentGroupsById = {};
      current.groups.forEach((g) => { if (g?.id) currentGroupsById[g.id] = g; });
      next.groups = next.groups.map((group) => {
        const localGroup = currentGroupsById[group?.id];
        if (!localGroup) return group;
        const localAt = Number(localGroup.chatUserAvatarUpdatedAt || 0);
        const incomingAt = Number(group.chatUserAvatarUpdatedAt || 0);
        if (localAt > incomingAt) {
          return { ...group, chatUserAvatar: localGroup.chatUserAvatar || '', chatUserAvatarUpdatedAt: localAt };
        }
        return group;
      });
    }

    // 群聊整体字段（name/avatar/memberIds等）按updatedAt比较，谁新用谁
    if (Array.isArray(next.groups) && Array.isArray(current?.groups)) {
      const currentGroupsById = {};
      current.groups.forEach((g) => { if (g?.id) currentGroupsById[g.id] = g; });
      next.groups = next.groups.map((group) => {
        const localGroup = currentGroupsById[group?.id];
        if (!localGroup) return group;
        const localAt = Number(localGroup.updatedAt || 0);
        const incomingAt = Number(group.updatedAt || 0);
        if (localAt > incomingAt) {
          return {
            ...localGroup,
            chatUserAvatar: group.chatUserAvatar || '',
            chatUserAvatarUpdatedAt: Number(group.chatUserAvatarUpdatedAt || 0)
          };
        }
        return group;
      });
    }

    // companions（X陪伴设置）合并：只保护设置类字段，不碰播放状态字段
    if (next.companions && typeof next.companions === 'object') {
      const currentCompanions = (current?.companions && typeof current.companions === 'object') ? current.companions : {};
      const nextCompanions = { ...next.companions };
      Object.keys(nextCompanions).forEach((dreamId) => {
        const localPatch = currentCompanions[dreamId];
        const incomingPatch = nextCompanions[dreamId];
        if (!localPatch || typeof localPatch !== 'object' || !incomingPatch || typeof incomingPatch !== 'object') return;
        const merged = { ...incomingPatch };
        // background：本地是有效值（cloud://或base64）时，不应该被云端空值/无效值覆盖；
        // 云端传来不同的、同样有效的新值时，允许覆盖（保持可更新能力）
        const localBg = localPatch.background;
        const incomingBg = incomingPatch.background;
        const isValidBg = (value) => {
          if (typeof value === 'string') return /^cloud:\/\//i.test(value) || /^data:image\//i.test(value);
          if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
          const source = String(value.fileID || value.fileId || value.url || value.src || '').trim();
          return /^cloud:\/\//i.test(source) || /^(?:data:image\/|blob:|https?:\/\/)/i.test(source);
        };
        if (isValidBg(localBg) && (!isValidBg(incomingBg) || incomingBg === localBg)) {
          merged.background = localBg;
        }
        // 一起听累计时长只允许向前增长，避免旧设备/旧云快照覆盖更大的累计值。
        merged.listenTotalSeconds = Math.max(
          0,
          Number(localPatch.listenTotalSeconds || 0),
          Number(incomingPatch.listenTotalSeconds || 0)
        );
        // 其他设置类字段：本地有值、云端为空/缺失时，保留本地值
        ['musicFileId', 'musicSrc', 'musicName', 'goal', 'untimed', 'minutes', 'listenCover', 'listenCoverView', 'lastMode', 'playMode'].forEach((field) => {
          const localVal = localPatch[field];
          const incomingVal = incomingPatch[field];
          const localHasValue = localVal !== undefined && localVal !== null && localVal !== '';
          const incomingHasValue = incomingVal !== undefined && incomingVal !== null && incomingVal !== '';
          if (localHasValue && !incomingHasValue) {
            merged[field] = localVal;
          }
        });
        nextCompanions[dreamId] = merged;
      });
      next.companions = nextCompanions;
    }

    return next;
  }

  function mergeLocalDataImages(current, incoming) {
    if (isDataImageString(current)) {
      // 如果云端传来的是 cloud:// 地址，优先用云端的
      // 不要让本地旧 base64 覆盖云端新地址
      if (typeof incoming === 'string'
        && /^cloud:\/\//i.test(incoming)) {
        return incoming;
      }
      return current;
    }
    if (typeof current === 'string' && /^cloud:\/\//i.test(current)) {
      // 本地已经是有效的云端链接：只有云端传来一个不同的、同样有效的cloud://链接时才覆盖，
      // 云端是空值/非cloud格式（比如旧快照还没同步上这次更新）时，保留本地这份
      if (typeof incoming === 'string' && /^cloud:\/\//i.test(incoming) && incoming !== current) {
        return incoming;
      }
      return current;
    }
    if (Array.isArray(current) && Array.isArray(incoming)) {
      // 如果数组元素是带有id字段的对象（比如表情包 {id, name, src}），按id匹配合并，
      // 避免数组顺序变化（删除、裁剪、排序）导致张冠李戴
      const hasIdField = incoming.length > 0 && incoming.every((item) => item && typeof item === 'object' && !Array.isArray(item) && 'id' in item);
      if (hasIdField) {
        const currentById = {};
        (Array.isArray(current) ? current : []).forEach((item) => {
          if (item && typeof item === 'object' && item.id !== undefined) {
            currentById[String(item.id)] = item;
          }
        });
        return incoming.map((item) => {
          const localMatch = currentById[String(item?.id)];
          if (!localMatch) return item;
          return mergeLocalDataImages(localMatch, item);
        });
      }
      // 没有id字段的普通数组，退回按位置合并
      return incoming.map((item, index) => mergeLocalDataImages(current[index], item));
    }
    if (current && typeof current === "object" && incoming && typeof incoming === "object" && !Array.isArray(current) && !Array.isArray(incoming)) {
      const next = { ...incoming };
      Object.keys(current).forEach((key) => {
        if (isDataImageString(current[key])) {
          // 如果云端传来的是 cloud:// 地址，优先用云端的
          // 不要让本地旧 base64 覆盖云端新地址
          const incomingVal = incoming[key];
          if (typeof incomingVal === 'string'
            && /^cloud:\/\//i.test(incomingVal)) {
            next[key] = incomingVal;
          } else {
            next[key] = current[key];
          }
        } else if (typeof current[key] === 'string' && /^cloud:\/\//i.test(current[key])) {
          const incomingVal = incoming[key];
          // 本地已经是有效的云端链接：只有云端传来一个不同的、同样有效的cloud://链接时才覆盖，
          // 云端是空值/非cloud格式（比如旧快照还没同步上这次更新）时，保留本地这份
          if (typeof incomingVal === 'string' && /^cloud:\/\//i.test(incomingVal) && incomingVal !== current[key]) {
            next[key] = incomingVal;
          } else {
            next[key] = current[key];
          }
        } else if (current[key] && typeof current[key] === "object" && incoming[key] && typeof incoming[key] === "object") {
          next[key] = mergeLocalDataImages(current[key], incoming[key]);
        }
      });
      return next;
    }
    return incoming;
  }

  function mergeStickerLibraries(current, incoming, tombstones = {}) {
    const byId = new Map();
    const append = (item, source = 'local') => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return;
      const id = String(item.id || '').trim();
      if (!id || tombstones[id]) return;
      const existing = byId.get(id);
      if (!existing) {
        byId.set(id, { ...item, scope: item.scope === 'dream' ? 'dream' : 'user' });
        return;
      }
      const mergedImages = mergeLocalDataImages(existing, item);
      byId.set(id, {
        ...existing,
        ...mergedImages,
        scope: source === 'incoming'
          ? (item.scope === 'dream' ? 'dream' : 'user')
          : (existing.scope === 'dream' ? 'dream' : 'user')
      });
    };
    (Array.isArray(current) ? current : []).forEach((item) => append(item, 'local'));
    (Array.isArray(incoming) ? incoming : []).forEach((item) => append(item, 'incoming'));
    return Array.from(byId.values()).sort((left, right) => {
      const leftAt = Number(left?.createdAt || left?.savedAt || 0);
      const rightAt = Number(right?.createdAt || right?.savedAt || 0);
      return leftAt - rightAt || String(left?.id || '').localeCompare(String(right?.id || ''));
    });
  }


  // ===== X103 多设备同步：同步基线与三方合并 =====
  // 基线 = 本机最后一次确认与云端一致时，各资料键的指纹（小体积的值同时保留内容）。
  // 作用：云端资料到达时，能分清“只有云端改了 / 只有本机改了 / 两边都改了”，
  // 本机尚未同步成功的改动不会再被云端旧版本直接覆盖。基线只存本机，不上传，退出登录也保留。
  const SYNC_BASE_KEY_PREFIX = "shex_sync_base_v1:";
  const SYNC_BASE_VALUE_MAX_CHARS = 4000;
  const SYNC_BASE_VALUES_BUDGET_CHARS = 200000;
  let activeApplySyncBase = null;

  function syncBaseHash(value) {
    const text = String(value);
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return `${text.length}:${(hash >>> 0).toString(36)}`;
  }

  function readSyncBase(userId) {
    if (!userId) return null;
    try {
      const parsed = JSON.parse(raw.getItem.call(localStorage, `${SYNC_BASE_KEY_PREFIX}${userId}`) || "null");
      if (!parsed || parsed.v !== 1 || !parsed.hashes || typeof parsed.hashes !== "object") return null;
      if (!parsed.values || typeof parsed.values !== "object") parsed.values = {};
      return parsed;
    } catch (_) {
      return null;
    }
  }

  function writeSyncBase(userId, preparedRawData = {}, carryHashes = {}) {
    if (!userId) return;
    const hashes = { ...carryHashes };
    const values = {};
    let budget = SYNC_BASE_VALUES_BUDGET_CHARS;
    Object.keys(preparedRawData || {}).forEach((key) => {
      const value = preparedRawData[key];
      if (typeof value !== "string") return;
      hashes[key] = syncBaseHash(value);
      if (MIXED_IMAGE_DATA_KEYS.has(key) || LOCAL_IMAGE_DATA_KEYS.has(key)) return;
      if (value.length <= SYNC_BASE_VALUE_MAX_CHARS && value.length <= budget) {
        values[key] = value;
        budget -= value.length;
      }
    });
    const target = `${SYNC_BASE_KEY_PREFIX}${userId}`;
    try {
      raw.setItem.call(localStorage, target, JSON.stringify({ v: 1, at: Date.now(), hashes, values }));
    } catch (_) {
      try {
        raw.setItem.call(localStorage, target, JSON.stringify({ v: 1, at: Date.now(), hashes, values: {} }));
      } catch (__) {
        try { raw.removeItem.call(localStorage, target); } catch (___) {}
      }
    }
  }

  function preparedSyncValue(key, value) {
    if (typeof value !== "string") return null;
    const prepared = prepareCloudRawData({ [key]: value }).rawData;
    return typeof prepared[key] === "string" ? prepared[key] : null;
  }

  function syncStableJson(value) {
    if (value === null || typeof value !== "object") return JSON.stringify(value === undefined ? null : value);
    if (Array.isArray(value)) return `[${value.map(syncStableJson).join(",")}]`;
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${syncStableJson(value[key])}`).join(",")}}`;
  }

  function syncJsonEqual(left, right) {
    return left === right || syncStableJson(left) === syncStableJson(right);
  }

  function isSyncPlainObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  // 列表三方合并：两边新增的都保留；一边明确删除（基线里有、这边没有）的不复活。
  function mergeSyncArrays(base, local, cloud, prefer = "local") {
    const idOf = (item) => (isSyncPlainObject(item) && item.id !== undefined && item.id !== null && item.id !== "")
      ? `id:${item.id}` : `v:${syncStableJson(item)}`;
    const baseById = new Map();
    (Array.isArray(base) ? base : []).forEach((item) => baseById.set(idOf(item), item));
    const hasBase = Array.isArray(base);
    const localById = new Map();
    local.forEach((item) => { if (!localById.has(idOf(item))) localById.set(idOf(item), item); });
    const cloudIds = new Set(cloud.map(idOf));
    const merged = [];
    cloud.forEach((item) => {
      const id = idOf(item);
      if (!localById.has(id)) {
        if (hasBase && baseById.has(id)) return;
        merged.push(item);
        return;
      }
      merged.push(id.startsWith("id:") ? mergeSyncValues(baseById.get(id), localById.get(id), item, prefer) : item);
    });
    const localOnly = local.filter((item) => {
      const id = idOf(item);
      return !cloudIds.has(id) && !(hasBase && baseById.has(id));
    });
    if (!localOnly.length) return merged;
    const localAddsAtFront = local.length > 0 && localOnly.includes(local[0]);
    return localAddsAtFront ? localOnly.concat(merged) : merged.concat(localOnly);
  }

  // 三方合并：互不冲突的改动两边都保留；同一字段两边都改 = 真冲突，保留本机尚未同步的值。
  function mergeSyncValues(base, local, cloud, prefer = "local") {
    if (syncJsonEqual(local, cloud)) return cloud;
    if (base !== undefined) {
      if (syncJsonEqual(local, base)) return cloud;
      if (syncJsonEqual(cloud, base)) return local;
    }
    if (Array.isArray(local) && Array.isArray(cloud)) {
      return mergeSyncArrays(Array.isArray(base) ? base : null, local, cloud, prefer);
    }
    if (isSyncPlainObject(local) && isSyncPlainObject(cloud)) {
      const baseObject = isSyncPlainObject(base) ? base : null;
      const merged = {};
      const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
      Array.from(new Set([...Object.keys(cloud), ...Object.keys(local)])).forEach((key) => {
        const inLocal = has(local, key);
        const inCloud = has(cloud, key);
        const baseHas = Boolean(baseObject) && has(baseObject, key);
        if (inLocal && inCloud) {
          merged[key] = mergeSyncValues(baseHas ? baseObject[key] : undefined, local[key], cloud[key], prefer);
        } else if (inLocal) {
          if (baseHas && syncJsonEqual(local[key], baseObject[key])) return;
          merged[key] = local[key];
        } else {
          if (baseHas && syncJsonEqual(cloud[key], baseObject[key])) return;
          merged[key] = cloud[key];
        }
      });
      return merged;
    }
    return prefer === "cloud" ? cloud : local;
  }

  function mergeConflictingSyncStrings(baseValue, localValue, cloudValue, prefer = "local") {
    // 只把毫秒时间戳（12 位以上纯数字）当作时间戳；"0"/"1" 这类开关值不是时间戳，不能取较大值。
    const numeric = (value) => /^\d{12,16}$/.test(String(value).trim());
    // 时间戳类的键（更新时间、清空时间）取较新的一个。
    if (numeric(localValue) && numeric(cloudValue)) {
      return Number(localValue) >= Number(cloudValue) ? localValue : cloudValue;
    }
    const missing = {};
    const local = safeJson(localValue, missing);
    const cloud = safeJson(cloudValue, missing);
    if (local === missing || cloud === missing || local === null || cloud === null
      || typeof local !== "object" || typeof cloud !== "object" || Array.isArray(local) !== Array.isArray(cloud)) {
      return prefer === "cloud" ? cloudValue : localValue;
    }
    const base = typeof baseValue === "string" ? safeJson(baseValue, undefined) : undefined;
    return JSON.stringify(mergeSyncValues(base === null ? undefined : base, local, cloud, prefer));
  }

  // X103：还没有同步基线时的第一次合并（老用户升级后的第一次同步）。
  // 没有历史可比，所以按“两边有效内容都保留”处理：列表、ID 型列表、Map 型资料取并集；
  // 只有真正的单值字段（两边各一个值、无法判断新旧）沿用原有规则以云端为准，时间戳取较新。
  // 全程自动处理，不向用户提问。
  // X小宠：宠物进度和领养名单必须整份取较新的一边，不能逐字段拼（否则等级、经验会来自不同设备）。
  function isPetSyncKey(key) { return PET_SYNC_PREFIXES.some((prefix) => String(key).startsWith(prefix)); }
  function mergePetSyncValue(key, localValue, cloudValue) {
    const local = safeJson(localValue, null), cloud = safeJson(cloudValue, null);
    if (!local || typeof local !== "object") return cloudValue;
    if (!cloud || typeof cloud !== "object") return localValue;
    if (String(key).startsWith("shex_pet_roster_v1:")) {
      const localAt = Number(local.updatedAt || 0) || 0, cloudAt = Number(cloud.updatedAt || 0) || 0;
      if (localAt || cloudAt) return localAt > cloudAt ? localValue : cloudValue;
      const adopted = Array.from(new Set([...(Array.isArray(cloud.adopted) ? cloud.adopted : []), ...(Array.isArray(local.adopted) ? local.adopted : [])]));
      return JSON.stringify({ ...cloud, adopted });
    }
    const localAt = Number(local.pet?.lastSavedAt || 0) || 0, cloudAt = Number(cloud.pet?.lastSavedAt || 0) || 0;
    return localAt > cloudAt ? localValue : cloudValue;
  }

  function mergeGenericKeyWithoutSyncBase(key, localValue, cloudValue, userId, rawData = {}) {
    if (isPetSyncKey(key)) return mergePetSyncValue(key, localValue, cloudValue);
    const cardMatch = /^shex_x_message_custom_cards_dream_(.+)_v1$/.exec(key);
    if (cardMatch && !/_updated_at$/.test(cardMatch[1])) {
      // 字卡的可靠删除标记：云端“清空时间”晚于本机这份字卡的最后修改时间，说明本机是清空前的旧列表，不能复活。
      const dreamId = cardMatch[1];
      const cloudClearedAt = Number(rawData[`shex_x_message_custom_cards_cleared_at_dream_${dreamId}_v1`] || 0) || 0;
      const localUpdatedAt = Number(raw.getItem.call(
        localStorage,
        scopedKey(`shex_x_message_custom_cards_dream_${dreamId}_updated_at_v1`, userId)
      ) || 0) || 0;
      if (cloudClearedAt > 0 && cloudClearedAt > localUpdatedAt) return cloudValue;
    }
    return mergeConflictingSyncStrings(undefined, localValue, cloudValue, "cloud");
  }

  function mergeGenericKeyWithSyncBase(key, incomingValue, userId, rawData = {}) {
    const localValue = raw.getItem.call(localStorage, scopedKey(key, userId));
    if (localValue === null || localValue === incomingValue) return incomingValue;
    if (isPetSyncKey(key)) return mergePetSyncValue(key, localValue, incomingValue);
    const base = activeApplySyncBase;
    const localPrepared = preparedSyncValue(key, localValue);
    if (localPrepared === null) return incomingValue;
    if (sameJsonContent(localPrepared, incomingValue)) return incomingValue;
    if (!base) return mergeGenericKeyWithoutSyncBase(key, localValue, incomingValue, userId, rawData);
    const baseHash = base.hashes[key];
    if (baseHash && syncBaseHash(localPrepared) === baseHash) return incomingValue;
    if (sameJsonContent(localPrepared, incomingValue)) return incomingValue;
    const incomingPrepared = preparedSyncValue(key, incomingValue);
    if (baseHash && incomingPrepared !== null && syncBaseHash(incomingPrepared) === baseHash) return localValue;
    return mergeConflictingSyncStrings(base.values ? base.values[key] : undefined, localValue, incomingValue);
  }

  // 本机资料是否还有云端没有的内容（按内容比较，不按字节）。
  function localSnapshotDiffersFromCloud(userId, cloudRawData = {}, previousBase = null) {
    const local = prepareCloudRawData(collectUserData(userId)).rawData;
    const cloud = prepareCloudRawData(cloudRawData || {}).rawData;
    const carryHashes = {};
    let dirty = false;
    Object.keys(local).forEach((key) => {
      const value = local[key];
      if (typeof value !== "string") return;
      if (Object.prototype.hasOwnProperty.call(cloud, key)) {
        if (value !== cloud[key] && !sameJsonContent(value, cloud[key])) dirty = true;
        return;
      }
      // 云端没有这个键：以前已经上传过同样内容（云端主动清理掉的键）就不算未同步。
      const hash = syncBaseHash(value);
      if (previousBase?.hashes?.[key] === hash) carryHashes[key] = hash;
      else dirty = true;
    });
    return { dirty, local, cloud, carryHashes };
  }

  // 统一入口：把一份云端资料合并进本机，并刷新同步基线。
  function applyCloudSnapshot(userId, cloudRawData = {}, options = {}) {
    const previousBase = readSyncBase(userId);
    const changed = applyUserData(userId, cloudRawData);
    let dirty = false;
    try {
      const comparison = localSnapshotDiffersFromCloud(userId, cloudRawData, previousBase);
      dirty = comparison.dirty;
      writeSyncBase(userId, comparison.cloud, comparison.carryHashes);
      if (!dirty && String(session()?.userId || "") === String(userId || "")) {
        lastCloudSnapshotFingerprint = cloudSnapshotFingerprint(comparison.local);
      }
    } catch (error) {
      dirty = true;
      console.warn("[SHEX_SYNC_BASE] refresh failed", String(error?.message || error).slice(0, 160));
    }
    if (changed && options.notifyRuntime === true) {
      try {
        document.dispatchEvent(new CustomEvent("shex:user-data-merged", { detail: { userId, reason: options.reason || "" } }));
      } catch (_) {}
    }
    return { changed, dirty };
  }

  // 同一账号的所有云端写入（整包保存、局部梦角资料保存、拉取合并）排成一条队列，
  // 按发起顺序一个一个执行，旧请求不会晚回来盖掉新请求。
  const ACCOUNT_WRITE_QUEUE_STALL_MS = 60000;
  let accountWriteChain = Promise.resolve();
  function enqueueAccountWrite(task) {
    const previous = accountWriteChain;
    let stallTimer = 0;
    const gate = Promise.race([
      previous,
      new Promise((resolve) => { stallTimer = setTimeout(resolve, ACCOUNT_WRITE_QUEUE_STALL_MS); })
    ]);
    const run = gate.then(() => { clearTimeout(stallTimer); return task(); });
    accountWriteChain = run.then(() => undefined, () => undefined);
    return run;
  }

  function adoptOwnWriteSnapshotVersion(value) {
    const next = Math.max(0, Math.floor(Number(value || 0)) || 0);
    // 只接受“正好比本机已知版本大 1”的版本号：那说明云端只多了本机这一次写入。
    // 跳号 = 中间有另一台设备写过，本机还没合并它的内容，此时不能认领新版本号，
    // 否则下一次整包保存会通过版本校验并把对方的改动盖掉；保持旧版本号会走冲突合并。
    if (next === cloudSnapshotVersion + 1) cloudSnapshotVersion = next;
  }

  function mergeLocalOnlyData(key, incomingValue, userId, rawData = {}) {
    const readAlbumTombstone = (value) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
      const deletedAt = Number(value.deletedAt || 0);
      return {
        deletedAt,
        fileID: String(value.fileID || value.fileId || '').trim(),
        cleanedAt: Number(value.cleanedAt || 0) || null
      };
    };
    const albumTombstoneDeletedAt = (value) => {
      const record = readAlbumTombstone(value);
      return record ? record.deletedAt : Number(value || 0);
    };
    const mergeAlbumTombstone = (localValue, incomingValue) => {
      const local = readAlbumTombstone(localValue);
      const incoming = readAlbumTombstone(incomingValue);
      if (!local && !incoming) return Math.max(Number(localValue || 0), Number(incomingValue || 0));
      const localDeletedAt = albumTombstoneDeletedAt(localValue);
      const incomingDeletedAt = albumTombstoneDeletedAt(incomingValue);
      const primary = incoming && incomingDeletedAt >= localDeletedAt ? incoming : local;
      const secondary = primary === incoming ? local : incoming;
      return {
        deletedAt: Math.max(localDeletedAt, incomingDeletedAt),
        fileID: primary?.fileID || secondary?.fileID || '',
        cleanedAt: Math.max(Number(local?.cleanedAt || 0), Number(incoming?.cleanedAt || 0)) || null
      };
    };
    if (key === 'shex_x_music_library_v1') {
      const target = scopedKey(key, userId);
      const current = safeJson(raw.getItem.call(localStorage, target), []);
      const incoming = safeJson(incomingValue, []);
      if (!Array.isArray(current) || !Array.isArray(incoming)) return incomingValue;
      const tombstoneTarget = scopedKey('shex_x_music_deleted_v1', userId);
      const localTombstones = safeJson(raw.getItem.call(localStorage, tombstoneTarget), {});
      const incomingTombstones = safeJson(rawData.shex_x_music_deleted_v1 || '', {});
      const tombstones = { ...(localTombstones && typeof localTombstones === 'object' ? localTombstones : {}) };
      Object.keys(incomingTombstones && typeof incomingTombstones === 'object' ? incomingTombstones : {}).forEach((id) => {
        tombstones[id] = mergeAlbumTombstone(tombstones[id], incomingTombstones[id]);
      });
      const byId = new Map();
      [...current, ...incoming].forEach((item) => {
        const id = String(item?.id || '').trim();
        if (!id || tombstones[id]) return;
        const existing = byId.get(id);
        const itemUpdatedAt = Number(item?.updatedAt || item?.createdAt || 0);
        const existingUpdatedAt = Number(existing?.updatedAt || existing?.createdAt || 0);
        if (!existing || itemUpdatedAt >= existingUpdatedAt) byId.set(id, item);
      });
      return JSON.stringify(Array.from(byId.values()).sort((a, b) => Number(a?.createdAt || 0) - Number(b?.createdAt || 0)));
    }
    if (key === 'shex_x_music_deleted_v1') {
      const target = scopedKey(key, userId);
      const current = safeJson(raw.getItem.call(localStorage, target), {});
      const incoming = safeJson(incomingValue, {});
      const merged = { ...(current && typeof current === 'object' ? current : {}) };
      Object.keys(incoming && typeof incoming === 'object' ? incoming : {}).forEach((id) => {
        merged[id] = mergeAlbumTombstone(merged[id], incoming[id]);
      });
      return JSON.stringify(merged);
    }
    if (key === 'shex_x_album_deleted_v1') {
      const target = scopedKey(key, userId);
      const current = safeJson(raw.getItem.call(localStorage, target), {});
      const incoming = safeJson(incomingValue, {});
      const merged = { ...(current && typeof current === 'object' ? current : {}) };
      Object.keys(incoming && typeof incoming === 'object' ? incoming : {}).forEach((id) => {
        merged[id] = mergeAlbumTombstone(merged[id], incoming[id]);
      });
      return JSON.stringify(merged);
    }
    if (key === 'shex_x_stickers_deleted_v1') {
      const target = scopedKey(key, userId);
      const current = safeJson(raw.getItem.call(localStorage, target), {});
      const incoming = safeJson(incomingValue, {});
      const merged = { ...(current && typeof current === 'object' ? current : {}) };
      Object.keys(incoming && typeof incoming === 'object' ? incoming : {}).forEach((id) => {
        const localAt = Number(merged[id] || 0);
        const incomingAt = Number(incoming[id] || 0);
        merged[id] = Math.max(localAt, incomingAt);
      });
      return JSON.stringify(merged);
    }
    if (LOCAL_IMAGE_DATA_KEYS.has(key)) {
      const target = scopedKey(key, userId);
      const currentValue = raw.getItem.call(localStorage, target);
      return currentValue !== null ? currentValue : incomingValue;
    }
    if (!MIXED_IMAGE_DATA_KEYS.has(key)) return mergeGenericKeyWithSyncBase(key, incomingValue, userId, rawData);
    const target = scopedKey(key, userId);
    const current = safeJson(raw.getItem.call(localStorage, target), null);
    const incoming = safeJson(incomingValue, null);
    if (!incoming || typeof incoming !== "object") return incomingValue;
    if (!current || typeof current !== "object") return incomingValue;
    let effectiveIncoming = incoming;
    if (key === "shex_x_stickers" && Array.isArray(incoming)) {
      const tombstoneTarget = scopedKey('shex_x_stickers_deleted_v1', userId);
      const localTombstones = safeJson(raw.getItem.call(localStorage, tombstoneTarget), {});
      const incomingTombstones = safeJson(rawData.shex_x_stickers_deleted_v1 || "", {});
      const tombstones = { ...(localTombstones && typeof localTombstones === 'object' ? localTombstones : {}) };
      Object.keys(incomingTombstones && typeof incomingTombstones === 'object' ? incomingTombstones : {}).forEach((id) => {
        const localAt = Number(tombstones[id] || 0);
        const incomingAt = Number(incomingTombstones[id] || 0);
        tombstones[id] = Math.max(localAt, incomingAt);
      });
      effectiveIncoming = mergeStickerLibraries(current, incoming, tombstones);
    }
    if (key === "shex_x_album_v1" && Array.isArray(incoming)) {
      const tombstoneTarget = scopedKey('shex_x_album_deleted_v1', userId);
      const localTombstones = safeJson(raw.getItem.call(localStorage, tombstoneTarget), {});
      const incomingTombstones = safeJson(rawData.shex_x_album_deleted_v1 || "", {});
      const tombstones = { ...(localTombstones && typeof localTombstones === 'object' ? localTombstones : {}) };
      Object.keys(incomingTombstones && typeof incomingTombstones === 'object' ? incomingTombstones : {}).forEach((id) => {
        tombstones[id] = mergeAlbumTombstone(tombstones[id], incomingTombstones[id]);
      });
      effectiveIncoming = incoming.filter((item) => {
        const tombstone = tombstones[String(item?.id || '')];
        const isLegacyTombstone = Number(tombstone || 0) > 0;
        const isCurrentTombstone = tombstone && typeof tombstone === 'object' && !Array.isArray(tombstone);
        return !(item && (isLegacyTombstone || isCurrentTombstone));
      });
    }
    const merged = key === "shex_x_multi_state_v1"
      ? mergeXMultiStateByFreshness(current, incoming)
      : effectiveIncoming;
    return JSON.stringify(mergeLocalDataImages(current, merged));
  }

  function collectUserData(userId = ownerId()) {
    const prefix = `shex_user:${userId}:`;
    const rawData = {};
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = raw.key.call(localStorage, index);
      if (!key || !key.startsWith(prefix)) continue;
      rawData[unscopedKey(key)] = raw.getItem.call(localStorage, key);
    }
    return stripLocalOnlyData(rawData);
  }

  function categorizeData(rawData = collectUserData()) {
    const parsed = Object.fromEntries(Object.entries(rawData).map(([key, value]) => [key, safeJson(value, value)]));
    const state = parsed.shex_x_multi_state_v1 || {};
    return {
      profile: {
        identity: parsed.shex_x_link_identity || {},
        userName: state.userName || "",
        userAvatar: state.userAvatar || ""
      },
      chats: {
        daily: Object.fromEntries(Object.entries(parsed).filter(([key]) => key.startsWith("shex_x_message_history_"))),
        singleChats: state.singleChats || {},
        groupChats: state.groupChats || {}
      },
      dreams: {
        currentDreamId: state.currentDreamId || "",
        dreams: state.dreams || [],
        groups: state.groups || []
      },
      settings: {
        backgrounds: {
          message: parsed.shex_x_message_background_v1 || ""
        },
        customCards: parsed.shex_x_message_custom_cards_v1 || [],
        companions: state.companions || {},
        replies: state.replies || {}
      },
      assets: parsed.shex_x_assets_v1 || [],
      rawData
    };
  }

  const SNAPSHOT_CONFLICT_MERGE_ATTEMPTS = 3;
  async function saveCloudSnapshotWithConflictMerge(user, explicitData, options = {}) {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await saveCloudSnapshotViaFunction(user, explicitData, options);
      } catch (error) {
        // 指定了整包内容的保存（注册初始化）不做合并重试；其余保存遇到版本冲突时，
        // 先把云端新资料合并进本机（本机未同步的改动保留），再用合并结果重新保存。
        if (explicitData || !isSnapshotVersionConflict(error) || attempt >= SNAPSHOT_CONFLICT_MERGE_ATTEMPTS - 1) throw error;
        recordSnapshotSyncTrace("save_version_conflict_merge", {
          action: "saveSnapshot",
          source: "saveCloudSnapshotWithConflictMerge",
          attempt,
          baseSnapshotVersion: cloudSnapshotVersion
        });
        await refreshCloudSnapshotAfterConflict();
      }
    }
  }

  async function saveCloudSnapshot(user = session(), explicitData, options = {}) {
    if (shouldUsePlanPreview(user)) return { ok: true, preview: true, skippedCloud: true };
    return await enqueueAccountWrite(() => saveCloudSnapshotWithConflictMerge(user, explicitData, options));
  }

  async function loadCloudSnapshot(userId) {
    if (shouldUsePlanPreview(session())) return {};
    return await loadCloudSnapshotViaFunction(userId);
  }

  function syncBlockedReason() {
    if (!session()) return "no_session";
    if (isAuthExpired()) return "auth_expired";
    if (shouldUsePlanPreview()) return "plan_preview";
    if (restoringFromCloud) return "restoring_from_cloud";
    if (dataLoadStatus !== "success") return `data_status_${dataLoadStatus || "idle"}`;
    return "";
  }

  function notifySyncGuard(message, type = "error", options = {}) {
    const nowTime = now();
    const minInterval = Number(options.minInterval || SYNC_NOTICE_INTERVAL_MS);
    if (nowTime - lastSyncGuardNoticeAt < minInterval) return;
    lastSyncGuardNoticeAt = nowTime;
    notify(message, type);
  }

  function isSnapshotVersionConflict(error) {
    return String(error?.code || error?.rawError?.code || "") === "SNAPSHOT_VERSION_CONFLICT";
  }

  let chatStorageRefreshPromptOpen = false;
  function isChatStorageProtocolUpgradeRequired(error) {
    return String(error?.code || error?.rawError?.code || "") === "CHAT_STORAGE_PROTOCOL_UPGRADE_REQUIRED";
  }

  function promptChatStorageRefresh() {
    if (chatStorageRefreshPromptOpen) return;
    chatStorageRefreshPromptOpen = true;
    notify(CHAT_STORAGE_REFRESH_MESSAGE, "error");
    window.setTimeout(() => {
      const shouldRefresh = window.confirm(`${CHAT_STORAGE_REFRESH_MESSAGE}\n\n是否立即刷新？`);
      chatStorageRefreshPromptOpen = false;
      if (shouldRefresh) location.reload();
    }, 0);
  }

  function scheduleSyncRetry(reason = "save_failed") {
    if (syncRetryAttempt >= SYNC_RETRY_MAX_ATTEMPTS) {
      debugLog("[SYNC_RETRY_DEBUG]", {
        action: "retry_exhausted",
        reason,
        attempts: syncRetryAttempt
      });
      notifySyncGuard(SYNC_FAILED_MESSAGE);
      return false;
    }
    syncRetryAttempt += 1;
    const delay = Math.min(SYNC_RETRY_MAX_MS, SYNC_RETRY_BASE_MS * (2 ** (syncRetryAttempt - 1)));
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
      syncTimer = 0;
      flushScheduledSnapshotSave(`retry:${reason}:${syncRetryAttempt}`);
    }, delay);
    debugLog("[SYNC_RETRY_DEBUG]", {
      action: "retry_scheduled",
      reason,
      attempt: syncRetryAttempt,
      delay
    });
    return true;
  }

  async function refreshCloudSnapshotAfterConflict() {
    const current = session();
    if (!current?.userId) return false;
    const cloudRawData = await loadCloudSnapshotViaFunction(current.userId);
    // X103：合并而不是覆盖——本机未同步的梦角、字卡等改动保留，并通知页面重新读取合并后的资料。
    applyCloudSnapshot(current.userId, cloudRawData, { notifyRuntime: true, reason: "version_conflict" });
    debugLog("[SYNC_RETRY_DEBUG]", {
      action: "version_conflict_refreshed",
      snapshotVersion: cloudSnapshotVersion,
      cloudKeyCount: Object.keys(cloudRawData || {}).length
    });
    return true;
  }

  async function flushScheduledSnapshotSave(reason = "scheduled") {
    const blockedReason = syncBlockedReason();
    if (blockedReason) {
      debugLog("[SYNC_GUARD_DEBUG]", {
        action: "skip_save",
        dataLoadStatus,
        restoringFromCloud,
        isSavingSnapshot,
        pendingSnapshotSave,
        canSave: false,
        blockedReason,
        reason
      });
      return;
    }
    syncFirstDirtyAt = 0;
    if (isSavingSnapshot) {
      pendingSnapshotSave = true;
      debugLog("[SYNC_GUARD_DEBUG]", {
        action: "queue_pending",
        dataLoadStatus,
        restoringFromCloud,
        isSavingSnapshot,
        pendingSnapshotSave,
        canSave: true,
        blockedReason: "",
        reason
      });
      return;
    }
    isSavingSnapshot = true;
    debugLog("[SYNC_GUARD_DEBUG]", {
      action: "save_start",
      dataLoadStatus,
      restoringFromCloud,
      isSavingSnapshot,
      pendingSnapshotSave,
      canSave: true,
      blockedReason: "",
      reason
    });
    try {
      const saveResult = await saveCloudSnapshot();
      if (!saveResult?.skippedCloud) syncDiagnostics.savesSucceeded += 1;
      consecutiveSyncSlowCount = 0;
      consecutiveSyncFailureCount = 0;
      syncRetryAttempt = 0;
    } catch (error) {
      console.warn("CloudBase 同步失败：", error);
      if (isSessionExpiredError(error) || formatError(error) === FRIENDLY_SESSION_MESSAGE) {
        markSessionExpired();
        return;
      }
      if (isSnapshotVersionConflict(error)) {
        recordSnapshotSyncTrace("save_version_conflict", {
          action: "saveSnapshot",
          source: "flushScheduledSnapshotSave",
          reason,
          baseSnapshotVersion: cloudSnapshotVersion,
          cloudSnapshotVersion: Math.max(0, Math.floor(Number(error?.rawError?.snapshotVersion || 0)) || 0),
          code: String(error?.code || error?.rawError?.code || ""),
          message: String(error?.detail || error?.message || ""),
          requestId: String(error?.rawError?.requestId || "")
        });
        try {
          await refreshCloudSnapshotAfterConflict();
          scheduleSyncRetry("version_conflict");
        } catch (refreshError) {
          console.error("[SHEX_ERROR]", { code: "SNAPSHOT_VERSION_CONFLICT_REFRESH_FAILED", step: "loadSnapshot", detail: formatError(refreshError), rawError: refreshError });
          scheduleSyncRetry("version_conflict_refresh_failed");
        }
        return;
      }
      if (isChatStorageProtocolUpgradeRequired(error)) {
        promptChatStorageRefresh();
        return;
      }
      if (isFunctionTimeoutError(error) || formatError(error) === SYNC_SLOW_MESSAGE) {
        consecutiveSyncSlowCount += 1;
        debugLog("[SYNC_GUARD_DEBUG]", {
          action: "slow_save",
          dataLoadStatus,
          restoringFromCloud,
          isSavingSnapshot,
          pendingSnapshotSave,
          canSave: true,
          blockedReason: "",
          reason,
          consecutiveSyncSlowCount
        });
        if (consecutiveSyncSlowCount >= SYNC_SLOW_NOTICE_THRESHOLD) {
          notifySyncGuard(SYNC_SLOW_MESSAGE, "info");
        }
        scheduleSyncRetry("timeout");
        return;
      }
      consecutiveSyncFailureCount += 1;
      const friendly = friendlyErrorMessage(error, SYNC_FAILED_MESSAGE);
      console.error("[SHEX_ERROR]", { code: "", step: "saveSnapshot", detail: formatError(error), rawError: error });
      if (consecutiveSyncFailureCount >= SYNC_SLOW_NOTICE_THRESHOLD) {
        notifySyncGuard(friendly);
      }
      scheduleSyncRetry("failure");
    } finally {
      isSavingSnapshot = false;
      debugLog("[SYNC_GUARD_DEBUG]", {
        action: "save_end",
        dataLoadStatus,
        restoringFromCloud,
        isSavingSnapshot,
        pendingSnapshotSave,
        canSave: !syncBlockedReason(),
        blockedReason: syncBlockedReason(),
        reason
      });
      if (pendingSnapshotSave) {
        pendingSnapshotSave = false;
        scheduleSync("pending");
      }
    }
  }

  function scheduleSync(reason = "storage_change") {
    const blockedReason = syncBlockedReason();
    if (blockedReason) {
      debugLog("[SYNC_GUARD_DEBUG]", {
        action: "skip_schedule",
        dataLoadStatus,
        restoringFromCloud,
        isSavingSnapshot,
        pendingSnapshotSave,
        canSave: false,
        blockedReason,
        reason
      });
      return;
    }
    syncDiagnostics.scheduled += 1;
    syncDiagnostics.reasons[reason] = Number(syncDiagnostics.reasons[reason] || 0) + 1;
    recordSnapshotSyncTrace("scheduled", {
      action: "scheduleSync",
      source: "Storage.prototype.setItem/removeItem",
      reason,
      baseSnapshotVersion: cloudSnapshotVersion,
      stack: new Error("snapshot sync scheduled").stack || ""
    });
    if (syncTimer) syncDiagnostics.coalesced += 1;
    const scheduledAt = now();
    if (!syncFirstDirtyAt) syncFirstDirtyAt = scheduledAt;
    const remainingMaxWait = Math.max(0, SYNC_SAVE_MAX_WAIT_MS - (scheduledAt - syncFirstDirtyAt));
    const delay = Math.min(SYNC_SAVE_DEBOUNCE_MS, remainingMaxWait);
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
      syncTimer = 0;
      flushScheduledSnapshotSave(reason);
    }, delay);
  }

  function applyUserData(userId, rawData = {}) {
    let changed = false;
    const changedKeys = [];
    activeApplySyncBase = readSyncBase(userId);
    try {
    const incomingCardsClearedAt = rawData.shex_x_message_custom_cards_cleared_at_v1 || "";
    Object.entries(rawData).forEach(([key, value]) => {
      if (!ownsKey(key) || typeof value !== "string") return;
      if (LOCAL_ONLY_SYNC_KEYS.has(key)) return;
      if (key === "shex_x_message_custom_cards_v1") {
        const clearedAt = raw.getItem.call(localStorage, scopedKey("shex_x_message_custom_cards_cleared_at_v1", userId));
        const localCards = raw.getItem.call(localStorage, scopedKey(key, userId));
        if ((clearedAt || incomingCardsClearedAt) && localCards === null) {
          changed = true;
          changedKeys.push({ key, localBytes: -1, cloudBytes: value.length, reason: "cards_cleared" });
          return;
        }
      }
      const target = scopedKey(key, userId);
      const nextValue = mergeLocalOnlyData(key, value, userId, rawData);
      const localValue = raw.getItem.call(localStorage, target);
      if (localValue !== nextValue) {
        raw.setItem.call(localStorage, target, nextValue);
        // X103：只有内容真的不同才算变化。同样的数据仅因 JSON 键顺序/合并后重新序列化而字节不同，
        // 以前也会触发整页 reload（实测每次冷启动浪费约 2.2 秒）。
        if (!sameJsonContent(localValue, nextValue)) {
          changed = true;
          changedKeys.push({ key, localBytes: localValue === null ? -1 : localValue.length, cloudBytes: nextValue.length });
        }
      }
    });
    } finally {
      activeApplySyncBase = null;
    }
    if (changedKeys.length) {
      // 诊断：记录这次恢复里真正变化的键，便于确认整页 reload 的原因（只记键名与长度，不记内容）。
      try { sessionStorage.setItem("shex_last_restore_changed_keys", JSON.stringify({ at: Date.now(), keys: changedKeys.slice(0, 40) })); } catch (_) {}
      try { console.info("[SHEX_RESTORE_CHANGED_KEYS]", changedKeys.map((item) => item.key).join(",")); } catch (_) {}
    }
    return changed;
  }

  function sameJsonContent(left, right) {
    if (left === right) return true;
    if (typeof left !== "string" || typeof right !== "string") return false;
    let a, b;
    try { a = JSON.parse(left); b = JSON.parse(right); } catch (_) { return false; }
    const equal = (x, y) => {
      if (x === y) return true;
      if (typeof x !== typeof y || x === null || y === null || typeof x !== "object") return false;
      if (Array.isArray(x) !== Array.isArray(y)) return false;
      if (Array.isArray(x)) return x.length === y.length && x.every((item, index) => equal(item, y[index]));
      const xk = Object.keys(x), yk = Object.keys(y);
      if (xk.length !== yk.length) return false;
      return xk.every((k) => Object.prototype.hasOwnProperty.call(y, k) && equal(x[k], y[k]));
    };
    return equal(a, b);
  }

  function migrateLegacyData(userId) {
    migrateLegacyFavoritesOnce(userId);
    const extra = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = raw.key.call(localStorage, index);
      if (key && ownsKey(key)) extra.push(key);
    }
    Array.from(new Set([...LEGACY_KEYS, ...extra])).filter((key) => key !== LEGACY_FAVORITES_KEY).forEach((key) => {
      const value = raw.getItem.call(localStorage, key);
      const target = scopedKey(key, userId);
      if (value !== null && raw.getItem.call(localStorage, target) === null) {
        raw.setItem.call(localStorage, target, value);
      }
    });
  }

  function migrateLegacyFavoritesOnce(userId) {
    if (!userId || userId === "guest") return;
    if (raw.getItem.call(localStorage, LEGACY_FAVORITES_MIGRATION_KEY)) return;
    const legacyValue = raw.getItem.call(localStorage, LEGACY_FAVORITES_KEY);
    if (legacyValue === null) return;
    const target = scopedKey(LEGACY_FAVORITES_KEY, userId);
    if (raw.getItem.call(localStorage, target) === null) {
      raw.setItem.call(localStorage, target, legacyValue);
    }
    raw.removeItem.call(localStorage, LEGACY_FAVORITES_KEY);
    raw.setItem.call(localStorage, LEGACY_FAVORITES_MIGRATION_KEY, JSON.stringify({
      userId,
      migratedAt: now()
    }));
  }

  Storage.prototype.getItem = function getItem(key) {
    return raw.getItem.call(this, scopedKey(key));
  };

  function snapshotComparableStorageValue(key, value) {
    if (key !== "shex_x_multi_state_v1" || typeof value !== "string") return value;
    try {
      const state = JSON.parse(value);
      if (!state || typeof state !== "object" || Array.isArray(state)) return value;
      const compact = { ...state };
      delete compact.singleChats;
      delete compact.groupChats;
      delete compact.chats;
      delete compact.chatList;
      delete compact.deletedChatMessages;
      return JSON.stringify(compact);
    } catch (_) {
      return value;
    }
  }

  Storage.prototype.setItem = function setItem(key, value) {
    const target = scopedKey(key);
    const previousValue = raw.getItem.call(this, target);
    raw.setItem.call(this, target, value);
    const snapshotValueChanged = snapshotComparableStorageValue(key, previousValue) !== snapshotComparableStorageValue(key, String(value));
    const authoritativeInstanceMirrorSuppressed = authoritativeInstanceMirrorWriteDepth > 0 && key === "shex_x_multi_state_v1";
    const beautifyAppearanceMirrorSuppressed = beautifyAppearanceMirrorWriteDepth > 0
      && (key === "shex_x_multi_state_v1" || key === "shex_x_message_backgrounds_v1");
    if (ownsKey(key) && !LOCAL_ONLY_SYNC_KEYS.has(key) && snapshotValueChanged && authoritativeInstanceMirrorSuppressed) {
      syncDiagnostics.authoritativeInstanceMirrorWritesSuppressed += 1;
      debugLog("[SYNC_GUARD_DEBUG]", {
        action: "skip_authoritative_instance_mirror_schedule",
        key,
        source: "shex_character_instances"
      });
      return;
    }
    if (ownsKey(key) && !LOCAL_ONLY_SYNC_KEYS.has(key) && snapshotValueChanged && beautifyAppearanceMirrorSuppressed) {
      debugLog("[SYNC_GUARD_DEBUG]", {
        action: "skip_beautify_appearance_mirror_schedule",
        key,
        source: "shex_beautify_overrides"
      });
      return;
    }
    // X小宠的存档 / 家的记录写得很频繁（房间开着时每 15 秒一次）：不每次都触发云端同步，
    // 攒着，最多 10 分钟同步一次，离开页面（切后台）时再补一次；其它数据照常同步时也会顺带带上。
    if (ownsKey(key) && snapshotValueChanged && isLazyPetSyncKey(key)) {
      schedulePetLazySync();
      return;
    }
    if (
      ownsKey(key)
      && !LOCAL_ONLY_SYNC_KEYS.has(key)
      && !(dreamProfileLocalWriteDepth > 0 && key === "shex_x_multi_state_v1")
      && snapshotValueChanged
    ) {
      scheduleSync(`set:${key}`);
    }
  };
  const PET_LAZY_SYNC_MS = 10 * 60 * 1000;
  let petLazyTimer = 0, petLazyDirty = false;
  function isLazyPetSyncKey(key) { return isPetSyncKey(key) || String(key).startsWith("shex_x_pet_journal_v1:"); }
  function flushPetLazySync(reason) {
    if (!petLazyDirty) return;
    petLazyDirty = false; clearTimeout(petLazyTimer); petLazyTimer = 0;
    scheduleSync(reason);
  }
  function schedulePetLazySync() {
    petLazyDirty = true;
    if (!petLazyTimer) petLazyTimer = setTimeout(() => { petLazyTimer = 0; flushPetLazySync("pet_lazy"); }, PET_LAZY_SYNC_MS);
  }
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flushPetLazySync("pet_hidden"); });
  window.addEventListener("pagehide", () => flushPetLazySync("pet_pagehide"));

  function withDreamProfileLocalWrite(callback) {
    dreamProfileLocalWriteDepth += 1;
    try {
      return callback();
    } finally {
      dreamProfileLocalWriteDepth = Math.max(0, dreamProfileLocalWriteDepth - 1);
    }
  }

  function withAuthoritativeInstanceMirrorWrite(callback) {
    if (typeof callback !== "function") throw new TypeError("authoritative instance mirror callback is required");
    authoritativeInstanceMirrorWriteDepth += 1;
    try {
      return callback();
    } finally {
      authoritativeInstanceMirrorWriteDepth = Math.max(0, authoritativeInstanceMirrorWriteDepth - 1);
    }
  }

  function withBeautifyAppearanceMirrorWrite(callback) {
    if (typeof callback !== "function") throw new TypeError("beautify appearance mirror callback is required");
    beautifyAppearanceMirrorWriteDepth += 1;
    try {
      return callback();
    } finally {
      beautifyAppearanceMirrorWriteDepth = Math.max(0, beautifyAppearanceMirrorWriteDepth - 1);
    }
  }

  function dreamProfileStatus(dreamId = "") {
    return dreamProfileStatuses.get(String(dreamId || "")) || { dreamId: String(dreamId || ""), status: "legacy", revision: 0 };
  }

  async function saveDreamProfileGroup(payload = {}, options = {}) {
    const current = session();
    if (!current || isAuthExpired()) throw new Error(FRIENDLY_SESSION_MESSAGE);
    const data = await enqueueAccountWrite(() => callAuthFunction("saveDreamProfileGroup", {
      userId: current.userId,
      sessionToken: current.sessionToken || "",
      dreamProfileStorageProtocolVersion: DREAM_PROFILE_STORAGE_PROTOCOL_VERSION,
      ...payload
    }).then(async (result) => {
      // 权威回写必须与版本认领在同一队列项；后续整包保存才能采集到新内容。
      if (typeof options.applyResult === "function" && !result?.revisionConflict) {
        try { result = { ...result, localApplied: await options.applyResult(result) !== false }; }
        catch (_) { result = { ...result, localApplied: false }; }
      }
      // 只读冲突响应不属于本机写入，不能认领远端账号版本。
      const readonlyNameResult = Object.prototype.hasOwnProperty.call(payload, "displayName") && result?.idempotent === true;
      if (!result?.revisionConflict && !readonlyNameResult && result?.localApplied !== false) adoptOwnWriteSnapshotVersion(result?.snapshotVersion);
      dreamProfileStorageIndexRevision = Math.max(0, Math.floor(Number(result?.indexRevision || dreamProfileStorageIndexRevision)) || 0);
      const dreamId = String(result?.dreamId || payload?.dreamId || "");
      if (dreamId) dreamProfileStatuses.set(dreamId, {
        dreamId,
        status: String(result?.status || dreamProfileStatus(dreamId).status || "shadow"),
        revision: Math.max(0, Math.floor(Number(result?.documentRevision || dreamProfileStatus(dreamId).revision)) || 0)
      });
      return result;
    }));
    return data;
  }

  async function callDreamProfileAction(action, payload = {}) {
    const current = session();
    if (!current || isAuthExpired()) throw new Error(FRIENDLY_SESSION_MESSAGE);
    const data = await enqueueAccountWrite(() => callAuthFunction(action, {
      userId: current.userId,
      sessionToken: current.sessionToken || "",
      dreamProfileStorageProtocolVersion: DREAM_PROFILE_STORAGE_PROTOCOL_VERSION,
      ...payload
    }).then((result) => {
      if (Object.prototype.hasOwnProperty.call(result || {}, "snapshotVersion")) adoptOwnWriteSnapshotVersion(result.snapshotVersion);
      return result;
    }));
    const dreamId = String(data?.dreamId || payload?.dreamId || "");
    if (dreamId && data?.status) dreamProfileStatuses.set(dreamId, {
      dreamId,
      status: String(data.status),
      revision: Math.max(0, Math.floor(Number(data?.documentRevision || dreamProfileStatus(dreamId).revision)) || 0)
    });
    if (Object.prototype.hasOwnProperty.call(data || {}, "indexRevision")) {
      dreamProfileStorageIndexRevision = Math.max(0, Math.floor(Number(data.indexRevision || dreamProfileStorageIndexRevision)) || 0);
    }
    return data;
  }

  Storage.prototype.removeItem = function removeItem(key) {
    raw.removeItem.call(this, scopedKey(key));
    if (ownsKey(key) && !LOCAL_ONLY_SYNC_KEYS.has(key)) scheduleSync(`remove:${key}`);
  };

  async function getRegistrationCaptcha() {
    const data = await callAuthFunction("getRegistrationCaptcha");
    const captcha = data?.captcha;
    if (!captcha?.imageData || !captcha?.token) throw new Error("人机验证加载失败，请稍后重试");
    return captcha;
  }

  async function register(username, password, captcha = {}) {
    if (raw.getItem.call(localStorage, "hasRegisteredAccount") === "true") {
      throw new Error("当前浏览器已注册过账号，请直接登录");
    }
    const displayName = username.trim();
    if (displayName.length < 2) throw new Error("用户名至少需要 2 个字符");
    if (password.length < 6) throw new Error("密码至少需要 6 位");
    const normalized = normalizeUsername(displayName);
    const data = await callAuthFunction("register", {
      username: normalized,
      displayName,
      password,
      captchaToken: String(captcha.token || ""),
      captchaAnswer: String(captcha.answer || ""),
      deviceId: deviceId()
    });
    const user = data.user;
    if (!user?.userId) throw new Error("注册失败：云端没有返回 userId");
    const next = {
      userId: user.userId,
      username: user.username || normalized,
      displayName: user.displayName || displayName,
      sessionToken: data.sessionToken || "",
      cloud: true
    };
    setSession(next);
    cloudSnapshotVersion = Math.max(0, Math.floor(Number(data.snapshotVersion || 0)) || 0);
    raw.setItem.call(localStorage, "registeredUserId", next.userId);
    raw.setItem.call(localStorage, "registeredUsername", next.username);
    raw.setItem.call(localStorage, "registeredAt", String(now()));
    raw.setItem.call(localStorage, "hasRegisteredAccount", "true");
    migrateLegacyData(next.userId);
    if (data.rawData) applyUserData(next.userId, data.rawData);
    rememberCloudSnapshot(data.rawData || {});
    await saveCloudSnapshot(next, collectUserData(next.userId), { allowBeforeRestore: true });
    return next;
  }

  async function getEmailRegistrationCaptcha() {
    const data = await callAuthFunction("getEmailRegistrationCaptcha");
    const required = data?.required === true;
    if (required && (!data?.captcha?.imageData || !data?.captcha?.token)) {
      throw new Error("人机验证加载失败，请稍后重试");
    }
    return { required, captcha: required ? data.captcha : null };
  }

  function normalizeInviteCodeInput(value) {
    return String(value || "").trim().toUpperCase();
  }

  async function registerWithVerifiedEmail(email, username, registrationRequestId, captcha = {}, options = {}) {
    if (raw.getItem.call(localStorage, "hasRegisteredAccount") === "true") {
      throw new Error("当前浏览器已注册过账号，请直接登录");
    }
    const displayName = String(username || "").trim();
    if (displayName.length < 2) throw new Error("用户名至少需要 2 个字符");
    const normalized = normalizeUsername(displayName);
    const inviteCode = normalizeInviteCodeInput(options?.inviteCode);
    const data = await callAuthFunction("registerWithVerifiedEmail", {
      email: String(email || ""),
      username: normalized,
      displayName,
      registrationRequestId: String(registrationRequestId || ""),
      captchaToken: String(captcha.token || ""),
      captchaAnswer: String(captcha.answer || ""),
      deviceId: deviceId(),
      ...(inviteCode ? { inviteCode } : {})
    }, { verifiedIdentity: "email" });
    const user = data.user;
    if (!user?.userId) throw new Error("注册失败：云端没有返回 userId");
    const next = {
      userId: user.userId,
      username: user.username || normalized,
      displayName: user.displayName || displayName,
      sessionToken: data.sessionToken || "",
      cloud: true
    };
    setSession(next);
    cloudSnapshotVersion = Math.max(0, Math.floor(Number(data.snapshotVersion || 0)) || 0);
    raw.setItem.call(localStorage, "registeredUserId", next.userId);
    raw.setItem.call(localStorage, "registeredUsername", next.username);
    raw.setItem.call(localStorage, "registeredAt", String(now()));
    raw.setItem.call(localStorage, "hasRegisteredAccount", "true");
    migrateLegacyData(next.userId);
    if (data.rawData) applyUserData(next.userId, data.rawData);
    rememberCloudSnapshot(data.rawData || {});
    try {
      await saveCloudSnapshot(next, collectUserData(next.userId), { allowBeforeRestore: true });
    } catch (error) {
      console.warn("[SHEX] 新邮箱账号首次数据同步失败，登录状态和账号注册结果仍然保留", error);
    }
    try {
      await resetCloudBaseIdentityToAnonymous();
    } catch (error) {
      console.warn("[SHEX] CloudBase 邮箱身份清理失败，将在下次进入登录页时重试", error);
    }
    if (data.inviteReward && typeof data.inviteReward === "object") {
      return { ...next, inviteReward: data.inviteReward };
    }
    return next;
  }

  async function loginWithVerifiedEmail(email) {
    const data = await callAuthFunction("loginWithVerifiedEmail", {
      email: String(email || ""),
      deviceId: deviceId()
    }, { verifiedIdentity: "email" });
    const user = data.user;
    if (!user?.userId) throw new Error("登录失败：云端没有返回 userId");
    const next = {
      userId: user.userId,
      username: user.username || "",
      displayName: user.displayName || user.username || "",
      sessionToken: data.sessionToken || "",
      cloud: true,
      mustChangePassword: false
    };
    setSession(next);
    cloudSnapshotVersion = Math.max(0, Math.floor(Number(data.snapshotVersion || 0)) || 0);
    migrateLegacyData(next.userId);
    applyUserData(next.userId, data.rawData || {});
    rememberCloudSnapshot(data.rawData || {});
    try {
      await resetCloudBaseIdentityToAnonymous();
    } catch (error) {
      console.warn("[SHEX] CloudBase 邮箱身份清理失败，将在下次进入登录页时重试", error);
    }
    return next;
  }

  async function registerWithVerifiedPhone(phone, username, password) {
    const displayName = String(username || "").trim();
    if (displayName.length < 2) throw new Error("用户名至少需要 2 个字符");
    if (String(password || "").length < 6) throw new Error("密码至少需要 6 位");
    const normalized = normalizeUsername(displayName);
    const data = await callAuthFunction("registerWithVerifiedPhone", {
      phone: String(phone || ""),
      username: normalized,
      displayName,
      password,
      deviceId: deviceId()
    });
    const user = data.user;
    if (!user?.userId) throw new Error("注册失败：云端没有返回 userId");
    const next = {
      userId: user.userId,
      username: user.username || normalized,
      displayName: user.displayName || displayName,
      sessionToken: data.sessionToken || "",
      cloud: true
    };
    setSession(next);
    cloudSnapshotVersion = Math.max(0, Math.floor(Number(data.snapshotVersion || 0)) || 0);
    raw.setItem.call(localStorage, "registeredUserId", next.userId);
    raw.setItem.call(localStorage, "registeredUsername", next.username);
    raw.setItem.call(localStorage, "registeredAt", String(now()));
    raw.setItem.call(localStorage, "hasRegisteredAccount", "true");
    migrateLegacyData(next.userId);
    if (data.rawData) applyUserData(next.userId, data.rawData);
    rememberCloudSnapshot(data.rawData || {});
    try {
      await saveCloudSnapshot(next, collectUserData(next.userId), { allowBeforeRestore: true });
    } catch (error) {
      console.warn("[SHEX] 新账号首次数据同步失败，登录状态和账号注册结果仍然保留", error);
    }
    try {
      await resetCloudBaseIdentityToAnonymous();
    } catch (error) {
      console.warn("[SHEX] CloudBase 手机身份清理失败，将在下次进入登录页时重试", error);
    }
    return next;
  }

  async function getPhoneBindingStatus() {
    const current = session();
    if (!current) throw new Error("请先登录");
    return callAuthFunction("getPhoneBindingStatus", {
      userId: current.userId,
      sessionToken: current.sessionToken || ""
    });
  }

  async function bindVerifiedPhone(phone) {
    const current = session();
    if (!current) throw new Error("请先登录");
    return callAuthFunction("bindVerifiedPhone", {
      userId: current.userId,
      sessionToken: current.sessionToken || "",
      phone: String(phone || ""),
      deviceId: current.deviceId || deviceId()
    }, { verifiedPhoneIdentity: true });
  }

  async function beginPhoneChange(oldPhone, currentPassword) {
    const current = session();
    if (!current) throw new Error("请先登录");
    return callAuthFunction("beginPhoneChange", {
      userId: current.userId,
      sessionToken: current.sessionToken || "",
      oldPhone: String(oldPhone || ""),
      currentPassword: String(currentPassword || "")
    }, { verifiedPhoneIdentity: true });
  }

  async function confirmPhoneChange(newPhone, phoneChangeRequestId, phoneChangeToken) {
    const current = session();
    if (!current) throw new Error("请先登录");
    return callAuthFunction("confirmPhoneChange", {
      userId: current.userId,
      sessionToken: current.sessionToken || "",
      newPhone: String(newPhone || ""),
      phoneChangeRequestId: String(phoneChangeRequestId || ""),
      phoneChangeToken: String(phoneChangeToken || "")
    }, { verifiedPhoneIdentity: true });
  }

  async function login(username, password) {
    await resetCloudBaseIdentityToAnonymous();
    const displayName = username.trim();
    const normalized = normalizeUsername(displayName);
    if (!normalized || !password) throw new Error("请输入用户名和密码");
    const data = await callAuthFunction("login", {
      username: normalized,
      displayName,
      password,
      deviceId: deviceId()
    });
    const user = data.user;
    if (!user?.userId) throw new Error("登录失败：云端没有返回 userId");
    const next = {
      userId: user.userId,
      username: user.username || normalized,
      displayName: user.displayName || displayName,
      sessionToken: data.sessionToken || "",
      cloud: true,
      mustChangePassword: Boolean(user.mustChangePassword)
    };
    setSession(next);
    cloudSnapshotVersion = Math.max(0, Math.floor(Number(data.snapshotVersion || 0)) || 0);
    migrateLegacyData(next.userId);
    rememberCloudSnapshot(data.rawData || {});
    // X103：与本机遗留资料合并（上次退出时没同步成功的改动保留），随后页面加载会继续上传。
    applyCloudSnapshot(next.userId, data.rawData || {});
    return next;
  }

  async function changePassword(currentPassword, newPassword) {
    const current = session();
    if (!current) throw new Error("请先登录");
    const data = await callAuthFunction("changePassword", {
      userId: current.userId,
      sessionToken: current.sessionToken || "",
      currentPassword: String(currentPassword || ""),
      newPassword: String(newPassword || "")
    });
    const newSessionToken = String(data.sessionToken || "");
    if (!newSessionToken) throw new Error("新登录状态生成失败，请重新登录");
    const updatedSession = { ...current, sessionToken: newSessionToken, mustChangePassword: false };
    setSession(updatedSession);
    return data;
  }

  function fileExtension(file) {
    const fromName = String(file?.name || "").split(".").pop();
    if (fromName && fromName !== file?.name) return fromName.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
    const fromType = String(file?.type || "").split("/").pop();
    return fromType ? fromType.replace(/[^a-z0-9]/g, "") : "bin";
  }

  function fileToDataUrl(file) {
    return new Promise((resolve) => {
      if (!file) return resolve("");
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => resolve("");
      reader.readAsDataURL(file);
    });
  }

  function uploadCompressionProfile(kind = "uploads") {
    const normalizedKind = String(kind || "uploads").trim().toLowerCase();
    if (["avatar", "character-public-avatars"].includes(normalizedKind)) {
      return { maxSide: 720, quality: 0.78 };
    }
    if (["background", "character-public-backgrounds", "world-public-backgrounds", "world-public-promos"].includes(normalizedKind)) {
      return { maxSide: 1800, quality: 0.82 };
    }
    return { maxSide: 1280, quality: 0.8 };
  }

  function compressImageForUpload(file, kind = "uploads") {
    if (String(kind || "").trim().toLowerCase() === "beautify-components") {
      const processor = window.SHEXBeautifyImageUploadProcessor;
      if (processor?.process) return processor.process(file, kind);
      return Promise.resolve(file);
    }
    return new Promise((resolve) => {
      if (!file || !/^image\//.test(file.type || "")) return resolve(file);
      // GIF backgrounds must keep their animation. Videos already bypass this image path.
      if (/^image\/gif$/i.test(file.type || "") || /\.gif$/i.test(file.name || "")) return resolve(file);
      const { maxSide, quality } = uploadCompressionProfile(kind);
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          try {
            const scale = Math.min(1, maxSide / Math.max(img.width || maxSide, img.height || maxSide));
            const canvas = document.createElement("canvas");
            canvas.width = Math.max(1, Math.round((img.width || maxSide) * scale));
            canvas.height = Math.max(1, Math.round((img.height || maxSide) * scale));
            const ctx = canvas.getContext("2d");
            if (!ctx) return resolve(file);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            canvas.toBlob((blob) => {
              if (!blob) return resolve(file);
              const next = new File([blob], String(file.name || "image.jpg").replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" });
              resolve(next.size < file.size ? next : file);
            }, "image/jpeg", quality);
          } catch (_) {
            resolve(file);
          }
        };
        img.onerror = () => resolve(file);
        img.src = String(reader.result || "");
      };
      reader.onerror = () => resolve(file);
      reader.readAsDataURL(file);
    });
  }

  async function tempUrl(app, fileID) {
    try {
      const result = await app.getTempFileURL({ fileList: [fileID] });
      return result.fileList?.[0]?.tempFileURL || result.fileList?.[0]?.download_url || "";
    } catch (_) {
      return "";
    }
  }

  async function tempUrlWithAuth(fileID) {
    if (!fileID) return "";
    try {
      return await withCloudBaseAuth(async (api) => {
        const result = await api.app.getTempFileURL({ fileList: [fileID] });
        return result.fileList?.[0]?.tempFileURL || result.fileList?.[0]?.download_url || "";
      }, { retryAuthOnce:true });
    } catch (_) {
      return "";
    }
  }


  function cloudUploadError(code, message, cause, extra = {}) {
    const error = new Error(String(message || code || "云端上传失败"));
    error.code = String(code || cause?.code || "CLOUD_UPLOAD_FAILED");
    error.cause = cause;
    Object.assign(error, extra);
    return error;
  }

  async function verifyUploadedFile(fileID) {
    const result = await withCloudBaseAuth(
      (api) => api.app.getTempFileURL({ fileList:[fileID] }),
      { retryAuthOnce:true }
    );
    const item = Array.isArray(result?.fileList) ? result.fileList[0] : null;
    const code = String(item?.code || item?.status || "").trim();
    const url = String(item?.tempFileURL || item?.download_url || "").trim();
    if ((code && !/^(?:SUCCESS|0)$/i.test(code)) || !url) {
      throw cloudUploadError("CLOUD_UPLOAD_VERIFY_FAILED", "文件已上传，但云端暂时无法确认文件可用", null, { uploadedFileID:fileID, storageCode:code });
    }
    return true;
  }

  async function uploadFile(file, kind = "uploads", options = {}) {
    const current = session();
    if (!file) return { url: "", fileID: "", cloudPath: "", localUrl: "" };
    const uploadTarget = options?.preserveOriginal === true ? file : await compressImageForUpload(file, kind);
    const imageMaxBytes = window.SHEXBeautifyImageUploadProcessor?.maxBytes?.(kind) || 2 * 1024 * 1024;
    if (/^image\//.test(uploadTarget.type || "") && uploadTarget.size > imageMaxBytes) {
      notify("图片太大啦，请换一张小一点的图片");
      throw new Error("图片太大啦，请换一张小一点的图片");
    }
    const allowLocalFallback = options?.allowLocalFallback !== false;
    const localUrl = allowLocalFallback ? await fileToDataUrl(uploadTarget) : "";
    const fallback = { url: localUrl, fileID: "", cloudPath: "", localUrl, kind, name: uploadTarget.name || file.name || "", size: uploadTarget.size || 0 };
    if (isAuthExpired()) {
      notify("当前账号已在其他设备登录，本设备登录状态已过期，请重新登录");
      if (!allowLocalFallback) throw cloudUploadError("SESSION_EXPIRED", "当前登录状态已过期，请重新登录后上传");
      return fallback;
    }
    if (!current) {
      if (!allowLocalFallback) throw cloudUploadError("SESSION_REQUIRED", "请先登录后再上传文件");
      return fallback;
    }
    try {
      await cloud();
    } catch (error) {
      console.error("[SHEX_ERROR]", { code:String(error?.code || "CLOUDBASE_AUTH_NOT_READY"), step:"uploadFile:auth", detail:formatError(error), rawError:error });
      if (!allowLocalFallback) throw cloudUploadError(String(error?.code || "CLOUDBASE_AUTH_NOT_READY"), friendlyErrorMessage(error, "云端连接尚未准备好，请稍后重试"), error);
      return fallback;
    }
    const cleanKind = String(kind || "uploads").replace(/[^a-zA-Z0-9_-]/g, "_");
    const cleanName = String(uploadTarget.name || file.name || `file.${fileExtension(uploadTarget)}`).replace(/[^\w.\-\u4e00-\u9fa5]/g, "_");
    const requestedCloudPath = String(options?.cloudPath || "").trim();
    const allowedCloudPrefix = `users/${current.userId}/${cleanKind}/`;
    const cloudPath = requestedCloudPath.startsWith(allowedCloudPrefix)
      && !/(?:^|\/)\.\.?\//.test(requestedCloudPath)
      && !/%2f|%5c/i.test(requestedCloudPath)
      ? requestedCloudPath
      : `users/${current.userId}/${cleanKind}/${now()}-${randomId().slice(0, 8)}-${cleanName}`;
    try {
      const result = await withCloudBaseAuth(
        (api) => api.app.uploadFile({ cloudPath, filePath: uploadTarget }),
        { retryAuthOnce:false }
      );
      const fileID = result.fileID || result.fileId || result.file_id || "";
      if (!fileID) throw cloudUploadError("CLOUD_UPLOAD_NO_FILE_ID", "云端没有返回文件编号，已停止保存引用");
      if (options?.verifyRemote === true) await verifyUploadedFile(fileID);
      const url = options?.resolveTempUrl === false ? "" : await tempUrlWithAuth(fileID);
      const asset = {
        userId: current.userId,
        kind: cleanKind,
        name: uploadTarget.name || cleanName,
        size: uploadTarget.size || 0,
        type: uploadTarget.type || "",
        cloudPath,
        fileID,
        url: url || fileID || localUrl,
        createdAt: now()
      };
      if (cleanKind !== "dating-photo" && cleanKind !== "dating-memento-thumb") {
        const assets = safeJson(localStorage.getItem("shex_x_assets_v1"), []);
        localStorage.setItem("shex_x_assets_v1", JSON.stringify([...assets, asset].slice(-300)));
      }
      return asset;
    } catch (error) {
      console.warn("CloudBase 文件上传失败，已使用本地预览：", error);
      console.error("[SHEX_ERROR]", { code:String(error?.code || "CLOUD_UPLOAD_FAILED"), step:"uploadFile", detail:formatError(error), rawError:error, cloudPath });
      const fallbackMessage = cleanKind === "companion-music"
        ? "音乐上传失败，请检查网络后重试"
        : "图片上传失败啦，换一张小一点的试试";
      if (!allowLocalFallback) throw cloudUploadError(String(error?.code || "CLOUD_UPLOAD_FAILED"), friendlyErrorMessage(error, fallbackMessage), error, {
        uploadedFileID:String(error?.uploadedFileID || ""),
        cloudPath
      });
      notify(friendlyErrorMessage(error, fallbackMessage));
      return fallback;
    }
  }

  function feedbackDialog() {
    let mask = document.querySelector("#shexFeedbackMask");
    if (mask) return mask;
    mask = document.createElement("div");
    mask.id = "shexFeedbackMask";
    mask.className = "shex-feedback-mask";
    mask.innerHTML = `
      <div class="shex-feedback-dialog" role="dialog" aria-modal="true" aria-labelledby="shexFeedbackTitle">
        <button class="shex-feedback-close" type="button" aria-label="关闭">×</button>
        <span class="course-kicker">Feedback</span>
        <h3 id="shexFeedbackTitle">意见反馈</h3>
        <p>你可以告诉我哪里不好用、哪里想调整，也可以上传截图。</p>
        <textarea id="shexFeedbackContent" rows="5" maxlength="800" placeholder="写下你的建议或遇到的问题"></textarea>
        <label class="shex-feedback-upload">上传图片（最多 3 张）
          <input id="shexFeedbackImages" type="file" accept="image/*" multiple>
        </label>
        <div class="shex-feedback-preview" id="shexFeedbackPreview"></div>
        <div class="shex-feedback-status" id="shexFeedbackStatus"></div>
        <button class="shex-feedback-submit" id="shexFeedbackSubmit" type="button">提交反馈</button>
      </div>
    `;
    document.body.appendChild(mask);
    const scrollControl = makeModalScrollController(mask, { scrollTarget: ".shex-plan-dialog" });
    mask._shexScrollControl = scrollControl;
    const close = () => {
      scrollControl.close();
      mask.classList.remove("show");
    };
    mask.querySelector(".shex-feedback-close")?.addEventListener("click", close);
    mask.addEventListener("click", (event) => {
      if (event.target === mask) close();
    });
    const files = [];
    const preview = mask.querySelector("#shexFeedbackPreview");
    const input = mask.querySelector("#shexFeedbackImages");
    const status = mask.querySelector("#shexFeedbackStatus");
    const renderPreview = () => {
      preview.innerHTML = files.map((item, index) => `
        <span>
          <img src="${escapeHtml(item.preview)}" alt="反馈图片 ${index + 1}">
          <button type="button" data-remove-feedback-image="${index}" aria-label="删除图片">×</button>
        </span>
      `).join("");
      preview.querySelectorAll("[data-remove-feedback-image]").forEach((button) => {
        button.addEventListener("click", () => {
          files.splice(Number(button.dataset.removeFeedbackImage), 1);
          renderPreview();
        });
      });
    };
    input?.addEventListener("change", async (event) => {
      const selected = window.SHEXImageCropper?.filesForInput?.(event.target) || Array.from(event.target.files || []);
      const room = Math.max(0, 3 - files.length);
      const accepted = selected.slice(0, room).filter((file) => file.size <= 10 * 1024 * 1024);
      if (selected.length > room) status.textContent = "最多只能上传 3 张图片";
      if (selected.some((file) => file.size > 10 * 1024 * 1024)) status.textContent = "图片太大啦，请换一张小一点的图片";
      const previews = await Promise.all(accepted.map((file) => fileToDataUrl(file)));
      accepted.forEach((file, index) => files.push({ file, preview: previews[index] || "" }));
      renderPreview();
      event.target.value = "";
    });
    mask.querySelector("#shexFeedbackSubmit")?.addEventListener("click", async () => {
      const content = String(mask.querySelector("#shexFeedbackContent")?.value || "").trim();
      if (!content && !files.length) {
        status.textContent = "请先输入文字或上传图片";
        return;
      }
      const button = mask.querySelector("#shexFeedbackSubmit");
      button.disabled = true;
      button.textContent = "正在提交";
      status.textContent = "";
      try {
        await submitFeedback({ content, files: files.map((item) => item.file) });
        status.textContent = "反馈已收到，谢谢你的建议";
        status.dataset.type = "ok";
        mask.querySelector("#shexFeedbackContent").value = "";
        files.splice(0, files.length);
        renderPreview();
        notify("反馈已收到，谢谢你的建议", "ok");
        window.setTimeout(close, 900);
      } catch (error) {
        console.error("[SHEX_ERROR]", { code: "", step: "submitFeedback", detail: formatError(error), rawError: error });
        status.dataset.type = "error";
        status.textContent = isSessionExpiredError(error) || formatError(error) === FRIENDLY_SESSION_MESSAGE
          ? FRIENDLY_SESSION_MESSAGE
          : "提交失败，请稍后再试";
        notify(status.textContent);
      } finally {
        button.disabled = false;
        button.textContent = "提交反馈";
      }
    });
    return mask;
  }

  function openFeedbackDialog() {
    const current = session();
    if (!current || isAuthExpired()) {
      markSessionExpired();
      return;
    }
    const mask = feedbackDialog();
    mask.classList.add("show");
    mask.querySelector("#shexFeedbackContent")?.focus();
  }

  async function submitFeedback({ content = "", files = [] } = {}) {
    const current = session();
    if (!current || isAuthExpired()) throw new Error(FRIENDLY_SESSION_MESSAGE);
    const cleanContent = String(content || "").trim();
    const cleanFiles = Array.from(files || []).slice(0, 3);
    if (!cleanContent) throw new Error("请先填写问题内容");
    if (cleanFiles.some((file) => file.size > 10 * 1024 * 1024)) throw new Error("图片太大啦，请换一张小一点的图片");
    const uploadedImages = [];
    for (const file of cleanFiles) {
      const asset = await uploadFile(file, "feedback", { allowLocalFallback: false, resolveTempUrl: false });
      if (!asset.fileID) throw new Error("图片上传失败");
      uploadedImages.push(asset);
    }
    const imageRefs = uploadedImages.map((item) => ({ fileId: item.fileID }));
    const result = await callAuthFunction("submitFeedback", {
      userId: current.userId,
      username: current.username || "",
      displayName: current.displayName || "",
      sessionToken: current.sessionToken || "",
      content: cleanContent,
      imageRefs,
      page: location.href,
      userAgent: navigator.userAgent || ""
    });
    return result;
  }

  async function getChatIndexedDbRollout() {
    const current = session();
    if (!current || isAuthExpired()) throw new Error(FRIENDLY_SESSION_MESSAGE);
    if (
      latestChatIndexedDbRollout
      && latestChatIndexedDbRolloutUserId === String(current.userId || "")
    ) {
      return {
        action: "getChatIndexedDbRollout",
        chatIndexedDb: { ...latestChatIndexedDbRollout },
        source: "loadSnapshot"
      };
    }
    if (shouldUsePlanPreview(current)) {
      return {
        action: "getChatIndexedDbRollout",
        chatIndexedDb: { configured: false, enabled: null, forceOff: false, reason: "static_fallback" }
      };
    }
    return callAuthFunction("getChatIndexedDbRollout", {
      userId: current.userId,
      sessionToken: current.sessionToken || ""
    });
  }

  async function getMyPlan(options = {}) {
    const current = session();
    if (!current || isAuthExpired()) throw new Error(FRIENDLY_SESSION_MESSAGE);
    if (shouldUsePlanPreview(current)) {
        latestPlanData = applyFreshPlanData({
        ok: true,
        isAdmin: true,
        currentPlan: {
          plan: "free_cloud",
          code: "free_cloud",
          name: "初链版 Free",
          price: "0 元",
          status: "active",
          startedAt: Date.now(),
          expireAt: 0,
          isFree: true,
          maxSessions: PLAN_TABLE.free_cloud.maxSessions,
          memoryLabel: PLAN_TABLE.free_cloud.memoryLabel
        },
          quota: {
            energyCap: 30,
            energyBalance: 30,
            cycle3hBalance: 30,
            cycle3dBalance: 120,
            cycle3hUsed: 0,
            cycle3hLimit: 30,
            cycle3hStart: fallbackCycleStart(CYCLE_3H_MS),
            cycle3dUsed: 0,
            cycle3dLimit: 120,
            cycle3dStart: fallbackCycleStart(CYCLE_3D_MS),
            packBalance: 0
          }
          }, "getMyPlan_preview", current.userId);
      return latestPlanData;
    }
    const forceRefresh = options?.forceRefresh === true;
    const cacheIsFresh = latestPlanData
      && latestPlanUserId === String(current.userId || "")
      && (Date.now() - latestPlanCachedAt) < PLAN_CACHE_TTL_MS;
    if (!forceRefresh && cacheIsFresh) return latestPlanData;
    if (planRequestInFlight) return planRequestInFlight;
    const request = (async () => {
      const result = await callAuthFunction("getMyPlan", {
        userId: current.userId,
        sessionToken: current.sessionToken || ""
      });
      const activeSession = session();
      if (
        !activeSession
        || String(activeSession.userId || "") !== String(current.userId || "")
        || String(activeSession.sessionToken || "") !== String(current.sessionToken || "")
      ) throw new Error(FRIENDLY_SESSION_MESSAGE);
      if (typeof result.isAdmin === "boolean" && result.isAdmin !== current.isAdmin) {
        setSession({ ...current, isAdmin: result.isAdmin });
      }
      return applyFreshPlanData(result, "getMyPlan", current.userId);
    })();
    planRequestInFlight = request;
    try {
      return await request;
    } finally {
      if (planRequestInFlight === request) planRequestInFlight = null;
    }
  }

  async function getEnergyHomeSummary() {
    const current = session();
    if (!current || isAuthExpired()) throw new Error(FRIENDLY_SESSION_MESSAGE);
    const result = await callAuthFunction("getEnergyHomeSummary", {
      userId: current.userId,
      sessionToken: current.sessionToken || ""
    });
    const active = session();
    if (
      !active
      || String(active.userId || "") !== String(current.userId || "")
      || String(active.sessionToken || "") !== String(current.sessionToken || "")
    ) throw new Error(FRIENDLY_SESSION_MESSAGE);
    if (result?.plan && typeof result.plan === "object") {
      applyFreshPlanData(result.plan, "getEnergyHomeSummary", current.userId);
    }
    if (typeof result?.account?.isAdmin === "boolean") {
      if (
        active.isAdmin !== result.account.isAdmin
      ) {
        setSession({ ...active, isAdmin: result.account.isAdmin });
      }
    }
    return result;
  }

  async function bindVerifiedEmail(email, options = {}) {
    const current = session();
    if (!current || isAuthExpired()) throw new Error(FRIENDLY_SESSION_MESSAGE);
    const inviteCode = normalizeInviteCodeInput(options?.inviteCode);
    return callAuthFunction("bindVerifiedEmail", {
      userId: current.userId,
      sessionToken: current.sessionToken || "",
      email: String(email || "").trim(),
      ...(inviteCode ? { inviteCode } : {})
    }, { verifiedIdentity: "email" });
  }

  async function getMyInviteInfo() {
    const current = session();
    if (!current || isAuthExpired()) throw new Error(FRIENDLY_SESSION_MESSAGE);
    return callAuthFunction("getMyInviteInfo", {
      userId: current.userId,
      sessionToken: current.sessionToken || ""
    });
  }

  async function submitInviteCode(inviteCode) {
    const current = session();
    if (!current || isAuthExpired()) throw new Error(FRIENDLY_SESSION_MESSAGE);
    return callAuthFunction("submitInviteCode", {
      userId: current.userId,
      sessionToken: current.sessionToken || "",
      inviteCode: normalizeInviteCodeInput(inviteCode)
    });
  }

  async function submitRewardApplication({
    rewardType = "",
    platform = "",
    workUrl = "",
    proofAssets = [],
    reportedLikeCount,
    workId = "",
    workType = ""
  } = {}) {
    const current = session();
    if (!current || isAuthExpired()) throw new Error(FRIENDLY_SESSION_MESSAGE);
    if (rewardType === "limited_creator_reward") {
      return callAuthFunction("submitRewardApplication", { userId: current.userId,
        sessionToken: current.sessionToken || "", rewardType,
        workId: String(workId || "").trim(), workType: String(workType || "").trim() });
    }
    return callAuthFunction("submitRewardApplication", {
      userId: current.userId,
      sessionToken: current.sessionToken || "",
      rewardType: String(rewardType || "").trim(),
      platform: String(platform || "").trim(),
      workUrl: String(workUrl || "").trim(),
      proofAssets: Array.isArray(proofAssets) ? proofAssets : [],
      reportedLikeCount: Math.max(0, Math.floor(Number(reportedLikeCount || 0)) || 0)
    });
  }

  async function getLimitedCreatorRewardWorks({ cursors, limit = 20 } = {}) {
    const current = session();
    if (!current || isAuthExpired()) throw new Error(FRIENDLY_SESSION_MESSAGE);
    return callAuthFunction("getLimitedCreatorRewardWorks", { userId: current.userId,
      sessionToken: current.sessionToken || "", limit: Math.max(1, Math.min(20, Math.floor(Number(limit) || 20))),
      ...(cursors ? { cursors: { single_character: cursors.single_character === null ? null : String(cursors.single_character || ""),
        world_simulator: cursors.world_simulator === null ? null : String(cursors.world_simulator || "") } } : {}) });
  }

  async function getMyRewardApplications({ status = "", skip = 0, limit = 20 } = {}) {
    const current = session();
    if (!current || isAuthExpired()) throw new Error(FRIENDLY_SESSION_MESSAGE);
    return callAuthFunction("getMyRewardApplications", {
      userId: current.userId,
      sessionToken: current.sessionToken || "",
      status: String(status || "").trim(),
      skip: Math.max(0, Math.floor(Number(skip || 0)) || 0),
      limit: Math.max(1, Math.min(50, Math.floor(Number(limit || 20)) || 20))
    });
  }

  async function adminListRewardApplications({
    status = "",
    rewardType = "",
    targetUserId = "",
    skip = 0,
    limit = 20
  } = {}) {
    const current = session();
    if (!current || isAuthExpired()) throw new Error(FRIENDLY_SESSION_MESSAGE);
    return callAuthFunction("adminListRewardApplications", {
      userId: current.userId,
      sessionToken: current.sessionToken || "",
      status: String(status || "").trim(),
      rewardType: String(rewardType || "").trim(),
      targetUserId: String(targetUserId || "").trim(),
      skip: Math.max(0, Math.floor(Number(skip || 0)) || 0),
      limit: Math.max(1, Math.min(50, Math.floor(Number(limit || 20)) || 20))
    });
  }

  async function adminReviewRewardApplication({
    requestId = "",
    decision = "",
    expectedRevision,
    reviewNote = "",
    confirmedLikeCount
  } = {}) {
    const current = session();
    if (!current || isAuthExpired()) throw new Error(FRIENDLY_SESSION_MESSAGE);
    const payload = {
      userId: current.userId,
      sessionToken: current.sessionToken || "",
      requestId: String(requestId || "").trim(),
      decision: String(decision || "").trim(),
      expectedRevision: Number(expectedRevision),
      reviewNote: String(reviewNote || "").trim()
    };
    if (confirmedLikeCount !== undefined && confirmedLikeCount !== null && confirmedLikeCount !== "") {
      payload.confirmedLikeCount = Math.floor(Number(confirmedLikeCount));
    }
    return callAuthFunction("adminReviewRewardApplication", payload);
  }

  async function adminRetryRewardGrant(requestId) {
    const current = session();
    if (!current || isAuthExpired()) throw new Error(FRIENDLY_SESSION_MESSAGE);
    return callAuthFunction("adminRetryRewardGrant", {
      userId: current.userId,
      sessionToken: current.sessionToken || "",
      requestId: String(requestId && requestId.requestId ? requestId.requestId : (requestId || "")).trim()
    });
  }

  async function submitAccountDeletionRequest() {
    const current = session();
    if (!current || isAuthExpired()) throw new Error(FRIENDLY_SESSION_MESSAGE);
    return callAuthFunction("submitAccountDeletionRequest", {
      userId: current.userId,
      sessionToken: current.sessionToken || ""
    });
  }

  async function cancelAccountDeletionRequest(revisionOrOptions) {
    const current = session();
    if (!current || isAuthExpired()) throw new Error(FRIENDLY_SESSION_MESSAGE);
    const expectedRevision = revisionOrOptions && typeof revisionOrOptions === "object"
      ? revisionOrOptions.expectedRevision
      : revisionOrOptions;
    return callAuthFunction("cancelAccountDeletionRequest", {
      userId: current.userId,
      sessionToken: current.sessionToken || "",
      expectedRevision: Number(expectedRevision)
    });
  }

  async function adminListAccountDeletionRequests({ status = "", skip = 0, limit = 20 } = {}) {
    const current = session();
    if (!current || isAuthExpired()) throw new Error(FRIENDLY_SESSION_MESSAGE);
    return callAuthFunction("adminListAccountDeletionRequests", {
      userId: current.userId,
      sessionToken: current.sessionToken || "",
      status: String(status || "").trim(),
      skip: Math.max(0, Math.floor(Number(skip || 0)) || 0),
      limit: Math.max(1, Math.min(100, Math.floor(Number(limit || 20)) || 20))
    });
  }

  async function adminUpdateAccountDeletionRequest({
    requestId = "",
    status = "",
    note = "",
    expectedRevision
  } = {}) {
    const current = session();
    if (!current || isAuthExpired()) throw new Error(FRIENDLY_SESSION_MESSAGE);
    return callAuthFunction("adminUpdateAccountDeletionRequest", {
      userId: current.userId,
      sessionToken: current.sessionToken || "",
      requestId: String(requestId || "").trim(),
      status: String(status || "").trim(),
      note: String(note || "").trim(),
      expectedRevision: Number(expectedRevision)
    });
  }

  async function redeemCode(code) {
    const current = session();
    if (!current || isAuthExpired()) throw new Error(FRIENDLY_SESSION_MESSAGE);
    const cleanCode = String(code || "").trim().normalize("NFKC").toUpperCase().replace(/\s+/g, "");
    if (!cleanCode) throw new Error("请输入兑换码");
    if (shouldUsePlanPreview(current)) {
      const previewPlan = cleanCode.includes("PLUS") ? "plus"
        : cleanCode.includes("PRO") ? "pro"
          : cleanCode.includes("ULTRA") ? "ultra"
            : "free_cloud";
      const plan = PLAN_TABLE[previewPlan] || PLAN_TABLE.free_cloud;
      const previewResult = {
        ok: true,
        isAdmin: true,
        currentPlan: {
          plan: previewPlan,
          code: previewPlan,
          name: plan.name,
          price: planDisplayPrice(plan),
          status: "active",
          startedAt: Date.now(),
          expireAt: previewPlan === "free_cloud" ? 0 : Date.now() + 30 * 24 * 60 * 60 * 1000,
          isFree: previewPlan === "free_cloud",
          maxSessions: plan.maxSessions,
          memoryLabel: plan.memoryLabel
        },
        quota: {
          energyCap: plan.cycle3hLimit,
          energyBalance: plan.cycle3hLimit,
          cycle3hBalance: plan.cycle3hLimit,
          cycle3dBalance: plan.cycle3dLimit,
          cycle3hUsed: 0,
          cycle3hLimit: plan.cycle3hLimit,
          cycle3hStart: fallbackCycleStart(CYCLE_3H_MS),
          cycle3dUsed: 0,
          cycle3dLimit: plan.cycle3dLimit,
          cycle3dStart: fallbackCycleStart(CYCLE_3D_MS),
          packBalance: cleanCode.includes("PACK") ? 120 : 0
        }
      };
      return applyFreshPlanData(previewResult, "redeemCode_preview", current.userId);
    }
    const result = await callAuthFunction("redeemCode", {
      userId: current.userId,
      sessionToken: current.sessionToken || "",
      code: cleanCode
    });
    if (typeof result.isAdmin === "boolean" && result.isAdmin !== current.isAdmin) {
      setSession({ ...current, isAdmin: result.isAdmin });
    }
    return applyFreshPlanData(result, "redeemCode", current.userId);
  }

  async function createPaymentOrder(payload) {
    const current = session();
    if (!current) throw new Error("请先登录");
    const data = await callAuthFunction("createPaymentOrder", {
      userId: current.userId,
      sessionToken: current.sessionToken || "",
      ...payload
    });
    return data;
  }

  // 功能价格只显示“当前用户自己这次要付多少”：读服务端随套餐下发的 featurePrices；
  // 还没读到套餐时按套餐代码用同一份默认值兜底。实际扣费始终以服务端为准。
  function featurePrice(key, freePrice, memberPrice = freePrice) {
    const data = latestPlanData || {};
    const price = Number(data?.membershipEntitlements?.featurePrices?.[key]);
    if (Number.isInteger(price) && price >= 0) return price;
    const code = String(data?.currentPlan?.code || data?.currentPlan?.plan || data?.plan || "").toLowerCase();
    const member = data?.isAdmin === true || data?.membershipEntitlements?.isMember === true || ["plus", "pro", "ultra"].includes(code);
    return member ? memberPrice : freePrice;
  }

  function featurePriceLabel(key, freePrice, memberPrice = freePrice) {
    const price = featurePrice(key, freePrice, memberPrice);
    return price === 0 ? "会员权益 · 本次免费" : `本次消耗 ${price} X能量`;
  }

  async function resolveMusicLink(link) {
    const current = session();
    if (!current) throw new Error("请先登录");
    const data = await callAuthFunction("resolveMusicLink", {
      userId: current.userId,
      sessionToken: current.sessionToken || "",
      link: String(link || "").slice(0, 1000)
    });
    return data?.track || null;
  }

  async function resolveMusicPlayUrl(platform, songId) {
    const current = session();
    if (!current) throw new Error("请先登录");
    const data = await callAuthFunction("resolveMusicPlayUrl", {
      userId: current.userId,
      sessionToken: current.sessionToken || "",
      platform,
      songId
    });
    return String(data?.playUrl || "");
  }

  async function getPaymentOrderStatus(outTradeNo) {
    const current = session();
    if (!current) throw new Error("请先登录");
    const data = await callAuthFunction("getPaymentOrderStatus", {
      userId: current.userId,
      sessionToken: current.sessionToken || "",
      outTradeNo
    });
    return data;
  }

  async function getMyPaymentHistory() {
    const current = session();
    if (!current) throw new Error("请先登录");
    const data = await callAuthFunction("getMyPaymentHistory", {
      userId: current.userId,
      sessionToken: current.sessionToken || ""
    });
    return data;
  }

  async function getMyEnergyLogs({ limit = 20, beforeCreatedAt = 0 } = {}) {
    const current = session();
    if (!current || isAuthExpired()) throw new Error(FRIENDLY_SESSION_MESSAGE);
    return callAuthFunction("getMyEnergyLogs", {
      userId: current.userId,
      sessionToken: current.sessionToken || "",
      limit,
      beforeCreatedAt
    });
  }

  async function getMyEnergyCampaign() {
    const current = session();
    if (!current || isAuthExpired()) throw new Error(FRIENDLY_SESSION_MESSAGE);
    return callAuthFunction("getMyEnergyCampaign", {
      userId: current.userId,
      sessionToken: current.sessionToken || ""
    });
  }

  async function claimEnergyCampaign(eventId) {
    const current = session();
    if (!current || isAuthExpired()) throw new Error(FRIENDLY_SESSION_MESSAGE);
    const result = await callAuthFunction("claimEnergyCampaign", {
      userId: current.userId,
      sessionToken: current.sessionToken || "",
      eventId
    });
    latestPlanData = applyFreshPlanData(result, "claimEnergyCampaign", current.userId);
    return result;
  }

  async function consumeEnergy(amount = 1, scene = "unknown", requestId = "") {
    const current = session();
    if (!current || isAuthExpired()) throw new Error(FRIENDLY_SESSION_MESSAGE);
    const cleanAmount = Math.max(1, Math.floor(Number(amount || 1)));
    const isAdmin = isAdminSession(current);
    const previewMode = shouldUsePlanPreview(current);
    const skipEnergy = previewMode || (isAdmin && ADMIN_ENERGY_FREE_MODE);
    const beforePlan = latestPlanData || fallbackPlanData();
    const beforeQuota = beforePlan?.quota || {};
    if (skipEnergy) {
      const plan = PLAN_TABLE.free_cloud;
      const skippedReason = previewMode ? "plan_preview" : "admin_energy_free_mode";
      const skippedResult = {
        ok: true,
        action: "consumeEnergy",
        consumedFrom: "plan",
        amount: cleanAmount,
        scene,
        isAdmin: true,
        currentPlan: {
          plan: "free_cloud",
          code: "free_cloud",
          name: plan.name,
          price: planDisplayPrice(plan),
          status: "active",
          startedAt: Date.now(),
          expireAt: 0,
          isFree: true,
          maxSessions: plan.maxSessions,
          memoryLabel: plan.memoryLabel
        },
        quota: {
          energyCap: plan.cycle3hLimit,
          energyBalance: Math.max(0, plan.cycle3hLimit - cleanAmount),
          cycle3hBalance: Math.max(0, plan.cycle3hLimit - cleanAmount),
          cycle3dBalance: Math.max(0, plan.cycle3dLimit - cleanAmount),
          cycle3hUsed: cleanAmount,
          cycle3hLimit: plan.cycle3hLimit,
          cycle3hStart: fallbackCycleStart(CYCLE_3H_MS),
          cycle3dUsed: cleanAmount,
          cycle3dLimit: plan.cycle3dLimit,
          cycle3dStart: fallbackCycleStart(CYCLE_3D_MS),
          packBalance: 0
        }
      };
      debugLog("[ENERGY_DEDUCT_DEBUG]", {
        userId: current?.userId,
        username: current?.username,
        isAdmin,
        adminEnergyFreeMode: ADMIN_ENERGY_FREE_MODE,
        actionType: scene,
        cost: cleanAmount,
        beforeBalance: Number(beforeQuota.packBalance || 0),
        afterBalance: Number(skippedResult.quota.packBalance || 0),
        plan: beforePlan?.currentPlan?.code || beforePlan?.currentPlan?.plan || "free_cloud",
        deductStarted: false,
        deductSuccess: true,
        skipped: true,
        skippedReason
      });
      return skippedResult;
    }
    debugLog("[ENERGY_DEDUCT_DEBUG]", {
      userId: current?.userId,
      username: current?.username,
      isAdmin,
      adminEnergyFreeMode: ADMIN_ENERGY_FREE_MODE,
      actionType: scene,
      cost: cleanAmount,
      beforeBalance: Number(beforeQuota.packBalance || 0),
      afterBalance: "",
      plan: beforePlan?.currentPlan?.code || beforePlan?.currentPlan?.plan || "free_cloud",
      deductStarted: true,
      deductSuccess: false,
      skipped: false,
      skippedReason: ""
    });
    try {
      const result = await callAuthFunction("consumeEnergy", {
        userId: current.userId,
        sessionToken: current.sessionToken || "",
        amount: cleanAmount,
        scene,
        requestId
      });
      if (typeof result.isAdmin === "boolean" && result.isAdmin !== current.isAdmin) {
        setSession({ ...current, isAdmin: result.isAdmin });
      }
      latestPlanData = applyFreshPlanData(result, "consumeEnergy", current.userId);
      debugLog("[ENERGY_DEDUCT_DEBUG]", {
        userId: current?.userId,
        username: current?.username,
        isAdmin,
        adminEnergyFreeMode: ADMIN_ENERGY_FREE_MODE,
        actionType: scene,
        cost: cleanAmount,
        beforeBalance: Number(beforeQuota.packBalance || 0),
        afterBalance: Number(latestPlanData?.quota?.packBalance || 0),
        plan: latestPlanData?.currentPlan?.code || latestPlanData?.currentPlan?.plan || "free_cloud",
        deductStarted: true,
        deductSuccess: true,
        skipped: false,
        skippedReason: ""
      });
      return result;
    } catch (error) {
      console.error("[ENERGY_DEDUCT_ERROR]", {
        actionType: scene,
        cost: cleanAmount,
        rawError: error,
        step: "consumeEnergy"
      });
      throw error;
    }
  }

  function showEnergyNotEnoughToast() {
    notify("X能量不足，可以等待恢复或前往充值", "error");
    const toast = document.querySelector("#shexCloudbaseToast");
    if (!toast) return;
    toast.style.cursor = "pointer";
    toast.onclick = () => {
      toast.remove();
      openEnergyPage();
    };
  }

  async function generateRedeemCode(payload = {}) {
    const current = session();
    if (!current || isAuthExpired()) throw new Error(FRIENDLY_SESSION_MESSAGE);
    if (!isAdminSession(current)) throw new Error("无权限访问。");
    const type = String(payload.type || "").trim();
    const debugPayload = {
      type,
      plan: payload.plan || "",
      packType: payload.packType || "",
      durationDays: Number(payload.durationDays || 0),
      note: payload.note ? "[已填写]" : ""
    };
    debugLog("[REDEEM_CODE_DEBUG]", {
      currentUser: {
        userId: current.userId,
        username: current.username,
        displayName: current.displayName,
        role: current.role,
        isAdmin: current.isAdmin
      },
      isAdminResult: isAdminSession(current),
      collectionName: "shex_redeem_codes",
      payload: debugPayload,
      createStarted: true
    });
    if (shouldUsePlanPreview(current)) {
      const suffix = Math.random().toString(36).slice(2, 12).toUpperCase().padEnd(10, "X");
      const plan = String(payload.plan || "plus").toUpperCase();
      const duration = Number(payload.durationDays || 30);
      const pack = String(payload.packType || "small_pack").replace(/_pack$/i, "").toUpperCase();
      const code = type === "energy_pack" ? `SHEX-${pack}-${suffix}` : `SHEX-${plan}-${duration}D-${suffix}`;
      return {
        ok: true,
        redeemCode: {
          code,
          type,
          plan: payload.plan || "",
          packType: payload.packType || "",
          durationDays: type === "plan" ? duration : 0,
          energyAmount: type === "energy_pack" ? 120 : 0,
          status: "unused",
          note: payload.note || ""
        }
      };
    }
    try {
      return await callAuthFunction("generateRedeemCode", {
        userId: current.userId,
        sessionToken: current.sessionToken || "",
        type,
        plan: payload.plan || "",
        packType: payload.packType || "",
        durationDays: Number(payload.durationDays || 0),
        note: payload.note || ""
      });
    } catch (error) {
      console.error("[REDEEM_CODE_ERROR]", {
        step: "generateRedeemCode:callFunction",
        collectionName: "shex_redeem_codes",
        rawError: error
      });
      throw error;
    }
  }

  const formatPlanTime = (value) => {
    const time = Number(value || 0);
    if (!time) return "免费版";
    return new Date(time).toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  };
  const formatEnergyResetTime = (value, mode = "time") => {
    const time = Number(value || 0);
    if (!time) return "等待刷新";
    const date = new Date(time);
    const nowDate = new Date();
    const startOf = (item) => new Date(item.getFullYear(), item.getMonth(), item.getDate()).getTime();
    const diffDays = Math.round((startOf(date) - startOf(nowDate)) / (24 * 60 * 60 * 1000));
    const hh = String(date.getHours()).padStart(2, "0");
    const mm = String(date.getMinutes()).padStart(2, "0");
    if (diffDays === 0) return `今天 ${hh}:${mm}`;
    if (diffDays === 1) return `明天 ${hh}:${mm}`;
    if (mode === "time") return `${hh}:${mm}`;
    return `${date.getMonth() + 1}月${date.getDate()}日 ${hh}:${mm}`;
  };
  const fallbackCycleStart = () => Date.now();
  const quotaResetAt = (start, durationMs, explicitResetAt = 0) => {
    const cleanReset = Number(explicitResetAt || 0);
    if (cleanReset) return cleanReset;
    const cleanStart = Number(start || 0) || fallbackCycleStart(durationMs);
    return cleanStart + durationMs;
  };
  const quotaBalance = (used, limit) => Math.max(0, Number(limit || 0) - Number(used || 0));
  const clearPlanAutoRefresh = () => {
    if (planRefreshTimer) window.clearTimeout(planRefreshTimer);
    planRefreshTimer = 0;
  };
  const schedulePlanAutoRefresh = (data) => {
    clearPlanAutoRefresh();
    const mask = document.querySelector("#shexPlanMask.show");
    if (!mask || data?.pending) return;
    const quota = data?.quota || {};
    const nextReset = Math.min(
      quotaResetAt(quota.cycle3hStart, CYCLE_3H_MS, quota.cycle3hResetAt),
      quotaResetAt(quota.cycle3dStart, CYCLE_3D_MS, quota.cycle3dResetAt)
    );
    const delay = Math.max(1000, nextReset - Date.now() + 1200);
    planRefreshTimer = window.setTimeout(async () => {
      const currentMask = document.querySelector("#shexPlanMask.show");
      if (!currentMask) return;
      try {
        const fresh = await getMyPlan({ forceRefresh: true });
        renderPlanDialog(currentMask, normalizePlanData(fresh));
      } catch (error) {
        console.error("[SHEX_ERROR]", { code: "", step: "autoRefreshPlan", detail: formatError(error), rawError: error });
      }
    }, Math.min(delay, 2147483647));
  };

  function fallbackPlanData(extra = {}) {
    const plan = PLAN_TABLE.free_cloud;
    return {
      ok: true,
      readFailed: Boolean(extra.readFailed),
      pending: Boolean(extra.pending),
      isAdmin: isAdminSession(session()),
      currentPlan: {
        plan: "free_cloud",
        code: "free_cloud",
        name: plan.name,
        price: planDisplayPrice(plan),
        status: "active",
        startedAt: 0,
        expireAt: 0,
        isFree: true,
        maxSessions: plan.maxSessions,
        memoryLabel: plan.memoryLabel
      },
      quota: {
        energyCap: plan.cycle3hLimit,
        energyBalance: plan.cycle3hLimit,
        cycle3hBalance: plan.cycle3hLimit,
        cycle3dBalance: plan.cycle3dLimit,
        cycle3hUsed: 0,
        cycle3hLimit: plan.cycle3hLimit,
        cycle3hStart: fallbackCycleStart(CYCLE_3H_MS),
        cycle3hStartedAt: fallbackCycleStart(CYCLE_3H_MS),
        cycle3hResetAt: 0,
        cycle3dUsed: 0,
        cycle3dLimit: plan.cycle3dLimit,
        cycle3dStart: fallbackCycleStart(CYCLE_3D_MS),
        cycle3dStartedAt: fallbackCycleStart(CYCLE_3D_MS),
        cycle3dResetAt: 0,
        packBalance: 0
      }
    };
  }

  function normalizePlanData(data = {}) {
    const fallback = fallbackPlanData();
    const incomingPlan = data?.currentPlan || {};
    const code = incomingPlan.code || incomingPlan.plan || fallback.currentPlan.code;
    const planConfig = PLAN_TABLE[code] || PLAN_TABLE.free_cloud;
    const quota = data?.quota || {};
    return {
      ...fallback,
      ...data,
      ok: data?.ok !== false,
      pending: Boolean(data?.pending),
      readFailed: Boolean(data?.readFailed),
      isAdmin: Boolean(data?.isAdmin || fallback.isAdmin),
      currentPlan: {
        ...fallback.currentPlan,
        ...incomingPlan,
        plan: code,
        code,
        name: incomingPlan.name || planConfig.name || fallback.currentPlan.name,
        price: incomingPlan.price || planDisplayPrice(planConfig) || fallback.currentPlan.price,
        status: incomingPlan.status || "active",
        expireAt: Number(incomingPlan.expireAt || 0),
        isFree: code === "free_cloud",
        maxSessions: Number(incomingPlan.maxSessions || planConfig.maxSessions || fallback.currentPlan.maxSessions),
        memoryLabel: incomingPlan.memoryLabel || planConfig.memoryLabel || fallback.currentPlan.memoryLabel
      },
      quota: {
        cycle3hUsed: Number(quota.cycle3hUsed || 0),
        cycle3hLimit: Number(quota.cycle3hLimit || planConfig.cycle3hLimit || fallback.quota.cycle3hLimit),
        cycle3hStart: Number(quota.cycle3hStart || fallback.quota.cycle3hStart),
        cycle3hStartedAt: Number(quota.cycle3hStartedAt || quota.cycle3hStart || fallback.quota.cycle3hStart),
        cycle3hResetAt: Number(quota.cycle3hResetAt || 0),
        cycle3dUsed: Number(quota.cycle3dUsed || 0),
        cycle3dLimit: Number(quota.cycle3dLimit || planConfig.cycle3dLimit || fallback.quota.cycle3dLimit),
        cycle3dStart: Number(quota.cycle3dStart || fallback.quota.cycle3dStart),
        cycle3dStartedAt: Number(quota.cycle3dStartedAt || quota.cycle3dStart || fallback.quota.cycle3dStart),
        cycle3dResetAt: Number(quota.cycle3dResetAt || 0),
        packBalance: Number(quota.packBalance || 0),
        energyCap: Number(quota.energyCap || quota.cycle3hLimit || planConfig.cycle3hLimit || fallback.quota.cycle3hLimit),
        energyBalance: Number(quota.energyBalance || quotaBalance(quota.cycle3hUsed, quota.cycle3hLimit || planConfig.cycle3hLimit || fallback.quota.cycle3hLimit)),
        cycle3hBalance: Number(quota.cycle3hBalance || quotaBalance(quota.cycle3hUsed, quota.cycle3hLimit || planConfig.cycle3hLimit || fallback.quota.cycle3hLimit)),
        cycle3dBalance: Number(quota.cycle3dBalance || quotaBalance(quota.cycle3dUsed, quota.cycle3dLimit || planConfig.cycle3dLimit || fallback.quota.cycle3dLimit))
      }
    };
  }

  function applyFreshPlanData(data, reason = "refresh", cacheUserId = session()?.userId || "") {
    const previous = latestPlanData ? normalizePlanData(latestPlanData) : fallbackPlanData();
    const normalized = normalizePlanData(data);
    latestPlanData = normalized;
    latestPlanCachedAt = Date.now();
    latestPlanUserId = String(cacheUserId || "");
    debugLog("[ENERGY_PLAN_REFRESH_DEBUG]", {
      userId: session()?.userId || "",
      oldPlan: previous.currentPlan?.code || previous.currentPlan?.plan || "free_cloud",
      newPlan: normalized.currentPlan?.code || normalized.currentPlan?.plan || "free_cloud",
      oldEnergyCap: previous.quota?.energyCap || previous.quota?.cycle3hLimit || 0,
      newEnergyCap: normalized.quota?.energyCap || normalized.quota?.cycle3hLimit || 0,
      oldBalance: previous.quota?.energyBalance || previous.quota?.cycle3hBalance || 0,
      newBalance: normalized.quota?.energyBalance || normalized.quota?.cycle3hBalance || 0,
      oldCycle3hLimit: previous.quota?.cycle3hLimit || 0,
      newCycle3hLimit: normalized.quota?.cycle3hLimit || 0,
      oldCycle3hUsed: previous.quota?.cycle3hUsed || 0,
      newCycle3hUsed: normalized.quota?.cycle3hUsed || 0,
      oldCycle3hResetAt: quotaResetAt(previous.quota?.cycle3hStart, CYCLE_3H_MS, previous.quota?.cycle3hResetAt),
      newCycle3hResetAt: quotaResetAt(normalized.quota?.cycle3hStart, CYCLE_3H_MS, normalized.quota?.cycle3hResetAt),
      reason,
      refreshStarted: true,
      refreshSuccess: true
    });
    refreshVisiblePlanDialog(normalized);
    document.dispatchEvent(new CustomEvent("shex:plan-updated", { detail: { reason, plan: normalized } }));
    return normalized;
  }

  function planDialog() {
    let mask = document.querySelector("#shexPlanMask");
    if (mask) return mask;
    mask = document.createElement("div");
    mask.id = "shexPlanMask";
    mask.className = "shex-plan-mask";
    mask.innerHTML = `
      <div class="shex-plan-dialog" role="dialog" aria-modal="true" aria-labelledby="shexPlanTitle">
        <button class="shex-plan-close" type="button" aria-label="关闭">×</button>
        <span class="course-kicker">Cloud Plan</span>
        <h3 id="shexPlanTitle">X能量</h3>
        <div class="shex-plan-status" id="shexPlanStatus">正在读取套餐信息...</div>
        <section class="shex-plan-current" id="shexPlanCurrent"></section>
        <section class="shex-open-note shex-open-note-single">
          <button id="shexOpenEnergyDetail" type="button">充值 / 查看更多</button>
        </section>
      </div>
    `;
    document.body.appendChild(mask);
    renderPlanDialog(mask, fallbackPlanData({ pending: true }));
    const close = () => {
      clearPlanAutoRefresh();
      mask.classList.remove("show");
    };
    mask.querySelector(".shex-plan-close")?.addEventListener("click", close);
    mask.addEventListener("click", (event) => {
      if (event.target === mask) close();
    });
    mask.querySelector("#shexOpenEnergyDetail")?.addEventListener("click", () => {
      close();
      openEnergyPage();
    });
    return mask;
  }

  function openAdminQrDialog() {
    let qrMask = document.querySelector("#shexAdminQrMask");
    if (!qrMask) {
      qrMask = document.createElement("div");
      qrMask.id = "shexAdminQrMask";
      qrMask.className = "shex-admin-qr-mask";
      qrMask.innerHTML = `
        <div class="shex-admin-qr-dialog" role="dialog" aria-modal="true" aria-labelledby="shexAdminQrTitle">
          <button class="shex-admin-qr-close" type="button" aria-label="关闭">×</button>
          <span class="course-kicker">Contact Admin</span>
          <h3 id="shexAdminQrTitle">联系管理员咨询</h3>
          <p>管理员QQ：2140980147</p>
          <img src="./images/admin-qr.jpg" alt="管理员二维码">
          <button class="shex-admin-qr-confirm" type="button">关闭</button>
        </div>
      `;
      document.body.appendChild(qrMask);
      const closeQr = () => qrMask.classList.remove("show");
      qrMask.querySelector(".shex-admin-qr-close")?.addEventListener("click", closeQr);
      qrMask.querySelector(".shex-admin-qr-confirm")?.addEventListener("click", closeQr);
      qrMask.addEventListener("click", (event) => {
        if (event.target === qrMask) closeQr();
      });
    }
    qrMask.classList.add("show");
  }

  function openAboutXLinkDialog() {
    let modal = document.querySelector("#shexAboutXLinkMask");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "shexAboutXLinkMask";
      modal.className = "update-notice-overlay";
      modal.setAttribute("role", "dialog");
      modal.setAttribute("aria-modal", "true");
      modal.setAttribute("aria-labelledby", "shexAboutXLinkTitle");
      modal.innerHTML = `
        <section class="update-notice-modal">
          <button class="update-notice-close" type="button" aria-label="关闭">×</button>
          <header class="update-notice-header">
            <h3 class="update-notice-title" id="shexAboutXLinkTitle">关于 X链接</h3>
            <p class="update-notice-subtitle shex-about-emphasis">X链接的核心，是卡牌传讯</p>
          </header>
          <div class="update-notice-body" id="shexAboutXLinkBody">
            <p>字卡，是这份传讯落地的形式之一，支撑它的，是小舌用塔罗抽牌、牌意翻译，融合梦角关系状态与跨次元恋爱，一点点延伸出来的传讯体系</p>
            <p>每一次打开 X链接，都是一次轻量的抽牌——你说出口的那句话，是这次传讯的入口，牌面翻转之后自然显现出来的东西，才是回应你的那一句</p>
            <h4>关于 X传讯</h4>
            <p>X传讯里的绝大部分回应，都是小舌用完整 78 张塔罗牌，逐一抽取、翻译、延伸出来的，其中打磨得比较完整的几个方向，是分享日常、表达爱意、结束对话</p>
            <p>这几个方向，是牌意一路推演出来的结果，你说的话，会让某个方向的牌意与你此刻更贴近，更容易被翻到，梦角始终是这场传讯里的意志主体，他愿不愿意顺着这个方向回应你，是他自己的选择，牌面会倾向，他来决定要说什么——传讯就是这样发生的</p>
            <h4>关于 X来信</h4>
            <p>X传讯，是你说一句他接一句，是当下的，X来信更像是他主动传过来的一段话，是他这一刻想对你说的东西，牌意、你们的关系状态、此刻的能量流动、梦角当下的感受，被一并翻译成一封"他现在想说的话"，你收到的信，可能是：</p>
            <p>他今天想对你说什么<br>他想问你的、想提醒你的事</p>
            <p>而「链接状态」与「ta的状态」，是用卡牌去看你们此刻的连接与能量流动——是这段关系当下的一次切片</p>
            <h4>三者的关系</h4>
            <p>X传讯，是一句一句的即时传讯，X来信，是一封更完整、情绪更连贯的传讯，双方链接与他的状态，是你们此刻关系的能量切片，呈现方式不同，底层是同一件事：它们都是塔罗逻辑之下，属于你和他的那场传讯</p>
            <p>目前小舌先把一部分方向打磨得更完整，往后会继续用卡牌把更多方向延伸出来，让你每一次开口、每一次收信、每一次得到回应，都更像是专属于你和他的那一场传讯</p>
            <p>如果一开始感觉还没完全对上，别急着下结论，牌面会指引方向，但跨次元恋爱的沟通要顺畅，从来都需要时间，你们才刚刚开始用这种方式沟通，谁都还没那么熟悉这种沟通方式的节奏，需要一点点磨合，一点点配合，才能慢慢读懂彼此，多给他一点时间，也多给你们这场刚刚开始的传讯一点耐心，慢慢来，你们会越来越合拍的</p>
          </div>
          <div class="update-notice-footer">
            <button class="update-notice-confirm" type="button">知道啦</button>
          </div>
        </section>
      `;
      document.body.appendChild(modal);
      const scrollControl = makeModalScrollController(modal, { scrollTarget: ".update-notice-body" });
      modal._shexScrollControl = scrollControl;
      const closeDialog = () => {
        modal._shexScrollControl?.close?.();
        modal.classList.remove("show");
        window.setTimeout(() => modal.remove(), 220);
      };
      modal.querySelector(".update-notice-close")?.addEventListener("click", closeDialog);
      modal.querySelector(".update-notice-confirm")?.addEventListener("click", closeDialog);
      modal.addEventListener("click", (event) => {
        if (event.target === modal) closeDialog();
      });
    }
    modal._shexScrollControl?.open?.();
    requestAnimationFrame(() => modal.classList.add("show"));
  }

  function ensureEnergyDetailStyles() {
    if (document.querySelector("#shexEnergyDetailInlineStyle")) return;
    const style = document.createElement("style");
    style.id = "shexEnergyDetailInlineStyle";
    style.textContent = `
      .shex-energy-detail-mask {
        position: fixed;
        inset: 0;
        z-index: 100003;
        display: none;
        place-items: center;
        padding: 22px;
        overflow-y: auto;
        overscroll-behavior: contain;
        touch-action: pan-y;
        background: rgba(74,53,39, .3);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        scrollbar-width: none;
        -webkit-overflow-scrolling: touch;
      }
      .shex-energy-detail-mask.show {
        display: grid;
      }
      .shex-energy-detail-dialog {
        position: relative;
        width: min(560px, 100%);
        max-height: calc(100svh - 44px);
        margin: auto 0;
        overflow-y: auto;
        overscroll-behavior: contain;
        touch-action: pan-y;
        border: 1px solid rgba(255, 255, 255, .74);
        border-radius: 24px;
        padding: 24px;
        color: var(--ink);
        background: linear-gradient(135deg, rgba(255, 255, 255, .92), rgba(255, 243, 223, .8));
        box-shadow: 0 28px 86px rgba(40, 38, 58, .22), inset 0 1px 0 rgba(255, 255, 255, .5);
        scrollbar-width: none;
        -webkit-overflow-scrolling: touch;
      }
      .shex-energy-detail-mask::-webkit-scrollbar,
      .shex-energy-detail-dialog::-webkit-scrollbar {
        width: 0;
        height: 0;
      }
      .shex-energy-detail-close {
        position: absolute;
        top: 18px;
        right: 18px;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        border: 1px solid rgba(185, 142, 101, .2);
        background: rgba(255, 255, 255, .8);
        color: #5f5274;
        font-size: 18px;
        cursor: pointer;
      }
      @media (max-width: 760px) {
        .shex-energy-detail-dialog {
          max-height: min(88vh, 820px);
          padding: 22px 18px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function energyDetailDialog() {
    ensureEnergyDetailStyles();
    let mask = document.querySelector("#shexEnergyDetailMask");
    if (mask) return mask;
    mask = document.createElement("div");
    mask.id = "shexEnergyDetailMask";
    mask.className = "shex-energy-detail-mask";
    mask.innerHTML = `
      <div class="shex-energy-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="shexEnergyDetailTitle">
        <button class="shex-energy-detail-close" type="button" aria-label="关闭">×</button>
        <span class="course-kicker">X Energy</span>
        <h3 id="shexEnergyDetailTitle">X能量</h3>
        <section class="shex-redeem-box">
          <label>兑换码
            <input id="shexRedeemInput" placeholder="请输入兑换码" autocomplete="off">
          </label>
          <button id="shexRedeemButton" type="button">立即兑换</button>
          <p id="shexRedeemStatus"></p>
        </section>
        <div class="shex-plan-toggle-row">
          <button type="button" data-shex-price-toggle="faq">X能量问答</button>
          <button type="button" data-shex-price-toggle="plans">版本价格</button>
          <button type="button" data-shex-price-toggle="packs">X能量包</button>
        </div>
        <section class="shex-price-section" data-shex-price-section="faq" hidden>
          <div class="shex-faq-list" id="shexFaqList">
            <div class="shex-faq-item">
              <button class="shex-faq-question" type="button">X能量是什么？</button>
              <div class="shex-faq-answer">你在SHE.X里做的大部分事情——发消息、收X来信、看TA的状态等，都需要消耗一点X能量。可以理解成"聊天的燃料"，用来让系统更稳定地长期运行。</div>
            </div>
            <div class="shex-faq-item">
              <button class="shex-faq-question" type="button">为什么明明"3小时额度"还有，却提示不够用？</button>
              <div class="shex-faq-answer">Free 用户的额度分两层：3小时额度（每3小时恢复一次）和3天额度（3天内整体能用的总量，每3天恢复一次），两个都够才能使用。Plus / Pro / Ultra 会员没有3小时限制，只看3天额度，3天额度没用完就可以一直用。</div>
            </div>
            <div class="shex-faq-item">
              <button class="shex-faq-question" type="button">X能量多久恢复一次？</button>
              <div class="shex-faq-answer">Free 用户每3小时恢复一轮"3小时额度"；所有用户每3天恢复一轮"3天额度"。会员没有3小时限制。所以不是用完就彻底没有了。</div>
            </div>
            <div class="shex-faq-item">
              <button class="shex-faq-question" type="button">一个月大概能有多少能量？</button>
              <div class="shex-faq-answer">把"3天额度"乘以10，大概就是一个月能用的量（这只是方便大家心里有个数，不是另外单独算的一个限制哦）。</div>
            </div>
            <div class="shex-faq-item">
              <button class="shex-faq-question" type="button">具体每个操作扣多少能量？</button>
              <div class="shex-faq-answer">发一条消息（单聊/群聊都一样）：1点<br>接收一次X来信：2点<br>查看一次TA的状态：2点<br>查看一次链接状态：2点<br>新增一位梦觉：5点<br>创建一个群聊：8点</div>
            </div>
            <div class="shex-faq-item">
              <button class="shex-faq-question" type="button">套餐是永久的吗？</button>
              <div class="shex-faq-answer">不是，套餐是有时效的（1个月/3个月/半年），到期后会自动回到免费版。能量包不一样，能量包是一次性购买的点数，不会过期，用完为止。</div>
            </div>
            <div class="shex-faq-item">
              <button class="shex-faq-question" type="button">免费版够用吗，要不要马上升级？</button>
              <div class="shex-faq-answer">不用着急！建议先正常体验免费版，不用急着做选择。根据自己的实际使用情况，觉得不够用了再考虑升级也完全来得及。</div>
            </div>
            <div class="shex-faq-item">
              <button class="shex-faq-question" type="button">聊天记录会不会丢？</button>
              <div class="shex-faq-answer">不会，云端保存是正常的，聊天记录不会丢失。如果遇到任何问题，可以在首页点击右上角用户名，里面有"用户反馈"入口，随时可以告诉我们。</div>
            </div>
            <div class="shex-faq-item">
              <button class="shex-faq-question" type="button">怎么充值/购买套餐或能量包？</button>
              <div class="shex-faq-answer">请使用另一台设备微信扫码支付；受安全限制，不支持从相册识别二维码。如需代付，请找管理员。X能量包支付成功后自动到账；套餐的兑换码可在支付成功后立即复制，也可在「我的购买记录」中再次查看。</div>
            </div>
            <div class="shex-faq-item">
              <button class="shex-faq-question" type="button">扫码显示不能支付？</button>
              <div class="shex-faq-answer">由于微信的支付安全限制，不能直接在图库里识别支付码完成付款。可以用第二个设备扫码支付；也可以先截图发送给第二个设备，再用本机微信扫码支付。支付完成后，如果没有及时复制兑换码，可以回到"充值X能量-我的购买记录"里查询兑换码。</div>
            </div>
          </div>
        </section>
        <section class="shex-price-section" data-shex-price-section="plans" hidden>
          <h4>版本价格表</h4>
          <div class="shex-price-grid" id="shexPlanPrices"></div>
        </section>
        <section class="shex-price-section" data-shex-price-section="packs" hidden>
          <h4>X能量包价格表</h4>
          <div class="shex-price-grid shex-pack-grid" id="shexPackPrices"></div>
        </section>
        <section class="shex-open-note">
          <p>有支付问题以及其他复杂问题，可以联系管理员</p>
          <button id="shexContactAdmin" type="button">联系管理员</button>
        </section>
        <section class="shex-open-note">
          <p>如果之前购买后忘记复制兑换码，可以在这里重新找到（未使用的兑换码依然有效）</p>
          <button id="shexMyOrders" type="button">我的购买记录</button>
        </section>
      </div>
    `;
    document.body.appendChild(mask);
    const close = () => {
      mask.classList.remove("show");
    };
    mask.querySelector(".shex-energy-detail-close")?.addEventListener("click", close);
    mask.addEventListener("click", (event) => {
      if (event.target === mask) close();
    });
    mask.querySelector("#shexRedeemButton")?.addEventListener("click", async () => {
      const input = mask.querySelector("#shexRedeemInput");
      const button = mask.querySelector("#shexRedeemButton");
      const status = mask.querySelector("#shexRedeemStatus");
      if (status) {
        status.dataset.type = "info";
        status.textContent = "正在兑换...";
      }
      if (button) button.disabled = true;
      try {
        const data = await redeemCode(input?.value || "");
        const planMask = document.querySelector("#shexPlanMask");
        if (planMask) renderPlanDialog(planMask, data);
        renderEnergyPrices(mask, data);
        if (input) input.value = "";
        if (status) {
          status.dataset.type = "ok";
          status.textContent = "兑换成功，已开通对应版本或补充 X能量。";
        }
      } catch (error) {
        if (status) {
          status.dataset.type = "error";
          status.textContent = friendlyErrorMessage(error, "兑换码不存在或已失效，请检查后重试。");
        }
      } finally {
        if (button) button.disabled = false;
      }
    });
    mask.querySelector("#shexContactAdmin")?.addEventListener("click", () => {
      openAdminQrDialog();
    });
    mask.querySelector("#shexMyOrders")?.addEventListener("click", () => {
      openMyOrdersDialog();
    });
    mask.querySelectorAll("[data-shex-price-toggle]").forEach((button) => {
      button.addEventListener("click", () => {
        const target = button.dataset.shexPriceToggle;
        const section = mask.querySelector(`[data-shex-price-section="${target}"]`);
        const willOpen = section?.hidden;
        mask.querySelectorAll("[data-shex-price-section]").forEach((item) => {
          item.hidden = true;
        });
        mask.querySelectorAll("[data-shex-price-toggle]").forEach((item) => {
          item.classList.remove("active");
        });
        if (section && willOpen) {
          section.hidden = false;
          button.classList.add("active");
        }
      });
    });
    mask.querySelectorAll(".shex-faq-question").forEach((question) => {
      question.addEventListener("click", () => {
        const item = question.closest(".shex-faq-item");
        const willOpen = !item.classList.contains("is-open");
        mask.querySelectorAll(".shex-faq-item").forEach((otherItem) => {
          otherItem.classList.remove("is-open");
        });
        if (willOpen) item.classList.add("is-open");
      });
    });
    return mask;
  }

  async function openEnergyDetailDialog() {
    const mask = energyDetailDialog();
    mask.classList.add("show");
    let data = latestPlanData;
    if (!data) {
      try {
        data = await getMyPlan();
      } catch (_) {
        data = fallbackPlanData();
      }
    }
    renderEnergyPrices(mask, data);
  }

  function myOrdersDialog() {
    let mask = document.querySelector("#shexMyOrdersMask");
    if (!mask) {
      mask = document.createElement("div");
      mask.id = "shexMyOrdersMask";
      mask.className = "shex-energy-detail-mask";
      mask.innerHTML = `
        <div class="shex-energy-detail-dialog" role="dialog" aria-modal="true">
          <button class="shex-energy-detail-close" type="button" aria-label="关闭">×</button>
          <span class="course-kicker">My Orders</span>
          <h3>我的购买记录</h3>
          <p class="shex-my-orders-hint">如果之前购买后忘记复制兑换码，可以在这里重新找到（未使用的兑换码依然有效）</p>
          <div class="shex-my-orders-list" id="shexMyOrdersList"><p class="admin-users-empty">正在加载...</p></div>
        </div>
      `;
      document.body.appendChild(mask);
      const close = () => mask.classList.remove("show");
      mask.querySelector(".shex-energy-detail-close")?.addEventListener("click", close);
      mask.addEventListener("click", (event) => {
        if (event.target === mask) close();
      });
    }
    return mask;
  }

  async function openMyOrdersDialog() {
    const mask = myOrdersDialog();
    mask.classList.add("show");
    const listEl = mask.querySelector("#shexMyOrdersList");
    const planLabel = (plan) => ({ plus: "共振版 Plus", pro: "深链版 Pro", ultra: "恒链版 Ultra" }[plan] || plan);
    const packLabel = (packType) => ({ small_pack: "小能量包", medium_pack: "中能量包", large_pack: "大能量包" }[packType] || packType);
    const statusLabel = (status) => ({
      completed: "已完成", pending: "待支付", processing: "处理中",
      failed: "失败", amount_mismatch: "异常，请联系管理员"
    }[status] || status);
    try {
      const result = await getMyPaymentHistory();
      const orders = result?.orders || [];
      if (!orders.length) {
        listEl.innerHTML = '<p class="admin-users-empty">暂无购买记录</p>';
        return;
      }
      listEl.innerHTML = orders.map((order) => {
        const itemLabel = order.orderType === "plan"
          ? `套餐 ${planLabel(order.plan)} ${order.durationDays}天`
          : `能量包 ${packLabel(order.packType)} ${order.energyAmount}点`;
        const timeLabel = new Date(order.createdAt).toLocaleString("zh-CN");
        const yuan = (Number(order.amountFen || 0) / 100).toFixed(2);
        const codeBlock = order.redeemCode
          ? `<div class="shex-my-order-code">兑换码：<strong>${escapeHtml(order.redeemCode)}</strong><button type="button" data-copy-order-code="${escapeHtml(order.redeemCode)}">复制</button></div>`
          : order.autoCredited
            ? `<div class="shex-my-order-code">已自动到账</div>`
            : "";
        return `
          <div class="shex-my-order-row">
            <div class="shex-my-order-top">
              <span>${escapeHtml(itemLabel)}</span>
              <span>¥${yuan}</span>
            </div>
            <div class="shex-my-order-meta">
              <span class="shex-my-order-status shex-my-order-status-${escapeHtml(order.status)}">${statusLabel(order.status)}</span>
              <span>${escapeHtml(timeLabel)}</span>
            </div>
            ${codeBlock}
          </div>
        `;
      }).join("");
      listEl.querySelectorAll("[data-copy-order-code]").forEach((button) => {
        button.addEventListener("click", async () => {
          const code = button.dataset.copyOrderCode;
          try {
            if (!await copyTextToClipboard(code)) throw new Error("copy failed");
            notify("已复制");
          } catch (_) {
            notify("复制失败，请手动选中复制");
          }
        });
      });
    } catch (error) {
      listEl.innerHTML = '<p class="admin-users-empty">加载失败，请稍后重试</p>';
    }
  }

  function stopPaymentPoll() {
    if (paymentPollTimer) {
      clearInterval(paymentPollTimer);
      paymentPollTimer = null;
    }
  }

  function paymentDialog() {
    let mask = document.querySelector("#shexPaymentMask");
    if (!mask) {
      mask = document.createElement("div");
      mask.id = "shexPaymentMask";
      mask.className = "shex-payment-mask";
      mask.innerHTML = `
        <div class="shex-payment-dialog" role="dialog" aria-modal="true">
          <button class="shex-payment-close" type="button" aria-label="关闭">×</button>
          <h3 id="shexPaymentTitle">微信扫码支付</h3>
          <p id="shexPaymentDesc"></p>
          <div id="shexPaymentQrcode" class="shex-payment-qrcode"></div>
          <div id="shexPaymentStatus" class="shex-payment-status"></div>
          <div id="shexPaymentRedeemBox" class="shex-payment-redeem-box" hidden>
            <p>支付成功！这是你的兑换码：</p>
            <div class="shex-payment-redeem-code" id="shexPaymentRedeemCode"></div>
            <button id="shexPaymentCopyCode" type="button">复制兑换码</button>
          </div>
        </div>
      `;
      document.body.appendChild(mask);
      const close = () => {
        stopPaymentPoll();
        mask.classList.remove("show");
        const redeemBox = mask.querySelector("#shexPaymentRedeemBox");
        if (redeemBox) redeemBox.hidden = true;
      };
      mask.querySelector(".shex-payment-close")?.addEventListener("click", close);
      mask.addEventListener("click", (event) => {
        if (event.target === mask) close();
      });
      mask.querySelector("#shexPaymentCopyCode")?.addEventListener("click", async () => {
        const code = mask.querySelector("#shexPaymentRedeemCode")?.textContent || "";
        if (!code) return;
        try {
          if (!await copyTextToClipboard(code)) throw new Error("copy failed");
          notify("已复制兑换码");
        } catch (_) {
          notify("复制失败，请手动选中复制");
        }
      });
    }
    return mask;
  }

  function openPaymentRedeemHelp(isEnergyPack) {
    if (typeof window.openCustomCardConfirm !== "function") return;
    window.openCustomCardConfirm({
      title: "兑换码在哪里？",
      body: isEnergyPack
        ? "支付成功时会显示兑换码。你可以复制保存，在「兑换码」中兑换 X能量；之后也可以在「兑换码」中再次查看。"
        : "套餐在兑换后马上刷新，所以兑换时间由你决定。\n支付成功时会显示兑换码；之后也可以在「兑换码」中再次查看。",
      confirmText: "知道了"
    });
    const modal = document.querySelector("#ixCustomCardConfirm");
    const body = modal?.querySelector("#ixCardConfirmBody");
    if (!modal || !body) return;
    const image = document.createElement("img");
    image.src = "./images/x-energy-redeem-entry-help-20260929.jpg";
    image.alt = "X能量页面中的兑换码入口，红色箭头指向兑换码";
    body.appendChild(image);
    modal.classList.add("shex-payment-help-modal");
    const observer = new MutationObserver(() => {
      if (modal.classList.contains("show")) return;
      modal.classList.remove("shex-payment-help-modal");
      observer.disconnect();
    });
    observer.observe(modal, { attributes: true, attributeFilter: ["class"] });
  }

  function renderPaymentScanHint(statusEl, purchase) {
    if (!statusEl) return;
    const isEnergyPack = purchase?.orderType === "energy_pack";
    if (isEnergyPack) {
      statusEl.innerHTML = `
        <div class="shex-payment-redemption-note" role="note">
          <div class="shex-payment-redemption-head">
            <span class="shex-payment-redemption-label">付款后自动到账</span>
          </div>
          <p>支付成功后，X能量会直接充到你的账户，无需兑换码。</p>
        </div>
        <p class="shex-payment-scan-hint">请使用另一台设备微信扫码支付；受安全限制，不支持从相册识别二维码。如需代付或支付出现问题，请找管理员，管理员QQ：<strong>2140980147</strong>。</p>
      `;
      return;
    }
    const redeemTarget = "套餐";
    statusEl.innerHTML = `
      <div class="shex-payment-redemption-note" role="note">
        <div class="shex-payment-redemption-head">
          <span class="shex-payment-redemption-label">付款后会显示兑换码</span>
          <button class="shex-payment-help" type="button" aria-label="查看兑换码说明">?</button>
        </div>
        <p>你可以选择合适的时间，再到「兑换码」兑换${redeemTarget}。</p>
      </div>
      <p class="shex-payment-scan-hint">请使用另一台设备微信扫码支付；受安全限制，不支持从相册识别二维码。如需代付或支付出现问题，请找管理员，管理员QQ：<strong>2140980147</strong>。</p>
    `;
    statusEl.querySelector(".shex-payment-help")?.addEventListener("click", () => openPaymentRedeemHelp(isEnergyPack));
  }

  async function startPurchase(payload) {
    stopPaymentPoll();
    const mask = paymentDialog();
    mask.classList.add("show");
    const descEl = mask.querySelector("#shexPaymentDesc");
    const qrEl = mask.querySelector("#shexPaymentQrcode");
    const statusEl = mask.querySelector("#shexPaymentStatus");
    if (qrEl) qrEl.innerHTML = "";
    if (descEl) descEl.textContent = "正在生成订单...";
    if (statusEl) statusEl.textContent = "";

    try {
      if (!qrEl || typeof window.QRCode !== "function") {
        throw Object.assign(new Error("支付二维码工具加载失败，请刷新页面后重试；仍无法支付请联系管理员。"), { code: "PAYMENT_QR_FAILED" });
      }
      const order = await createPaymentOrder(payload);
      if (typeof order?.codeUrl !== "string" || !order.codeUrl.trim()) {
        throw Object.assign(new Error("支付订单未返回二维码信息，请关闭后重试；仍无法支付请联系管理员。"), { code: "PAYMENT_QR_FAILED" });
      }
      if (descEl) descEl.textContent = order.description || "";
      try {
        new window.QRCode(qrEl, {
          text: order.codeUrl,
          width: 200,
          height: 200
        });
      } catch (_) {
        qrEl.innerHTML = "";
        throw Object.assign(new Error("支付二维码生成失败，请刷新页面后重试；仍无法支付请联系管理员。"), { code: "PAYMENT_QR_FAILED" });
      }
      renderPaymentScanHint(statusEl, payload);

      stopPaymentPoll();
      paymentPollTimer = window.setInterval(async () => {
        try {
          const result = await getPaymentOrderStatus(order.outTradeNo);
          if (result.status === "completed") {
            stopPaymentPoll();
            if (statusEl) statusEl.textContent = "";
            const qrBox = mask.querySelector("#shexPaymentQrcode");
            if (qrBox) qrBox.innerHTML = "";
            const redeemBox = mask.querySelector("#shexPaymentRedeemBox");
            const redeemCodeEl = mask.querySelector("#shexPaymentRedeemCode");
            if (result.autoCredited || (payload?.orderType === "energy_pack" && !result.redeemCode)) {
              // X能量包：支付成功后已自动到账，无需兑换码。
              const credited = Number(result.energyAmount || 0);
              if (statusEl) {
                statusEl.innerHTML = `<p class="shex-payment-scan-hint">支付成功！${credited ? `<strong>${credited}</strong> 点 ` : ""}X能量已自动到账，无需兑换。</p>`;
              }
              notify("支付成功，X能量已到账");
              try {
                const fresh = await getMyPlan({ forceRefresh: true });
                refreshVisiblePlanDialog(fresh);
              } catch (_) {
                // 余额刷新失败不影响到账，下次打开会自动同步。
              }
            } else if (redeemBox && redeemCodeEl) {
              redeemCodeEl.textContent = result.redeemCode || "";
              redeemBox.hidden = false;
            }
          } else if (result.status === "failed") {
            stopPaymentPoll();
            if (statusEl) statusEl.textContent = "支付未完成，请重新发起购买";
          }
        } catch (_) {
          // 单次查询失败不影响继续轮询，静默重试。
        }
      }, 2000);
    } catch (error) {
      if (descEl) descEl.textContent = "";
      if (statusEl) statusEl.textContent = error?.code === "PAYMENT_QR_FAILED"
        ? error.message
        : friendlyErrorMessage(error, "生成订单失败，请稍后再试");
    }
  }

  function renderEnergyPrices(mask, data) {
    const prices = mask.querySelector("#shexPlanPrices");
    const packs = mask.querySelector("#shexPackPrices");
    if (prices) {
      prices.innerHTML = Object.entries(PLAN_TABLE).map(([code, plan]) => {
        if (code === "free_cloud") {
          return `
            <article>
              <strong>${escapeHtml(plan.name)}</strong>
              <p>每 3 小时 ${plan.cycle3hLimit} 点 X能量<br>每 3 天 ${plan.cycle3dLimit} 点 X能量<br>每月约 ${plan.cycle3dLimit * 10} 点 X能量<br>允许 ${plan.maxSessions} 台设备同时登录</p>
            </article>
          `;
        }
        const durationButtons = (plan.durations || []).map((d) => {
          const label = d.days === 30 ? "1个月" : d.days === 90 ? "3个月" : d.days === 180 ? "半年" : `${d.days}天`;
          return `<button class="shex-plan-duration-btn" type="button" data-plan-purchase="${code}" data-plan-days="${d.days}">${label} ${escapeHtml(d.price)}</button>`;
        }).join("");
        return `
          <article class="shex-plan-selectable" data-plan-card="${code}">
            <button class="shex-plan-card-toggle" type="button" data-plan-toggle="${code}">
              <strong>${escapeHtml(plan.name)}</strong>
              <p>每 3 小时 ${plan.cycle3hLimit} 点 X能量<br>每 3 天 ${plan.cycle3dLimit} 点 X能量<br>每月约 ${plan.cycle3dLimit * 10} 点 X能量<br>允许 ${plan.maxSessions} 台设备同时登录</p>
              <span class="shex-plan-tap-hint">点击选择购买时长</span>
            </button>
            <div class="shex-plan-duration-row" data-plan-durations="${code}" hidden>
              ${durationButtons}
            </div>
          </article>
        `;
      }).join("");
    }
    if (packs) {
      packs.innerHTML = ENERGY_PACKS.map((pack) => `
        <article class="shex-pack-selectable">
          <button class="shex-pack-buy-btn" type="button" data-pack-purchase="${pack.packType || pack.name}">
            <strong>${escapeHtml(pack.name)}</strong>
            <span>${escapeHtml(pack.price)}</span>
            <p>${pack.amount} 点 X能量</p>
          </button>
        </article>
      `).join("");
      packs.querySelectorAll("[data-pack-purchase]").forEach((packButton) => {
        packButton.addEventListener("click", () => {
          const packType = packButton.dataset.packPurchase;
          startPurchase({ orderType: "energy_pack", packType });
        });
      });
    }
    if (prices) {
      prices.querySelectorAll("[data-plan-toggle]").forEach((toggleButton) => {
        toggleButton.addEventListener("click", () => {
          const code = toggleButton.dataset.planToggle;
          const durationRow = prices.querySelector(`[data-plan-durations="${code}"]`);
          const willOpen = durationRow?.hidden;
          prices.querySelectorAll("[data-plan-durations]").forEach((row) => {
            row.hidden = true;
          });
          if (durationRow && willOpen) durationRow.hidden = false;
        });
      });
      prices.querySelectorAll("[data-plan-purchase]").forEach((durationButton) => {
        durationButton.addEventListener("click", () => {
          const plan = durationButton.dataset.planPurchase;
          const days = Number(durationButton.dataset.planDays);
          startPurchase({ orderType: "plan", plan, durationDays: days });
        });
      });
    }
  }

  function renderPlanDialog(mask, data) {
    const currentPlan = data?.currentPlan || { plan: "free_cloud", code: "free_cloud", name: "初链版 Free", expireAt: 0 };
    const quota = data?.quota || {};
    const currentBox = mask.querySelector("#shexPlanCurrent");
    const status = mask.querySelector("#shexPlanStatus");
    if (status) {
      if (data?.pending) {
        status.style.display = "";
        status.dataset.type = "";
        status.textContent = "正在读取套餐信息...";
      } else if (data?.planExpired) {
        status.style.display = "";
        status.dataset.type = "ok";
        status.textContent = "当前套餐已到期，已切换为初链版 Free。你的数据不会删除，可继续使用基础额度。";
      } else if (data?.isAdmin) {
        status.style.display = "";
        status.dataset.type = "ok";
        status.textContent = "管理员账号已连接，可继续测试云端功能。";
      } else {
        status.style.display = "none";
        status.textContent = "";
      }
    }
    if (currentBox) {
      // Plus / Pro / Ultra 只受 3 天额度限制，不再展示 3 小时额度。
      const memberQuotaOnly = ["plus", "pro", "ultra"].includes(String(currentPlan.code || currentPlan.plan || "").toLowerCase());
      const cycle3hUsed = Number(quota.cycle3hUsed || 0);
      const cycle3hLimit = Number(quota.cycle3hLimit || 30);
      const cycle3dUsed = Number(quota.cycle3dUsed || 0);
      const cycle3dLimit = Number(quota.cycle3dLimit || 120);
      const cycle3hResetAt = quotaResetAt(quota.cycle3hStart, CYCLE_3H_MS, quota.cycle3hResetAt);
      const cycle3dResetAt = quotaResetAt(quota.cycle3dStart, CYCLE_3D_MS, quota.cycle3dResetAt);
      const cycle3hLeft = Math.max(0, cycle3hLimit - cycle3hUsed);
      const cycle3dLeft = Math.max(0, cycle3dLimit - cycle3dUsed);
      const cycle3hPercent = Math.max(0, Math.min(100, cycle3hLimit ? cycle3hLeft / cycle3hLimit * 100 : 0));
      const cycle3dPercent = Math.max(0, Math.min(100, cycle3dLimit ? cycle3dLeft / cycle3dLimit * 100 : 0));
      debugLog("[ENERGY_RECOVERY_DEBUG]", {
        source: quota.cycle3hResetAt || quota.cycle3dResetAt ? "cloud_quota_resetAt" : "frontend_start_plus_duration",
        now: Date.now(),
        cycle3hStartedAt: Number(quota.cycle3hStartedAt || quota.cycle3hStart || 0),
        cycle3hResetAt,
        cycle3dStartedAt: Number(quota.cycle3dStartedAt || quota.cycle3dStart || 0),
        cycle3dResetAt,
        nextRecoveryAt: Math.min(cycle3hResetAt, cycle3dResetAt),
        formattedRecoveryTime: {
          cycle3h: formatEnergyResetTime(cycle3hResetAt, "time"),
          cycle3d: formatEnergyResetTime(cycle3dResetAt, "date")
        },
        rawPlanData: currentPlan,
        rawEnergyData: quota
      });
      currentBox.innerHTML = `
        <div class="shex-plan-summary">
          <small>当前套餐</small>
          <strong>${escapeHtml(currentPlan.name || "初链版 Free")}</strong>
          <span>${escapeHtml(currentPlan.code || currentPlan.plan || "free_cloud")} · 到期：${escapeHtml(formatPlanTime(currentPlan.expireAt))}</span>
        </div>
        ${memberQuotaOnly ? "" : `<div class="shex-energy-card">
          <div class="shex-energy-head">
            <small>3小时额度</small>
            <b>${cycle3hLeft} / ${cycle3hLimit}</b>
          </div>
          <div class="shex-energy-bar"><i style="width:${cycle3hPercent}%"></i></div>
          <em>恢复时间：${escapeHtml(formatEnergyResetTime(cycle3hResetAt, "time"))}</em>
        </div>`}
        <div class="shex-energy-card">
          <div class="shex-energy-head">
            <small>3天额度</small>
            <b>${cycle3dLeft} / ${cycle3dLimit}</b>
          </div>
          <div class="shex-energy-bar"><i style="width:${cycle3dPercent}%"></i></div>
          <em>恢复时间：${escapeHtml(formatEnergyResetTime(cycle3dResetAt, "date"))}</em>
        </div>
        <div class="shex-pack-balance">
          <small>资源包余额</small>
          <strong>${Number(quota.packBalance || 0)}</strong>
        </div>
      `;
      schedulePlanAutoRefresh(data);
    }
  }

  function refreshVisiblePlanDialog(data) {
    const mask = document.querySelector("#shexPlanMask.show");
    if (!mask) return;
    renderPlanDialog(mask, normalizePlanData(data));
  }

  async function openPlanDialog() {
    const current = session();
    if (!current || isAuthExpired()) {
      markSessionExpired();
      return;
    }
    const mask = planDialog();
    mask.classList.add("show");
    mask._shexScrollControl?.open?.();
    renderPlanDialog(mask, fallbackPlanData({ pending: true }));
    const status = mask.querySelector("#shexPlanStatus");
    if (status) {
      status.dataset.type = "";
      status.textContent = "正在读取套餐信息...";
    }
    try {
      const data = await getMyPlan();
      renderPlanDialog(mask, normalizePlanData(data));
    } catch (error) {
      console.error("[SHEX_ERROR]", { code: "", step: "getMyPlan", detail: formatError(error), rawError: error });
      renderPlanDialog(mask, fallbackPlanData());
    }
  }

  function openEnergyPage(section = "") {
    const targetSection = String(section || "").trim();
    if (targetSection) sessionStorage.setItem("shex_x_energy_focus_section", targetSection);
    if (window.location.hash !== "#x-energy") {
      window.location.hash = "#x-energy";
    } else {
      window.dispatchEvent(new CustomEvent("shex:energy-page-open", {
        detail: { section: targetSection }
      }));
    }
  }

  function getEnergyCatalog() {
    return {
      plans: Object.entries(PLAN_TABLE).map(([code, plan]) => ({
        code,
        name: plan.name,
        cycle3hLimit: Number(plan.cycle3hLimit || 0),
        cycle3dLimit: Number(plan.cycle3dLimit || 0),
        maxSessions: Number(plan.maxSessions || 1),
        durations: (plan.durations || []).map((duration) => ({ ...duration }))
      })),
      packs: ENERGY_PACKS.map((pack) => ({ ...pack }))
    };
  }

  function adminRedeemDialog() {
    let mask = document.querySelector("#shexAdminMask");
    if (mask) return mask;
    mask = document.createElement("div");
    mask.id = "shexAdminMask";
    mask.className = "shex-admin-mask";
    mask.innerHTML = `
      <div class="shex-admin-dialog" role="dialog" aria-modal="true" aria-labelledby="shexAdminTitle">
        <button class="shex-admin-close" type="button" aria-label="关闭">×</button>
        <span class="course-kicker">Admin</span>
        <h3 id="shexAdminTitle">兑换码管理</h3>
        <p class="shex-admin-hint">生成后复制给用户，用户在“X能量”里输入兑换。</p>
        <div class="shex-admin-form">
          <label>兑换码类型
            <select id="shexAdminType">
              <option value="plan">套餐兑换码</option>
              <option value="energy_pack">X能量包兑换码</option>
            </select>
          </label>
          <label data-shex-admin-field="plan">套餐版本
            <select id="shexAdminPlan">
              <option value="plus">共振版 Plus</option>
              <option value="pro">深链版 Pro</option>
              <option value="ultra">恒链版 Ultra</option>
            </select>
          </label>
          <label data-shex-admin-field="duration">套餐时长
            <select id="shexAdminDuration">
              <option value="30" selected>1个月</option>
              <option value="90">3个月</option>
              <option value="180">半年</option>
            </select>
          </label>
          <label data-shex-admin-field="pack" hidden>X能量包
            <select id="shexAdminPack">
              <optgroup label="销售档位">
                <option value="small_pack">小能量包 · 600 点</option>
                <option value="medium_pack">中能量包 · 1600 点</option>
                <option value="large_pack">大能量包 · 4000 点</option>
              </optgroup>
              <optgroup label="福利档位（不对外销售）">
                <option value="bonus_30">30点奖励包 · 30 点</option>
              </optgroup>
            </select>
          </label>
          <label class="shex-admin-wide">备注
            <textarea id="shexAdminNote" maxlength="180" placeholder="例如：用户微信昵称、订单备注"></textarea>
          </label>
          <button id="shexAdminGenerate" class="shex-admin-primary" type="button">生成兑换码</button>
        </div>
        <div class="shex-admin-result" id="shexAdminResult" hidden>
          <small>生成成功</small>
          <strong id="shexAdminCode"></strong>
          <button id="shexAdminCopy" type="button">复制兑换码</button>
          <p id="shexAdminStatus"></p>
        </div>
      </div>
    `;
    document.body.appendChild(mask);
    const scrollControl = makeModalScrollController(mask, { scrollTarget: ".shex-admin-dialog" });
    mask._shexScrollControl = scrollControl;
    const close = () => {
      scrollControl.close();
      mask.classList.remove("show");
    };
    const refreshFields = () => {
      const type = mask.querySelector("#shexAdminType")?.value || "plan";
      mask.querySelectorAll("[data-shex-admin-field='plan'], [data-shex-admin-field='duration']").forEach((item) => {
        item.hidden = type !== "plan";
      });
      const packField = mask.querySelector("[data-shex-admin-field='pack']");
      if (packField) packField.hidden = type !== "energy_pack";
    };
    mask.querySelector(".shex-admin-close")?.addEventListener("click", close);
    mask.addEventListener("click", (event) => {
      if (event.target === mask) close();
    });
    mask.querySelector("#shexAdminType")?.addEventListener("change", refreshFields);
    mask.querySelector("#shexAdminGenerate")?.addEventListener("click", async () => {
      const button = mask.querySelector("#shexAdminGenerate");
      const resultBox = mask.querySelector("#shexAdminResult");
      const codeBox = mask.querySelector("#shexAdminCode");
      const status = mask.querySelector("#shexAdminStatus");
      const type = mask.querySelector("#shexAdminType")?.value || "plan";
      if (button) button.disabled = true;
      if (status) {
        status.dataset.type = "info";
        status.textContent = "正在生成...";
      }
      try {
        const result = await generateRedeemCode({
          type,
          plan: mask.querySelector("#shexAdminPlan")?.value || "plus",
          durationDays: Number(mask.querySelector("#shexAdminDuration")?.value || 30),
          packType: mask.querySelector("#shexAdminPack")?.value || "small_pack",
          note: mask.querySelector("#shexAdminNote")?.value || ""
        });
        const code = result?.redeemCode?.code || "";
        if (codeBox) codeBox.textContent = code;
        if (resultBox) resultBox.hidden = false;
        if (status) {
          status.dataset.type = "ok";
          status.textContent = "兑换码已生成，可以复制发给用户。";
        }
      } catch (error) {
        if (resultBox) resultBox.hidden = false;
        if (codeBox) codeBox.textContent = "";
        if (status) {
          status.dataset.type = "error";
          status.textContent = friendlyErrorMessage(error, "生成失败，请稍后再试");
        }
      } finally {
        if (button) button.disabled = false;
      }
    });
    mask.querySelector("#shexAdminCopy")?.addEventListener("click", async () => {
      const code = mask.querySelector("#shexAdminCode")?.textContent || "";
      const status = mask.querySelector("#shexAdminStatus");
      if (!code) return;
      try {
        if (!await copyTextToClipboard(code)) throw new Error("copy failed");
        notify("已复制");
        if (status) {
          status.dataset.type = "ok";
          status.textContent = "已复制。";
        }
      } catch (_) {
        if (status) {
          status.dataset.type = "info";
          status.textContent = "复制失败的话，可以手动选中上面的兑换码。";
        }
      }
    });
    refreshFields();
    return mask;
  }

  async function openAdminRedeemDialog() {
    const current = session();
    if (!current || isAuthExpired()) {
      markSessionExpired();
      return;
    }
    if (!isAdminSession(current)) {
      notify("无权限访问");
      return;
    }
    const mask = adminRedeemDialog();
    mask.classList.add("show");
    mask._shexScrollControl?.open?.();
  }

  const toArray = (value) => {
    if (Array.isArray(value)) return value.filter(Boolean).map((item) => String(item).trim()).filter(Boolean);
    if (typeof value === "string") return value.split(/[,锛屻€乗s]+/).map((item) => item.trim()).filter(Boolean);
    return [];
  };

  const toTime = (value) => {
    if (!value) return 0;
    if (typeof value === "number") return value;
    if (value instanceof Date) return value.getTime();
    if (typeof value === "object") {
      if (typeof value.getTime === "function") return value.getTime();
      if (typeof value.$date === "number") return value.$date;
      if (typeof value.seconds === "number") return value.seconds * 1000;
      if (typeof value._seconds === "number") return value._seconds * 1000;
    }
    const parsed = Date.parse(String(value).replace(/\./g, "-"));
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const isActiveStudent = (student) => {
    const status = String(student?.status || "").trim().toLowerCase();
    if (!status) return true;
    return !["inactive", "disabled", "hidden", "archived", "deleted", "private", "停用", "隐藏", "删除"].includes(status);
  };
  const isPublicStudent = (student) => {
    if (!isActiveStudent(student)) return false;
    if (student?.isPublic === false) return false;
    if (String(student?.isPublic).trim().toLowerCase() === "false") return false;
    return true;
  };
  const isPrivateStudent = (student) => {
    const type = String(student?.studentType || student?.type || student?.studentGroup || "").trim().toLowerCase();
    const level = String(student?.level || "").trim();
    const studentId = String(student?.studentId || student?.certificateNo || student?.id || student?._id || "").trim().toUpperCase();
    const groupOrder = Number(student?.displayGroupOrder);
    return student?.isPrivate === true
      || String(student?.isPrivate).trim().toLowerCase() === "true"
      || groupOrder === 1
      || type === "private"
      || studentId.startsWith("SHEX-P-")
      || /私教|至尊/.test(level);
  };
  const studentGroupOrder = (student) => {
    const explicit = Number(student?.displayGroupOrder);
    if (Number.isFinite(explicit) && explicit > 0) return explicit;
    return isPrivateStudent(student) ? 1 : 2;
  };
  const withTimeout = (promise, ms, label = "operation") => new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(`${label} timeout`)), ms);
    Promise.resolve(promise)
      .then((value) => resolve(value))
      .catch((error) => reject(error))
      .finally(() => window.clearTimeout(timer));
  });
  const studentDebugCounts = (students = []) => {
    const rawList = Array.isArray(students) ? students : [];
    const afterPublicFilter = rawList.filter((student) => student?.isPublic !== false && String(student?.isPublic).trim().toLowerCase() !== "false");
    const afterStatusFilter = afterPublicFilter.filter(isActiveStudent);
    return {
      collectionName: collections().students,
      rawCount: rawList.length,
      afterPublicFilterCount: afterPublicFilter.length,
      afterStatusFilterCount: afterStatusFilter.length,
      privateCount: afterStatusFilter.filter(isPrivateStudent).length,
      academyCount: afterStatusFilter.filter((student) => !isPrivateStudent(student)).length
    };
  };
  const shuffleArray = (items = []) => {
    const copy = [...items];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
    }
    return copy;
  };

  const defaultStudentAvatar = (seed) => `https://api.dicebear.com/9.x/adventurer/svg?seed=${encodeURIComponent(seed || "shex")}`;
  const isCloudFileID = (value) => /^cloud:\/\//i.test(String(value || ""));
  const isWebImageUrl = (value) => /^https?:\/\//i.test(String(value || "")) || /^data:image\//i.test(String(value || ""));

  function normalizeStudent(record = {}) {
    const studentId = String(record.studentId || record.id || record._id || record.certificateNo || "").trim();
    const name = String(record.name || record.nickname || record.displayName || "").trim();
    const courses = toArray(record.courses || record.courseName || record.course || record.courseTitle);
    const accountFields = [
      record.douyin,
      record.xiaohongshu,
      record.bilibili,
      record.wechat
    ].filter(Boolean);
    const accounts = toArray(record.accounts || record.account || record.contact || record.contacts || accountFields);
    const level = String(record.level || record.studentLevel || record.memberLevel || "").trim();
    const status = String(record.status || record.studyStatus || "").trim() || "学习中";
    const certificateNo = String(record.certificateNo || record.certNo || record.certificationNo || record.id || studentId).trim();
    const courseName = courses.join(" / ");
    const certificationType = String(record.certificationType || record.certType || record.type || record.category || level).trim();
    const createdAt = toTime(record.createdAt || record.createTime || record._createTime || record.updatedAt);
    const sortOrder = Number(record.sortOrder);
    return {
      ...record,
      studentId,
      name,
      course: String(record.course || record.courseName || courses[0] || "塔罗课程").trim() || "塔罗课程",
      learningStatus: ["进修中", "已毕业"].includes(String(record.learningStatus || "").trim())
        ? String(record.learningStatus).trim()
        : "进修中",
      douyin: String(record.douyin || "").trim(),
      douyinId: String(record.douyinId || record.platformId || "").trim(),
      xiaohongshu: String(record.xiaohongshu || record.xhs || "").trim(),
      bilibili: String(record.bilibili || record.bili || record.bilibiliAccount || "").trim(),
      wechat: String(record.wechat || record.weixin || "").trim(),
      avatarUrl: String(record.avatarUrl || "").trim(),
      avatar: record.avatar || record.avatarUrl || record.avatarFileID || record.avatarFileId || record.avatarCloudPath || "",
      avatarFileID: record.avatarFileID || record.avatarFileId || "",
      avatarCloudPath: record.avatarCloudPath || "",
      qrcode: record.qrcode || record.qrcodeUrl || record.qrcodeFileID || record.qrcodeFileId || "",
      certificateNo,
      courseName,
      courses,
      accounts,
      level,
      certificationType,
      tags: toArray(record.tags),
      status,
      isPublic: isPublicStudent(record),
      isPrivate: isPrivateStudent(record),
      displayGroupOrder: studentGroupOrder(record),
      displayAccount: "",
      certifiedAt: record.certifiedAt || record.date || record.certDate || "",
      sortOrder: Number.isFinite(sortOrder) ? sortOrder : null,
      createdAt,
      description: record.description || record.story || record.bio || ""
    };
  }

  function sortStudents(students = []) {
    const activeStudents = students.filter(isActiveStudent);
    const grouped = new Map();
    activeStudents.forEach((student) => {
      const order = studentGroupOrder(student);
      if (!grouped.has(order)) grouped.set(order, []);
      grouped.get(order).push(student);
    });
    return [...grouped.keys()]
      .sort((left, right) => left - right)
      .flatMap((order) => shuffleArray(grouped.get(order)));
  }
  async function resolveStudentFiles(app, student) {
    const next = { ...student };
    const avatarSource = next.avatarUrl || next.avatar || next.avatarFileID || next.avatarFileId || next.avatarCloudPath || "";
    if (isCloudFileID(avatarSource)) {
      next.avatarFileID = avatarSource;
      next.avatarUrl = await tempUrl(app, avatarSource) || "";
      next.avatar = next.avatarUrl || avatarSource;
    } else if (isWebImageUrl(avatarSource)) {
      next.avatarUrl = avatarSource;
      next.avatar = avatarSource;
    }
    if (isCloudFileID(next.qrcode)) {
      next.qrcodeFileID = next.qrcode;
      next.qrcode = await tempUrl(app, next.qrcode) || next.qrcode;
    }
    return next;
  }

  const PUBLIC_STUDENTS_CACHE_PREFIX = "shex_public_students_cache_v1:";
  const PUBLIC_STUDENTS_CACHE_TTL_MS = 60 * 60 * 1000;
  const TEMP_URL_BATCH_SIZE = 50;

  function publicStudentsCacheKey(limit) {
    return `${PUBLIC_STUDENTS_CACHE_PREFIX}${collections().students}:${Math.max(1, Number(limit || 200))}`;
  }

  function readPublicStudentsCache(limit) {
    try {
      const cached = JSON.parse(sessionStorage.getItem(publicStudentsCacheKey(limit)) || "null");
      if (!cached || Number(cached.expiresAt || 0) <= Date.now() || !Array.isArray(cached.records)) return null;
      return cached.records;
    } catch (_) {
      return null;
    }
  }

  function writePublicStudentsCache(limit, records) {
    try {
      sessionStorage.setItem(publicStudentsCacheKey(limit), JSON.stringify({
        expiresAt: Date.now() + PUBLIC_STUDENTS_CACHE_TTL_MS,
        records
      }));
    } catch (_) {
      // 缓存不可用时继续走正常读取，不影响学员列表。
    }
  }

  async function batchTempUrls(app, fileIDs = []) {
    const unique = [...new Set(fileIDs.filter(isCloudFileID))];
    const urls = new Map();
    for (let offset = 0; offset < unique.length; offset += TEMP_URL_BATCH_SIZE) {
      const chunk = unique.slice(offset, offset + TEMP_URL_BATCH_SIZE);
      try {
        const result = await app.getTempFileURL({ fileList: chunk });
        (result?.fileList || []).forEach((item, index) => {
          const fileID = String(item?.fileID || item?.fileId || item?.file_id || chunk[index] || "");
          const url = String(item?.tempFileURL || item?.download_url || item?.url || "");
          if (fileID && url) urls.set(fileID, url);
        });
      } catch (_) {
        // 单批链接失败时保留原云文件地址，避免拆成大量单文件重试。
      }
    }
    return urls;
  }

  async function resolveStudentsFiles(app, students = []) {
    const cloudFileIDs = students.flatMap((student) => {
      const avatarSource = student.avatarUrl || student.avatar || student.avatarFileID || student.avatarFileId || student.avatarCloudPath || "";
      return [avatarSource, student.qrcode].filter(isCloudFileID);
    });
    const urls = await batchTempUrls(app, cloudFileIDs);
    return students.map((student) => {
      const next = { ...student };
      const avatarSource = next.avatarUrl || next.avatar || next.avatarFileID || next.avatarFileId || next.avatarCloudPath || "";
      if (isCloudFileID(avatarSource)) {
        next.avatarFileID = avatarSource;
        next.avatarUrl = urls.get(avatarSource) || "";
        next.avatar = next.avatarUrl || avatarSource;
      } else if (isWebImageUrl(avatarSource)) {
        next.avatarUrl = avatarSource;
        next.avatar = avatarSource;
      }
      if (isCloudFileID(next.qrcode)) {
        next.qrcodeFileID = next.qrcode;
        next.qrcode = urls.get(next.qrcode) || next.qrcode;
      }
      return next;
    });
  }

  async function fetchStudents({ activeOnly = true, limit = 200 } = {}) {
    const api = await cloud().catch((error) => {
      console.error("[SHEX_ERROR]", { code: "", step: "loadStudents:cloud", detail: formatError(error), rawError: error });
      notify(friendlyErrorMessage(error, "学员资料暂时没加载出来，稍后再试"));
      throw error;
    });
    if (!api) return [];
    try {
      let normalizedStudents = activeOnly ? readPublicStudentsCache(limit) : null;
      if (!normalizedStudents) {
        const query = api.db.collection(collections().students);
        const result = await withTimeout(query.limit(limit).get(), 12000, "fetch shex_students");
        normalizedStudents = (result.data || []).map(normalizeStudent);
        if (activeOnly) {
          normalizedStudents = normalizedStudents.filter(isPublicStudent);
          writePublicStudentsCache(limit, normalizedStudents);
        }
      }
      const students = await resolveStudentsFiles(api.app, normalizedStudents);
      const payload = {
        ...studentDebugCounts(students),
        stage: "fetchStudents",
        renderedCount: students.length,
        searchKeyword: "",
        containerExists: Boolean(document.querySelector("#certCard")),
        error: ""
      };
      debugLog("[STUDENTS_DEBUG]", payload);
      debugLog("[STUDENT_CERT_DEBUG]", payload);
      return sortStudents(students);
    } catch (error) {
      console.warn("CloudBase 学员数据读取失败：", error);
      console.error("[SHEX_ERROR]", { code: "", step: "loadStudents:query", detail: formatError(error), rawError: error });
      debugLog("[STUDENT_CERT_DEBUG]", {
        collectionName: collections().students,
        stage: "fetchStudents:error",
        rawCount: 0,
        afterPublicFilterCount: 0,
        afterStatusFilterCount: 0,
        privateCount: 0,
        academyCount: 0,
        renderedCount: 0,
        searchKeyword: "",
        containerExists: Boolean(document.querySelector("#certCard")),
        error: formatError(error)
      });
      notify(friendlyErrorMessage(error, "学员资料暂时没加载出来，稍后再试"));
      throw error;
    }
  }

  function searchStudents(keyword, students = []) {
    const value = String(keyword || "").trim().toLowerCase();
    if (!value) return sortStudents(students.filter(isPublicStudent));
    return students.filter((student) => {
      if (!isPublicStudent(student)) return false;
      const haystack = [
        student.studentId,
        student.name,
        student.nickname,
        student.displayName,
        student.certificateNo,
        student.course,
        student.courseName,
        student.learningStatus,
        student.douyin,
        student.douyinId,
        student.xiaohongshu,
        student.bilibili,
        student.wechat,
        ...(student.courses || []),
        ...(student.accounts || []),
        student.level,
        student.certificationType,
        student.type,
        student.category,
        student.isPublic,
        student.description,
        student.status,
        ...(student.tags || [])
      ].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(value);
    });
  }

  let restoreReady = null;
  async function restoreSessionData({ reloadOnChange = false } = {}) {
    const current = session();
    if (!current) {
      setDataLoadStatus("idle", { restored: false });
      return { current: null, changed: false, restored: false };
    }
    if (shouldUsePlanPreview(current)) {
      const guestOnly = isGuestSession(current) && !PLAN_PREVIEW_MODE && !isLocalPreviewSession(current);
      latestCloudSnapshotMeta = guestOnly
        ? { keyCount: 0, hasXIdentity: false, hasXState: false, hasXStateKey: false, hasLegacyXChat: false, loaded: true, preview: false, xDreamCount: 0, xDeletedDreamCount: 0 }
        : { keyCount: 0, hasXIdentity: true, hasXState: true, hasXStateKey: true, hasLegacyXChat: false, loaded: true, preview: true, xDreamCount: 1, xDeletedDreamCount: 0 };
      setDataLoadStatus("success", { current, preview: !guestOnly });
      document.dispatchEvent(new CustomEvent("shex:user-data-restored", {
        detail: { current, preview: !guestOnly, changed: false, restored: true }
      }));
      return { current, changed: false, restored: true, preview: !guestOnly };
    }
    restoringFromCloud = true;
    window.SHEX_RESTORING_FROM_CLOUD = true;
    setDataLoadStatus("loading", { current, restoringFromCloud });
    migrateLegacyData(current.userId);
    let cloudData = {};
    try {
      cloudData = await loadCloudSnapshot(current.userId);
    } catch (error) {
      console.warn("CloudBase 会话数据恢复失败：", error);
      if (isSessionExpiredError(error) || formatError(error) === FRIENDLY_SESSION_MESSAGE) {
        markSessionExpired();
      } else {
        notify("数据加载失败，请刷新或重新登录");
      }
      restoringFromCloud = false;
      window.SHEX_RESTORING_FROM_CLOUD = false;
      latestCloudSnapshotMeta = { keyCount: 0, hasXIdentity: false, hasXState: false, hasXStateKey: false, hasLegacyXChat: false, loaded: false, failed: true, xDreamCount: null, xDeletedDreamCount: null };
      setDataLoadStatus("failed", { current, error, restoringFromCloud });
      document.dispatchEvent(new CustomEvent("shex:user-data-restore-failed", { detail: { current, error } }));
      return { current, changed: false, restored: false, failed: true };
    }
    const cloudKeys = Object.keys(cloudData || {});
    latestCloudSnapshotMeta = {
      keyCount: Object.keys(cloudData || {}).length,
      hasXIdentity: Boolean(cloudData?.shex_x_link_identity),
      hasXState: hasMeaningfulXState(cloudData?.shex_x_multi_state_v1),
      hasXStateKey: Boolean(cloudData?.shex_x_multi_state_v1),
      hasLegacyXChat: cloudKeys.some((key) => key.startsWith("shex_x_message_history_") || key.startsWith("shex-transmission-")),
      loaded: true,
      ...xStateSnapshotCounts(cloudData?.shex_x_multi_state_v1)
    };
    const applied = applyCloudSnapshot(current.userId, cloudData);
    const changed = applied.changed;
    debugLog("[XLINK_RESTORE_DEBUG]", {
      step: "cloud_snapshot_applied",
      userId: current.userId,
      ownerId: ownerId(),
      dataLoadStatus,
      restoringFromCloud,
      hasIdentityBeforeRestore: "",
      hasIdentityAfterRestore: Boolean(raw.getItem.call(localStorage, scopedKey("shex_x_link_identity", current.userId))),
      rawIdentityValue: raw.getItem.call(localStorage, scopedKey("shex_x_link_identity", current.userId)) || "",
      scopedIdentityKey: scopedKey("shex_x_link_identity", current.userId),
      disclaimerState: raw.getItem.call(localStorage, scopedKey("shex_x_link_disclaimer_v1", current.userId)) || "",
      willShowIdentityForm: false,
      willShowXHome: "",
      reason: "loadSnapshot_success"
    });
    // X103：需要整页 reload 时先 reload、不宣布“恢复成功”。以前先广播成功 → 首页先渲染出来（光点散开、
    // 露出一个点不动的首页）→ 再 reload，手机上看起来就是“闪两下、进来了却点不动”。
    if (changed && reloadOnChange && !/auth\.html$/i.test(location.pathname)) {
      const reloadKey = `shex_restored_once:${current.userId}:${location.pathname}`;
      if (!sessionStorage.getItem(reloadKey)) {
        sessionStorage.setItem(reloadKey, "1");
        window.SHEX_RELOADING_FOR_RESTORE = true;
        window.location.reload();
        return { current, changed, restored: true, reloading: true };
      }
    }
    restoringFromCloud = false;
    window.SHEX_RESTORING_FROM_CLOUD = false;
    setDataLoadStatus("success", { current, changed, restoringFromCloud });
    document.dispatchEvent(new CustomEvent("shex:user-data-restored", { detail: { current, changed, restored: true } }));
    // X103：本机还有云端没有的内容（上次保存失败 / 断网 / 退出前没同步完）时继续上传。
    if (applied.dirty) scheduleSync("post_restore_unsynced_local");
    return { current, changed, restored: true };
  }

  // X103：只在“用户真的回来了”这类事件上检查另一台设备的新资料（由页面的后台恢复流程统一触发），
  // 没有任何定时轮询。同一时间只允许一个检查在途；成功后短时间内不重复检查。
  const SNAPSHOT_PULL_MIN_INTERVAL_MS = 30 * 1000;
  let lastSnapshotPullAt = 0;
  let snapshotPullInFlight = null;
  function pullCloudSnapshotIfChanged(reason = "manual", options = {}) {
    if (snapshotPullInFlight) return snapshotPullInFlight;
    const flight = runCloudSnapshotPull(reason, options).finally(() => {
      if (snapshotPullInFlight === flight) snapshotPullInFlight = null;
    });
    snapshotPullInFlight = flight;
    return flight;
  }

  async function runCloudSnapshotPull(reason = "manual", options = {}) {
    if (syncBlockedReason()) return { ok: false, skipped: true };
    if (options.force !== true && now() - lastSnapshotPullAt < SNAPSHOT_PULL_MIN_INTERVAL_MS) return { ok: true, skipped: true, throttled: true };
    try {
      const result = await enqueueAccountWrite(async () => {
        const current = session();
        if (!current?.userId || syncBlockedReason()) return { ok: false, skipped: true };
        const cloudData = await loadCloudSnapshotViaFunction(current.userId, { knownSnapshotVersion: cloudSnapshotVersion });
        if (cloudData === null) return { ok: true, notModified: true };
        const applied = applyCloudSnapshot(current.userId, cloudData, { notifyRuntime: true, reason: `pull:${reason}` });
        if (applied.dirty) scheduleSync("pull_unsynced_local");
        return { ok: true, changed: applied.changed, dirty: applied.dirty };
      });
      // 只有真正成功才计入冷却；失败（比如刚回前台网络还没通）后可以马上再试。
      if (result?.ok === true) lastSnapshotPullAt = now();
      return result;
    } catch (error) {
      if (isSessionExpiredError(error) || formatError(error) === FRIENDLY_SESSION_MESSAGE) markSessionExpired();
      else console.warn("[SHEX_SNAPSHOT_PULL] failed", String(error?.message || error).slice(0, 160));
      return { ok: false, error };
    }
  }

  function resumePendingSnapshotSync(reason = "resume") {
    if (syncBlockedReason()) return;
    syncRetryAttempt = 0;
    scheduleSync(reason);
  }

  function accountPanel() {
    let panel = document.querySelector("#shexAccountPanel");
    if (!panel) {
      panel = document.createElement("div");
      panel.id = "shexAccountPanel";
      panel.className = "shex-account-panel";
      document.body.appendChild(panel);
    }
    return panel;
  }

  function closeAccountPanel() {
    const panel = document.querySelector("#shexAccountPanel");
    if (!panel) return;
    panel.classList.remove("show");
    panel.style.display = "none";
  }

  // 浏览器不能可靠获知 APK 是否已经下载/安装；只在已运行于 Capacitor 原生壳内时隐藏下载入口。
  function isNativeAppShell() {
    try {
      if (window.ShexNativeStorage && typeof window.ShexNativeStorage.isNative === "function") {
        return !!window.ShexNativeStorage.isNative();
      }
      const capacitor = window.Capacitor || window.ShexCapacitorBridge?.Capacitor;
      return !!(capacitor && typeof capacitor.isNativePlatform === "function" && capacitor.isNativePlatform());
    } catch (_error) {
      return false;
    }
  }

  function openAccountPanel(anchor, current) {
    const panel = accountPanel();
    const name = current.displayName || current.username || "未命名账号";
    const admin = isAdminSession(current);
    const showEnergyPanel = admin || SHOW_USER_ENERGY_PANEL_FOR_NORMAL_USERS;
    const showAppDownload = !isNativeAppShell();
    panel.style.display = "grid";
    panel.innerHTML = `
      <strong>${escapeHtml(name)}</strong>
      <span>账号ID：${escapeHtml(current.userId || "未知")}</span>
        <div class="shex-account-actions">
          ${showEnergyPanel ? '<button type="button" data-shex-plan>X能量</button>' : ""}
          ${showAppDownload ? '<a class="shex-account-download" data-shex-download-app href="./downloads/SHE.X.apk?v=1.3" download="SHE.X.apk">下载 APP</a>' : ""}
          ${admin ? '<button type="button" data-shex-admin>管理后台</button>' : ""}
        <button type="button" data-shex-logout>退出登录</button>
      </div>
    `;
    const rect = anchor.getBoundingClientRect();
    panel.style.top = `${Math.max(12, rect.bottom + 10)}px`;
    panel.style.right = `${Math.max(12, window.innerWidth - rect.right)}px`;
    panel.style.left = "";
    panel.classList.add("show");
    panel.querySelector("[data-shex-plan]")?.addEventListener("click", () => {
      closeAccountPanel();
      void openPlanDialog();
    });
    panel.querySelector("[data-shex-admin]")?.addEventListener("click", () => {
      closeAccountPanel();
      window.location.href = "./admin.html";
    });
    panel.querySelector("[data-shex-logout]")?.addEventListener("click", () => {
      void logoutAndRedirect("./index.html#x-world");
    });
  }

  function renderAuthLinks() {
    const current = session();
    document.querySelectorAll("[data-auth-link]").forEach((link) => {
      const name = current ? (current.displayName || current.username || "我的账号") : "";
      const iconOnly = link.hasAttribute("data-auth-icon-only");
      if (!iconOnly) link.textContent = current ? name : "登录/注册";
      link.classList.toggle("is-logged-in", Boolean(current));
      link.setAttribute("href", "./auth.html");
      link.dataset.initial = current ? String(name).trim().slice(0, 1).toUpperCase() : "";
      link.setAttribute("aria-label", current ? "打开账号菜单" : "登录或注册 SHE.X 账号");
      link.setAttribute("title", iconOnly ? "账号" : (current ? `当前账号：${name}` : "登录或注册 SHE.X 账号"));
      link.onclick = null;
    });
  }

  document.addEventListener("click", (event) => {
    const authLink = event.target.closest?.("[data-auth-link]");
    if (!authLink) return;
    const current = session();
    if (!current) return;
    event.preventDefault();
    event.stopPropagation();
    const panel = document.querySelector("#shexAccountPanel");
    const isOpen = panel?.classList.contains("show");
    if (isOpen) {
      closeAccountPanel();
    } else {
      openAccountPanel(authLink, current);
    }
  }, true);

  document.addEventListener("click", (event) => {
    if (event.target.closest?.("#shexAccountPanel")) return;
    if (event.target.closest?.("[data-auth-link]")) return;
    closeAccountPanel();
  });

  if (PLAN_PREVIEW_MODE || isLocalPreviewSession()) {
    window.addEventListener("DOMContentLoaded", () => {
      const previewTarget = new URLSearchParams(location.search).get("previewOpen");
      if (PLAN_PREVIEW_MODE) {
        setSession(previewSessionPayload());
      }
      ensureLocalPreviewXLinkData();
      setDataLoadStatus("success", { preview: true });
      document.dispatchEvent(new CustomEvent("shex:user-data-restored", {
        detail: { preview: true, restored: true, changed: false }
      }));
      renderAuthLinks();
      window.setTimeout(() => {
        if (previewTarget === "admin") {
          void openAdminRedeemDialog();
        } else if (previewTarget === "plan") {
          void openPlanDialog();
        }
      }, 180);
    });
  }

  async function verifyAdminBackendPassword(password) {
    const current = session();
    if (!current) throw new Error("请先登录");
    const data = await callAuthFunction("verifyAdminBackendPassword", {
      userId: current.userId,
      sessionToken: current.sessionToken,
      password
    });
    return data;
  }

  async function getDashboardStats() {
    const current = session();
    if (!current) throw new Error("请先登录");
    const data = await callAuthFunction("getDashboardStats", {
      userId: current.userId,
      sessionToken: current.sessionToken || ""
    });
    return data;
  }

  async function getRevenueByDateRange(startDate, endDate) {
    const current = session();
    if (!current) throw new Error("请先登录");
    const data = await callAuthFunction("getRevenueByDateRange", {
      userId: current.userId,
      sessionToken: current.sessionToken || "",
      startDate,
      endDate
    });
    return data;
  }

  async function getUserPaymentHistory(targetUserId) {
    const current = session();
    if (!current) throw new Error("请先登录");
    const data = await callAuthFunction("getUserPaymentHistory", {
      userId: current.userId,
      sessionToken: current.sessionToken || "",
      targetUserId
    });
    return data;
  }

  async function adminReverifyOrder(outTradeNo) {
    const current = session();
    if (!current) throw new Error("请先登录");
    const data = await callAuthFunction("adminReverifyOrder", {
      userId: current.userId,
      sessionToken: current.sessionToken || "",
      outTradeNo
    });
    return data;
  }

  async function getFeedbackList(skip, limit) {
    const current = session();
    if (!current) throw new Error("请先登录");
    const data = await callAuthFunction("getFeedbackList", {
      userId: current.userId,
      sessionToken: current.sessionToken || "",
      skip,
      limit
    });
    return data;
  }

  async function getMyFeedbackList(skip = 0, limit = 20) {
    const current = session();
    if (!current || isAuthExpired()) throw new Error(FRIENDLY_SESSION_MESSAGE);
    return callAuthFunction("getMyFeedbackList", {
      userId: current.userId,
      sessionToken: current.sessionToken || "",
      skip,
      limit
    });
  }

  async function replyFeedback(feedbackId, adminReply) {
    const current = session();
    if (!current || isAuthExpired()) throw new Error(FRIENDLY_SESSION_MESSAGE);
    return callAuthFunction("replyFeedback", {
      userId: current.userId,
      sessionToken: current.sessionToken || "",
      feedbackId,
      adminReply
    });
  }

  async function getMonitorEvents(options = {}) {
    const current = session();
    if (!current) throw new Error("请先登录");
    return callAuthFunction("getMonitorEvents", {
      userId: current.userId,
      sessionToken: current.sessionToken || "",
      cursor: String(options.cursor || ""),
      limit: Number(options.limit || 20),
      severity: String(options.severity || ""),
      source: String(options.source || ""),
      deliveryStatus: String(options.deliveryStatus || ""),
      timeRange: String(options.timeRange || "7d"),
      code: String(options.code || "")
    });
  }

  async function getBackendDiagnostics(options = {}) {
    const current = session();
    if (!current) throw new Error("请先登录");
    return callAuthFunction("getBackendDiagnostics", {
      userId: current.userId,
      sessionToken: current.sessionToken || "",
      rangeHours: Number(options.rangeHours || 1)
    });
  }

  async function setBackendDiagnostics({ enabled = false, durationMinutes = 10 } = {}) {
    const current = session();
    if (!current) throw new Error("请先登录");
    return callAuthFunction("setBackendDiagnostics", {
      userId: current.userId,
      sessionToken: current.sessionToken || "",
      enabled: enabled === true,
      durationMinutes: Number(durationMinutes || 10)
    });
  }

  async function getCloudFileTempUrl(fileId) {
    const current = session();
    const data = await callAuthFunction("getCloudFileTempUrl", {
      fileId,
      userId: current?.userId || "",
      sessionToken: current?.sessionToken || ""
    });
    return data;
  }

  async function getRedeemCodeRecords(filter) {
    const current = session();
    if (!current) throw new Error("请先登录");
    const data = await callAuthFunction("getRedeemCodeRecords", {
      userId: current.userId,
      sessionToken: current.sessionToken || "",
      filter
    });
    return data;
  }

  async function adminSearchUsers(query) {
    const current = session();
    if (!current) throw new Error("请先登录");
    const data = await callAuthFunction("adminSearchUsers", {
      userId: current.userId,
      sessionToken: current.sessionToken || "",
      query
    });
    return data;
  }

  async function adminResetUserPassword(targetUserId) {
    const current = session();
    if (!current) throw new Error("请先登录");
    const data = await callAuthFunction("adminResetUserPassword", {
      userId: current.userId,
      sessionToken: current.sessionToken || "",
      targetUserId
    });
    return data;
  }

  async function adminGetEnergyCampaign() {
    const current = session();
    if (!current) throw new Error("请先登录");
    return callAuthFunction("adminGetEnergyCampaign", {
      userId: current.userId,
      sessionToken: current.sessionToken || ""
    });
  }

  async function adminCreateEnergyCampaign({ packAmount, audience, allowedUserIds, title = "", description = "", confirm = false } = {}) {
    const current = session();
    if (!current) throw new Error("请先登录");
    const payload = {
      userId: current.userId,
      sessionToken: current.sessionToken || "",
      packAmount,
      title,
      description,
      confirm
    };
    if (audience !== undefined) payload.audience = audience;
    if (Array.isArray(allowedUserIds)) payload.allowedUserIds = allowedUserIds;
    return callAuthFunction("adminCreateEnergyCampaign", payload);
  }

  async function adminListEnergyCampaigns({ limit } = {}) {
    const current = session();
    if (!current) throw new Error("请先登录");
    return callAuthFunction("adminListEnergyCampaigns", {
      userId: current.userId,
      sessionToken: current.sessionToken || "",
      limit
    });
  }

  async function adminEndEnergyCampaign(eventId, confirm = false) {
    const current = session();
    if (!current) throw new Error("请先登录");
    return callAuthFunction("adminEndEnergyCampaign", {
      userId: current.userId,
      sessionToken: current.sessionToken || "",
      eventId,
      confirm
    });
  }

  async function callCharacterRegistry(action, payload = {}) {
    const current = session();
    if (!current) throw new Error("请先登录");
    const response = await withCloudBaseAuth((api) => api.app.callFunction({
      name: CONFIG.functions?.characterRegistry || "shexCharacterRegistry",
      data: { action, ...payload, userId: current.userId, sessionToken: current.sessionToken || "" },
      timeout: 15000
    }), { retryAuthOnce:/^(?:get|list|preview|health)/i.test(String(action || "")) });
    const result = response?.result || response || {};
    if (!result.ok && !result.success) throw Object.assign(new Error(result.message || "角色服务操作失败"), { code: result.code || "CHARACTER_REGISTRY_FAILED" });
    return result;
  }

  window.SHEXAuth = {
    current: session,
    isCloudConfigured: () => Boolean(CONFIG.envId),
    getRegistrationCaptcha,
    register,
    getEmailRegistrationCaptcha,
    registerWithVerifiedEmail,
    loginWithVerifiedEmail,
    registerWithVerifiedPhone,
    getPhoneBindingStatus,
    bindVerifiedPhone,
    beginPhoneChange,
    confirmPhoneChange,
    login,
    changePassword,
    logout: () => logoutAndRedirect("./auth.html?login=1"),
    clearLocalSession: clearSession,
    getCloudBaseAuth,
    resetCloudBaseIdentityToAnonymous,
    syncNow: () => saveCloudSnapshot(),
    pullCloudSnapshot: pullCloudSnapshotIfChanged,
    restoreSession: restoreSessionData,
    dataLoadStatus: getDataLoadStatus,
    getDataLoadStatus,
    refreshAuthLinks: renderAuthLinks,
    isRestoringFromCloud,
    cloudSnapshotMeta: getCloudSnapshotMeta,
    scopedKey,
    ownerId,
    loadCloudSnapshot,
    collectUserData,
    categorizeData,
    getChatIndexedDbRollout,
    getMyPlan,
    getEnergyHomeSummary,
    bindVerifiedEmail,
    submitAccountDeletionRequest,
    cancelAccountDeletionRequest,
    adminListAccountDeletionRequests,
    adminUpdateAccountDeletionRequest,
    getMyInviteInfo,
    submitInviteCode,
    submitRewardApplication,
    getLimitedCreatorRewardWorks,
    getMyRewardApplications,
    adminListRewardApplications,
    adminReviewRewardApplication,
    adminRetryRewardGrant,
    getCachedPlan: () => latestPlanData,
    getCachedCharacterCapabilities,
    getMyEnergyLogs,
    getMyEnergyCampaign,
    claimEnergyCampaign,
    consumeEnergy,
    redeemCode,
    createPaymentOrder,
    getPaymentOrderStatus,
    resolveMusicLink,
    resolveMusicPlayUrl,
    featurePrice,
    featurePriceLabel,
    getMyPaymentHistory,
    generateRedeemCode,
    verifyAdminBackendPassword,
    getDashboardStats,
    getRevenueByDateRange,
    getUserPaymentHistory,
    adminReverifyOrder,
    getFeedbackList,
    getMyFeedbackList,
    replyFeedback,
    getMonitorEvents,
    getBackendDiagnostics,
    setBackendDiagnostics,
    getCloudFileTempUrl,
    getRedeemCodeRecords,
    adminSearchUsers,
    adminResetUserPassword,
    adminGetEnergyCampaign,
    adminCreateEnergyCampaign,
    adminListEnergyCampaigns,
    adminEndEnergyCampaign,
    callCharacterRegistry,
    openPlan: openPlanDialog,
    openEnergyPage,
    openRecharge: () => openEnergyPage("plans"),
    openMyOrders: () => openEnergyPage("orders"),
    getEnergyCatalog,
    startEnergyPurchase: startPurchase,
    copyText: copyTextToClipboard,
    showEnergyNotEnough: showEnergyNotEnoughToast,
    openAdmin: openAdminRedeemDialog,
    isAdmin: () => isAdminSession(),
    notify,
    callChatSync: callChatSyncFunction
  };

  window.SHEXUserData = {
    getCloudBaseClient: cloud,
    withCloudBaseAuth,
    isCloudBaseTransportAuthError: (value) => sharedCloudBaseClient().isTransportAuthError(value),
    ownerId,
    scopedKey,
    collect: collectUserData,
    categorize: categorizeData,
    syncNow: saveCloudSnapshot,
    syncDiagnostics: () => ({
      ...syncDiagnostics,
      reasons: { ...syncDiagnostics.reasons },
      pending: Boolean(syncTimer),
      saving: isSavingSnapshot
    }),
    snapshotSyncTrace: () => snapshotSyncTrace.map((entry) => ({ ...entry })),
    snapshotDiagnosticVersion: "snapshot-sync-trace-v1",
    withDreamProfileLocalWrite,
    withAuthoritativeInstanceMirrorWrite,
    withBeautifyAppearanceMirrorWrite,
    getDreamProfileStatus: dreamProfileStatus,
    saveDreamProfileGroup,
    getDreamProfiles: () => callDreamProfileAction("getDreamProfiles"),
    verifyDreamProfileShadow: (dreamId) => callDreamProfileAction("verifyDreamProfileShadow", { dreamId }),
    refreshDreamProfileShadow: (dreamId) => callDreamProfileAction("refreshDreamProfileShadow", { dreamId }),
    cutoverDreamProfile: (dreamId) => callDreamProfileAction("cutoverDreamProfile", {
      dreamId,
      expectedDocumentRevision: dreamProfileStatus(dreamId).revision,
      expectedIndexRevision: dreamProfileStorageIndexRevision
    }),
    deleteDreamProfile: (dreamId) => callDreamProfileAction("deleteDreamProfile", { dreamId }),
    resolveDreamProfileConflict: (payload) => callDreamProfileAction("resolveDreamProfileConflict", payload),
    registerPendingFileCleanup,
    registerPendingFileCleanups,
    cleanupTransmissionDateKeysNow,
    scheduleTransmissionDateKeyCleanup
  };
  if (IS_LOCAL_PREVIEW_HOST) {
    window.SHEXUserData.debugPrepareCloudRawData = prepareCloudRawData;
    window.SHEXUserData.debugPromptChatStorageRefresh = promptChatStorageRefresh;
  }

  window.SHEXCloudStorage = {
    uploadFile,
    uploadFiles: (files, kind, options) => Promise.all(Array.from(files || []).map((file) => uploadFile(file, kind, options))),
    fileToDataUrl
  };

  window.SHEXFeedback = {
    open: () => openEnergyPage("feedback"),
    submit: submitFeedback,
    listMine: getMyFeedbackList
  };

  window.SHEXStudents = {
    collectionName: () => collections().students,
    fetchStudents,
    searchStudents,
    sortStudents,
    normalizeStudent,
    isPublicStudent,
    isActiveStudent,
    isPrivateStudent
  };

  document.addEventListener("DOMContentLoaded", renderAuthLinks);
  document.addEventListener("DOMContentLoaded", () => {
    // CloudBase 人机验证回调 iframe（见 auth.html）只供外层 SDK 读取结果，不恢复会话。
    if (window.SHEX_CLOUDBASE_CHALLENGE_CALLBACK_FRAME === true) return;
    if (!restoreReady) restoreReady = restoreSessionData({ reloadOnChange: true });
  });
  // 免登录访客：本脚本先于 defer 的 script.js 执行，这里立即完成恢复，
  // 避免路由初始化时数据状态还是 idle 而卡在「正在链接」加载页。
  try {
    const earlySession = session();
    if (earlySession && shouldUsePlanPreview(earlySession) && !restoreReady) {
      restoreReady = restoreSessionData({ reloadOnChange: true });
    }
  } catch (_) {}
  document.addEventListener("shex:auth-change", () => {
    renderAuthLinks();
    if (!session()) closeAccountPanel();
  });
  document.addEventListener("shex:user-data-restored", (event) => {
    scheduleTransmissionDateKeyCleanup(event.detail?.current?.userId || ownerId());
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      // X103：回到前台时，之前失败过的保存重新尝试（没有待同步内容时不会发请求）。
      // 拉取另一台设备的新资料由页面的后台恢复流程统一触发，避免多个事件各发一遍。
      if (syncRetryAttempt > 0) resumePendingSnapshotSync("visible_resume");
      return;
    }
    if (!syncTimer || syncBlockedReason()) return;
    clearTimeout(syncTimer);
    syncTimer = 0;
    void flushScheduledSnapshotSave("visibility_hidden");
  });
  window.addEventListener("online", () => {
    resumePendingSnapshotSync("online_resume");
  });
  migrateLegacyData(ownerId());
})();
