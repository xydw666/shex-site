/* SHE.X · 拼音打字独立面板
   - 只有通过 + 面板的「拼音」按钮才会出现（常驻小键盘入口已移除）
   - 面板可拖拽（位置存 localStorage）
   - 打字速度放慢（letter 110ms、candidate 620ms、commit 150ms）
   - 候选字顺序随机打乱，让"目标字"也随机混在里面，像真的在选
*/
(function () {
  "use strict";
  if (window.__SHEX_PINYIN_CHAT_BRIDGE__) return;
  window.__SHEX_PINYIN_CHAT_BRIDGE__ = true;

  const CJK = /^[\u3400-\u9fff]$/;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));

  // 默认速度（ms），全部可调
  const DEFAULTS = { letter: 110, candidate: 620, pickPause: 280, commit: 150 };
  function readSpeed() {
    try {
      const raw = localStorage.getItem("shex_pinyin_speed_v1");
      if (raw) {
        const obj = JSON.parse(raw);
        return {
          letter: Number.isFinite(obj.letter) ? obj.letter : DEFAULTS.letter,
          candidate: Number.isFinite(obj.candidate) ? obj.candidate : DEFAULTS.candidate,
          pickPause: Number.isFinite(obj.pickPause) ? obj.pickPause : DEFAULTS.pickPause,
          commit: Number.isFinite(obj.commit) ? obj.commit : DEFAULTS.commit
        };
      }
    } catch (_) {}
    return { ...DEFAULTS };
  }
  function writeSpeed(s) {
    try { localStorage.setItem("shex_pinyin_speed_v1", JSON.stringify(s)); } catch (_) {}
  }
  function getSpeed() { return readSpeed(); }

  let logEl = null;
  let observer = null;
  let attachedAt = 0;
  let queue = Promise.resolve();
  let panel = null;
  let panelElements = {};
  let dictLoading = null;
  let checkTimer = 0;
  let retryCount = 0;
  let allowInQuiet = false;
  let drag = null; // {startX, startY, origLeft, origTop}

  function isAutoOn() {
    try { return localStorage.getItem("shex_pinyin_typing_auto_v1") !== "0"; } catch (_) { return true; }
  }
  function setAutoOn(on) {
    try { localStorage.setItem("shex_pinyin_typing_auto_v1", on ? "1" : "0"); } catch (_) {}
  }
  // 模式：random=乱码单字，words=拼词，fluent=通顺
  function readMode() {
    try {
      const m = localStorage.getItem("shex_pinyin_mode_v1");
      if (m && ["random", "words", "fluent"].includes(m)) return m;
    } catch (_) {}
    return "words";
  }
  function writeMode(m) {
    try { localStorage.setItem("shex_pinyin_mode_v1", m); } catch (_) {}
  }

  // 自主发送开关
  function isAutoSpeakOn() {
    try { return localStorage.getItem("shex_pinyin_autospeak_v1") === "1"; } catch (_) { return false; }
  }
  function setAutoSpeakOn(on) {
    try { localStorage.setItem("shex_pinyin_autospeak_v1", on ? "1" : "0"); } catch (_) {}
  }
  // 自主发送间隔（秒）：默认 20 秒，上限 600 秒（10分钟）
  const AUTOSPEAK_DEFAULTS = { interval: 20 };
  function readAutoSpeakInterval() {
    try {
      const raw = localStorage.getItem("shex_pinyin_autospeak_interval_v1");
      if (raw) {
        const n = Number(raw);
        if (Number.isFinite(n) && n >= 5 && n <= 600) return n;
      }
    } catch (_) {}
    return AUTOSPEAK_DEFAULTS.interval;
  }
  function writeAutoSpeakInterval(n) {
    try { localStorage.setItem("shex_pinyin_autospeak_interval_v1", String(n)); } catch (_) {}
  }
  // 冷却：发完之后至少等多久才能再发（秒）
  let autoSpeakCooldownUntil = 0;

  let autoSpeakTimer = 0;
  function scheduleAutoSpeak() {
    clearTimeout(autoSpeakTimer);
    if (!isAutoSpeakOn() || !panel || !panel.classList.contains("is-open")) return;

    const intervalSec = readAutoSpeakInterval();
    // 每次 tick 都重新随机，纯概率：interval=20 秒时每 tick 有 ~17% 概率发
    // interval=10 秒时 ~33%，interval=60 秒时 ~5%
    const delay = 3000 + Math.random() * Math.max(2000, intervalSec * 500);
    autoSpeakTimer = setTimeout(() => {
      // 检查各种不发的条件
      if (!isAutoSpeakOn() || !panel || !panel.classList.contains("is-open")) return scheduleAutoSpeak();
      if (!logEl) return scheduleAutoSpeak();
      if (Date.now() < autoSpeakCooldownUntil) return scheduleAutoSpeak();
      // 概率随机：1/intervalSec 概率，interval=20 → ~5% 每秒一次，约每 20 秒一次
      if (Math.random() * intervalSec > 1) return scheduleAutoSpeak();
      // 不要有正在打动画的气泡——等打完
      const all = logEl.querySelectorAll(".ix-bubble.ta");
      const last = all[all.length - 1];
      if (last && (last.classList.contains("is-pinyin-typing") || last.dataset.xPinyinDemo === "1")) return scheduleAutoSpeak();
      // 不要太频繁：冷却 intervalSec 秒
      autoSpeakCooldownUntil = Date.now() + intervalSec * 1000;

      const text = typeof window.SHEXGenerateTypingSentence === "function"
        ? window.SHEXGenerateTypingSentence(readMode()) : "想你了。";
      const bubble = document.createElement("div");
      bubble.className = "ix-bubble ta";
      bubble.dataset.xPinyinDemo = "1";
      const content = document.createElement("span");
      content.className = "ix-text"; content.textContent = text;
      bubble.appendChild(content);
      logEl.appendChild(bubble);
      logEl.scrollTop = logEl.scrollHeight;
      scheduleAutoSpeak();
    }, delay);
  }

  function hasDict() { return !!(window.SHEX_PINYIN_DICT && window.SHEX_CHAR_PINYIN); }
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src; script.async = false;
      script.onload = () => resolve(true); script.onerror = () => reject(new Error(src));
      document.head.appendChild(script);
    });
  }
  function loadDicts() {
    if (hasDict()) return Promise.resolve(true);
    if (dictLoading) return dictLoading;
    dictLoading = Promise.all([
      loadScript("./x-world/chat/pinyin-dictionary.js"),
      loadScript("./x-world/chat/pinyin-char-map.js")
    ]).then(hasDict).catch(() => false);
    return dictLoading;
  }

  // Fisher–Yates 洗牌
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function loadPanelPos() {
    try {
      const raw = localStorage.getItem("shex_pinyin_panel_pos");
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (typeof obj?.left === "number" && typeof obj?.top === "number") return obj;
    } catch (_) {}
    return null;
  }
  function savePanelPos(left, top) {
    try { localStorage.setItem("shex_pinyin_panel_pos", JSON.stringify({ left, top })); } catch (_) {}
  }

  function defaultPanelPos() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const pw = 272;
    const ph = 280;
    return {
      left: Math.max(12, vw - pw - 12),
      top: Math.max(60, vh - ph - 140)
    };
  }

  function ensurePanel() {
    if (panel && panel.isConnected) return panel;

    panel = document.createElement("div");
    panel.id = "xPinyinPanel";
    panel.innerHTML = [
      '<div class="xpty-panel">',
      '  <div class="xpty-head">',
      '    <span class="xpty-drag" title="按住拖拽">⋮⋮</span>',
      '    <span class="xpty-title">⌨ 拼音打字</span>',
      '    <span class="xpty-status" aria-hidden="true" title="状态"></span>',
      '    <button class="xpty-settings-toggle" type="button" aria-label="速度设置" title="速度设置">⚙</button>',
      '    <button class="xpty-minimize" type="button" aria-label="最小化" title="最小化">—</button>',
      '    <button class="xpty-close" type="button" aria-label="关闭" title="关闭">×</button>',
      '  </div>',
      '  <div class="xpty-hint-row"><span class="xpty-hint">已就绪</span></div>',
      '  <div class="xpty-compose"><span class="xpty-letters"></span><i class="xpty-caret"></i></div>',
      '  <div class="xpty-candidates"></div>',
      '  <div class="xpty-controls">',
      '    <button class="xpty-toggle" type="button"></button>',
      '    <button class="xpty-autospeak" type="button">自主发送</button>',
      '    <button class="xpty-demo" type="button">演示一句</button>',
      '  </div>',
      '  <div class="xpty-settings" hidden>',
      '    <div class="xpty-setting-row">',
      '      <label>打字模式</label>',
      '      <div class="xpty-mode-group">',
      '        <button type="button" class="xpty-mode-btn" data-mode="random">乱码</button>',
      '        <button type="button" class="xpty-mode-btn" data-mode="words">拼词</button>',
      '        <button type="button" class="xpty-mode-btn" data-mode="fluent">通顺</button>',
      '      </div>',
      '    </div>',
      '    <div class="xpty-setting-row">',
      '      <label>字母速度</label>',
      '      <input type="range" class="xpty-speed" data-speed="letter" min="30" max="300" step="10">',
      '      <span class="xpty-speed-val" data-speed-val="letter">—</span>',
      '    </div>',
      '    <div class="xpty-setting-row">',
      '      <label>选字停留</label>',
      '      <input type="range" class="xpty-speed" data-speed="candidate" min="120" max="1400" step="20">',
      '      <span class="xpty-speed-val" data-speed-val="candidate">—</span>',
      '    </div>',
      '    <div class="xpty-setting-row">',
      '      <label>上屏停顿</label>',
      '      <input type="range" class="xpty-speed" data-speed="commit" min="40" max="500" step="10">',
      '      <span class="xpty-speed-val" data-speed-val="commit">—</span>',
      '    </div>',
      '    <div class="xpty-setting-row">',
      '      <label>自主发送间隔</label>',
      '      <input type="range" class="xpty-speed" data-speed="autospeak-interval" min="5" max="600" step="5">',
      '      <span class="xpty-speed-val" data-speed-val="autospeak-interval">—</span>',
      '    </div>',
      '    <div class="xpty-settings-actions">',
      '      <button class="xpty-wordbank" type="button">我的词库</button>',
      '      <button class="xpty-reset" type="button">恢复默认</button>',
      '    </div>',
      '  </div>',
      '</div>'
    ].join("");
    document.body.appendChild(panel);

    panelElements = {
      root: panel,
      panel: panel.querySelector(".xpty-panel"),
      head: panel.querySelector(".xpty-head"),
      drag: panel.querySelector(".xpty-drag"),
      title: panel.querySelector(".xpty-title"),
      status: panel.querySelector(".xpty-status"),
      hint: panel.querySelector(".xpty-hint"),
      letters: panel.querySelector(".xpty-letters"),
      candidates: panel.querySelector(".xpty-candidates"),
      toggle: panel.querySelector(".xpty-toggle"),
      autospeak: panel.querySelector(".xpty-autospeak"),
      close: panel.querySelector(".xpty-close"),
      minimize: panel.querySelector(".xpty-minimize"),
      demo: panel.querySelector(".xpty-demo"),
      settingsToggle: panel.querySelector(".xpty-settings-toggle"),
      settings: panel.querySelector(".xpty-settings"),
      wordbankBtn: panel.querySelector(".xpty-wordbank"),
      reset: panel.querySelector(".xpty-reset"),
      modeBtns: Array.from(panel.querySelectorAll(".xpty-mode-btn")),
      speedInputs: Object.fromEntries(
        Array.from(panel.querySelectorAll(".xpty-speed")).map((el) => [el.dataset.speed, el])
      ),
      speedVals: Object.fromEntries(
        Array.from(panel.querySelectorAll(".xpty-speed-val")).map((el) => [el.dataset.speedVal, el])
      )
    };

    // 位置
    const saved = loadPanelPos() || defaultPanelPos();
    panel.style.left = saved.left + "px";
    panel.style.top = saved.top + "px";
    panel.style.right = "auto";
    panel.style.bottom = "auto";
    panel.style.position = "fixed";
    panel.style.zIndex = "9999";

    // 拖拽 —— 最稳方案：panel 上捕获 setPointerCapture，rAF 节流改 left/top
    const head = panelElements.head;
    let isDragging = false;
    let rafPending = false;
    let pendingLeft = 0, pendingTop = 0;

    function scheduleFlush() {
      if (rafPending) return;
      rafPending = true;
      requestAnimationFrame(() => {
        rafPending = false;
        if (!isDragging) return;
        panel.style.left = pendingLeft + "px";
        panel.style.top = pendingTop + "px";
      });
    }

    head.addEventListener("pointerdown", (e) => {
      if (e.target.closest(".xpty-close, .xpty-minimize, .xpty-settings-toggle")) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      e.preventDefault();
      isDragging = true;
      const startX = e.clientX, startY = e.clientY;
      const baseLeft = panel.offsetLeft;
      const baseTop = panel.offsetTop;
      pendingLeft = baseLeft;
      pendingTop = baseTop;
      panel.setPointerCapture?.(e.pointerId);

      const onMove = (ev) => {
        if (!isDragging || ev.pointerId !== e.pointerId) return;
        const vw = window.innerWidth, vh = window.innerHeight;
        const pw = panel.offsetWidth, ph = panel.offsetHeight;
        const left = Math.max(4, Math.min(baseLeft + ev.clientX - startX, vw - pw - 4));
        const top = Math.max(4, Math.min(baseTop + ev.clientY - startY, vh - ph - 4));
        pendingLeft = left;
        pendingTop = top;
        scheduleFlush();
      };
      const onUp = () => {
        if (!isDragging) return;
        isDragging = false;
        panel.releasePointerCapture?.(e.pointerId);
        window.removeEventListener("pointermove", onMove, true);
        window.removeEventListener("pointerup", onUp, true);
        window.removeEventListener("pointercancel", onUp, true);
        // 落最后一帧并保存
        panel.style.left = pendingLeft + "px";
        panel.style.top = pendingTop + "px";
        savePanelPos(pendingLeft, pendingTop);
      };
      window.addEventListener("pointermove", onMove, true);
      window.addEventListener("pointerup", onUp, true);
      window.addEventListener("pointercancel", onUp, true);
    });

    // 关闭按钮
    panelElements.close.addEventListener("click", () => panel.classList.remove("is-open"));
    panelElements.minimize.addEventListener("click", () => {
      panel.classList.toggle("is-minimized");
      panelElements.minimize.textContent = panel.classList.contains("is-minimized") ? "▢" : "—";
    });
    // 开关
    panelElements.toggle.addEventListener("click", () => {
      const next = !isAutoOn();
      setAutoOn(next);
      renderPanelState();
      if (next) showHint("已开启，TA 回复会逐字打出来");
      else { showHint("已关闭，TA 回复直接显示"); clearAnimateArea(); }
    });
    // 自主发送
    panelElements.autospeak?.addEventListener("click", () => {
      const next = !isAutoSpeakOn();
      setAutoSpeakOn(next);
      renderPanelState();
      if (next) { showHint("自主发送已开启，TA 会随机主动说"); scheduleAutoSpeak(); }
      else { showHint("自主发送已关闭"); clearAnimateArea(); scheduleAutoSpeak(); }
    });
    // 面板打开时如果自主发送是开着的，启动定时器
    if (isAutoSpeakOn() && panel.classList.contains("is-open")) scheduleAutoSpeak();
    // 演示
    panelElements.demo.addEventListener("click", () => {
      const bubble = createDemoBubble();
      if (bubble) bubble.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });

    // 设置区
    function renderSpeeds() {
      const s = getSpeed();
      for (const key of ["letter", "candidate", "commit"]) {
        const input = panelElements.speedInputs[key];
        const val = panelElements.speedVals[key];
        if (input) { input.value = String(s[key]); }
        if (val) val.textContent = s[key] + " ms";
      }
      // 自主发送间隔单独处理
      const aiInput = panelElements.speedInputs["autospeak-interval"];
      const aiVal = panelElements.speedVals["autospeak-interval"];
      const interval = readAutoSpeakInterval();
      if (aiInput) aiInput.value = String(interval);
      if (aiVal) aiVal.textContent = interval + " 秒";
    }
    function renderModes() {
      const cur = readMode();
      panelElements.modeBtns.forEach((btn) => {
        const on = btn.dataset.mode === cur;
        btn.classList.toggle("is-on", on);
        if (on) btn.style.background = "#b78e65", btn.style.color = "#fff";
        else { btn.style.background = ""; btn.style.color = ""; }
      });
    }
    panelElements.settingsToggle?.addEventListener("click", () => {
      const hidden = panelElements.settings.hasAttribute("hidden");
      if (hidden) { renderSpeeds(); renderModes(); }
      panelElements.settings.hidden = !hidden;
    });
    // 速度滑块事件
    for (const key of Object.keys(panelElements.speedInputs)) {
      const input = panelElements.speedInputs[key];
      input.addEventListener("input", () => {
        if (key === "autospeak-interval") {
          writeAutoSpeakInterval(Number(input.value));
          const v = panelElements.speedVals[key];
          if (v) v.textContent = input.value + " 秒";
          return;
        }
        const s = getSpeed();
        s[key] = Number(input.value) || DEFAULTS[key];
        writeSpeed(s);
        const v = panelElements.speedVals[key];
        if (v) v.textContent = s[key] + " ms";
      });
    }
    // 模式按钮事件
    panelElements.modeBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const m = btn.dataset.mode;
        writeMode(m);
        renderModes();
        showHint("已切换为" + ({random:"乱码模式",words:"拼词模式",fluent:"通顺模式"}[m] || m));
      });
    });
    panelElements.reset?.addEventListener("click", () => {
      writeSpeed({ ...DEFAULTS });
      writeAutoSpeakInterval(AUTOSPEAK_DEFAULTS.interval);
      renderSpeeds();
      renderModes();
      showHint("已恢复默认");
    });
    // 我的词库
    panelElements.wordbankBtn?.addEventListener("click", () => openWordBankModal());

    renderPanelState();
    return panel;
  }

  /* ============ 词库管理浮层 ============ */
  function guessPinyin(text) {
    if (!text) return "";
    const charMap = window.SHEX_CHAR_PINYIN || {};
    // 单字 → 直接查 char-map
    if (text.length === 1) return charMap[text] || "";
    // 多字词组 → 逐字拼
    let out = "";
    for (const ch of text) {
      if (charMap[ch]) out += charMap[ch];
      else return ""; // 有一个字查不到就放弃，让用户自己填
    }
    return out;
  }

  function openWordBankModal() {
    const api = window.SHEXPinyinUserBank;
    if (!api) { showHint("词库模块未加载"); return; }
    const CJK = /^[\u3400-\u9fff]$/;

    const modal = document.createElement("div");
    modal.className = "xpty-wordbank-modal";
    modal.innerHTML = [
      '<div class="xpty-wb-backdrop"></div>',
      '<div class="xpty-wb-dialog">',
      '  <div class="xpty-wb-head">',
      '    <span class="xpty-wb-title">📚 我的词库</span>',
      '    <button class="xpty-wb-close" type="button" aria-label="关闭">×</button>',
      '  </div>',
      '  <div class="xpty-wb-body">',
      '    <div class="xpty-wb-note">单字自动补拼音，多字词组拼音请自己填。<br>原站字典不动，你加的合进去，纯随机抽。</div>',
      '    <div class="xpty-wb-section">',
      '      <div class="xpty-wb-label">单个添加</div>',
      '      <div class="xpty-wb-add-row-2">',
      '        <input type="text" class="xpty-wb-input" placeholder="字或词组，如 晚安">',
      '        <input type="text" class="xpty-wb-input xpty-wb-pinyin" placeholder="拼音，如 wanan">',
      '        <button type="button" class="xpty-wb-btn xpty-wb-btn-primary">添加</button>',
      '      </div>',
      '      <div class="xpty-wb-auto-hint"></div>',
      '    </div>',
      '    <div class="xpty-wb-section">',
      '      <div class="xpty-wb-label">批量粘贴（一行一条，格式：字=拼音 或 只写字）</div>',
      '      <textarea class="xpty-wb-textarea" rows="5" placeholder="鱼=yu&#10;晚安=wanan&#10;想你"></textarea>',
      '      <div class="xpty-wb-add-row">',
      '        <button type="button" class="xpty-wb-btn xpty-wb-btn-primary xpty-wb-btn-block">批量添加</button>',
      '      </div>',
      '    </div>',
      '    <div class="xpty-wb-section">',
      '      <div class="xpty-wb-label-row">',
      '        <span class="xpty-wb-label">已有词条 <em class="xpty-wb-count">0</em></span>',
      '        <label class="xpty-wb-check"><input type="checkbox" class="xpty-wb-check-all"> 全选</label>',
      '      </div>',
      '      <div class="xpty-wb-list"></div>',
      '      <div class="xpty-wb-list-actions">',
      '        <button type="button" class="xpty-wb-btn xpty-wb-btn-danger xpty-wb-btn-block-del">删除选中</button>',
      '        <button type="button" class="xpty-wb-btn xpty-wb-btn-danger-outline xpty-wb-btn-clear">🗑 清空全部</button>',
      '      </div>',
      '    </div>',
      '  </div>',
      '</div>'
    ].join("");
    document.body.appendChild(modal);

    const listEl = modal.querySelector(".xpty-wb-list");
    const countEl = modal.querySelector(".xpty-wb-count");
    const allCheck = modal.querySelector(".xpty-wb-check-all");
    const singleInput = modal.querySelectorAll(".xpty-wb-input")[0];
    const pinyinInput = modal.querySelectorAll(".xpty-wb-input")[1];
    const autoHint = modal.querySelector(".xpty-wb-auto-hint");
    const singleBtn = modal.querySelector(".xpty-wb-btn-primary");
    const batchInput = modal.querySelector(".xpty-wb-textarea");
    const batchBtn = modal.querySelector(".xpty-wb-btn-block");
    const delSelBtn = modal.querySelector(".xpty-wb-btn-block-del");
    const clearBtn = modal.querySelector(".xpty-wb-btn-clear");

    // 单字时自动推导拼音
    singleInput.addEventListener("input", () => {
      const v = singleInput.value.trim();
      if (v.length === 1 && CJK.test(v)) {
        const py = guessPinyin(v);
        if (py && !pinyinInput.value) {
          pinyinInput.value = py;
          autoHint.textContent = "已自动填拼音：" + py;
          setTimeout(() => { if (autoHint.textContent === "已自动填拼音：" + py) autoHint.textContent = ""; }, 1500);
        }
      } else {
        autoHint.textContent = "";
      }
    });

    function refreshList() {
      const arr = api.getAll().slice().reverse();
      countEl.textContent = String(arr.length);
      if (!arr.length) {
        listEl.innerHTML = '<div class="xpty-wb-empty">还没有词条</div>';
        allCheck.checked = false;
        return;
      }
      listEl.innerHTML = arr.map((e, i) => {
        const key = e.text + "|" + e.pinyin;
        return `<div class="xpty-wb-item">
          <label><input type="checkbox" class="xpty-wb-item-check" data-idx="${i}" data-key="${key}">
          <span class="xpty-wb-item-text">${e.text.replace(/</g,'<').replace(/>/g,'>')}</span>
          <span class="xpty-wb-item-py">${e.pinyin}</span>
          </label>
          <button class="xpty-wb-item-del" data-key="${key}">×</button>
        </div>`;
      }).join("");
      allCheck.checked = false;
      listEl.querySelectorAll(".xpty-wb-item-del").forEach((btn) => {
        btn.addEventListener("click", () => {
          api.remove([btn.dataset.key]); refreshList();
        });
      });
    }
    refreshList();

    const close = () => modal.remove();
    modal.querySelector(".xpty-wb-close").addEventListener("click", close);
    modal.querySelector(".xpty-wb-backdrop").addEventListener("click", close);
    modal.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });

    singleBtn.addEventListener("click", () => {
      const text = singleInput.value.trim();
      const py = pinyinInput.value.trim().toLowerCase();
      if (!text) return;
      let finalPy = py || guessPinyin(text);
      if (!finalPy) { showHint("多字词组请填拼音"); return; }
      const r = api.add([{ text, pinyin: finalPy }]);
      if (r.added > 0) {
        singleInput.value = ""; pinyinInput.value = ""; autoHint.textContent = "";
        refreshList();
      }
      showHint("✓ 添加，总共 " + r.total);
    });
    singleInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); singleBtn.click(); }
    });
    pinyinInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); singleBtn.click(); }
    });

    batchBtn.addEventListener("click", () => {
      const lines = (batchInput.value || "").split(/[\n\r]+/).map((s) => s.trim()).filter(Boolean);
      if (!lines.length) return;
      const items = [];
      for (const line of lines) {
        let text = line, py = "";
        const eq = line.indexOf("=");
        const tab = line.indexOf("\t");
        const sep = eq >= 0 ? eq : tab >= 0 ? tab : -1;
        if (sep > 0) {
          text = line.slice(0, sep).trim();
          py = line.slice(sep + 1).trim().toLowerCase();
        }
        if (!text) continue;
        if (!py) py = guessPinyin(text);
        if (!py) continue; // 跳过无法推导且没填拼音的
        items.push({ text, pinyin: py });
      }
      if (!items.length) { showHint("没有有效条目"); return; }
      const r = api.add(items);
      batchInput.value = ""; refreshList();
      showHint("✓ 批量添加 " + r.added + " 条，总共 " + r.total);
    });

    allCheck.addEventListener("change", () => {
      listEl.querySelectorAll(".xpty-wb-item-check").forEach((c) => { c.checked = allCheck.checked; });
    });

    delSelBtn.addEventListener("click", () => {
      const checks = Array.from(listEl.querySelectorAll(".xpty-wb-item-check:checked"));
      if (!checks.length) return;
      const keys = checks.map((c) => c.dataset.key);
      api.remove(keys); refreshList();
      showHint("已删除 " + keys.length + " 条");
    });

    clearBtn.addEventListener("click", () => {
      const total = api.getAll().length;
      if (total === 0) return;
      if (!confirm("确定清空全部 " + total + " 条？原站字典不会被删。")) return;
      api.clear(); refreshList();
      showHint("已清空");
    });

    return modal;
  }

  function renderPanelState() {
    if (!panelElements.toggle) return;
    const on = isAutoOn();
    panelElements.toggle.textContent = on ? "关闭拼音" : "开启拼音";
    panelElements.toggle.classList.toggle("is-on", on);
    // 自主发送按钮
    const autoSpeakOn = isAutoSpeakOn();
    if (panelElements.autospeak) {
      panelElements.autospeak.textContent = autoSpeakOn ? "停止主动" : "自主发送";
      panelElements.autospeak.classList.toggle("is-on", autoSpeakOn);
    }
    // 标题栏状态点
    if (panelElements.status) {
      const parts = [];
      if (on) parts.push("typing");
      if (autoSpeakOn) parts.push("auto");
      panelElements.status.className = "xpty-status" + (parts.length ? " " + parts.join(" ") : "");
    }
  }
  function showHint(text) { if (panelElements.hint) panelElements.hint.textContent = text; }
  function setLetters(text) { if (panelElements.letters) panelElements.letters.textContent = text; }
  function setCandidates(list, target) {
    if (!panelElements.candidates) return;
    if (!list || !list.length) { panelElements.candidates.innerHTML = ""; return; }
    panelElements.candidates.innerHTML = list
      .map((item, i) => `<span class="xpty-cand${item === target ? " is-target" : ""}">${i + 1} ${item}</span>`)
      .join("");
  }
  function clearAnimateArea() { setLetters(""); setCandidates(null, null); }

  // 对外 API
  window.SHEXPinyinBridge = Object.freeze({
    open: () => { ensurePanel(); panel.classList.add("is-open"); renderPanelState(); },
    close: () => { if (panel) panel.classList.remove("is-open"); },
    toggle: () => { ensurePanel(); panel.classList.toggle("is-open"); renderPanelState(); },
    isOpen: () => !!(panel && panel.classList.contains("is-open")),
    isOn: isAutoOn,
    setOn: setAutoOn
  });

  function createDemoBubble() {
    if (!logEl) return null;
    const text = typeof window.SHEXGenerateTypingSentence === "function"
      ? window.SHEXGenerateTypingSentence(readMode()) : "想你了。";
    const bubble = document.createElement("div");
    bubble.className = "ix-bubble ta";
    bubble.dataset.xPinyinDemo = "1";
    const content = document.createElement("span");
    content.className = "ix-text"; content.textContent = text;
    bubble.appendChild(content);
    logEl.appendChild(bubble);
    logEl.scrollTop = logEl.scrollHeight;
    return bubble;
  }

  function keepAtBottom(bubble) {
    const log = bubble.closest("#ixLog") || logEl;
    if (!log) return;
    const nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 180;
    if (nearBottom) log.scrollTop = log.scrollHeight;
  }

  async function animate(bubble, textEl, text) {
    const speed = getSpeed();
    const dict = window.SHEX_PINYIN_DICT || {};
    const charMap = window.SHEX_CHAR_PINYIN || {};
    const chars = Array.from(text);
    const length = chars.length;
    const dumpAfter = length <= 60 ? length : 24;

    ensurePanel();
    panel.classList.add("is-open");
    showHint("TA 正在敲键盘…");
    // 动画期间气泡里只放占位符，不逐字显示
    textEl.textContent = "……";
    textEl.classList.add("is-pinyin-typing");
    bubble.classList.add("is-pinyin-typing");

    try {
      for (let index = 0; index < length; index += 1) {
        if (!bubble.isConnected) return;
        const char = chars[index];
        if (index >= dumpAfter) { break; } // 长的不逐字演拼音了，直接走 finally
        const pinyin = CJK.test(char) ? charMap[char] : "";
        // 候选字合并：原站 dict + 用户自定义（同拼音条目）
        const getCandidates = (py) => {
          const withUser = typeof window.SHEXPinyinDictWithUser === "function"
            ? window.SHEXPinyinDictWithUser(py)
            : ((dict[py] || []).slice());
          return withUser.slice(0, 8);
        };
        if (pinyin && (dict[pinyin] || (typeof window.SHEXPinyinDictWithUser === "function" && window.SHEXPinyinDictWithUser(pinyin).length))) {
          let typed = "";
          for (const letter of pinyin) {
            typed += letter;
            setLetters(typed);
            await sleep(speed.letter * (0.8 + Math.random() * 0.6));
            if (!bubble.isConnected) return;
          }
          let candidates = getCandidates(pinyin);
          if (!candidates.includes(char)) {
            if (candidates.length >= 9) candidates.pop();
            candidates.push(char);
          }
          candidates = shuffle(candidates);
          showHint("正在候选字里选字…");
          setCandidates(candidates, char);
          await sleep(speed.candidate * (0.8 + Math.random() * 0.5));
          if (!bubble.isConnected) return;
          setCandidates(candidates, char);
          await sleep(speed.pickPause * (0.7 + Math.random() * 0.6));
          setLetters(""); setCandidates(null, null);
        } else if (char === "\n") {
          await sleep(speed.commit + 60);
        } else {
          await sleep(Math.min(speed.commit, 80));
        }
        await sleep(speed.commit * (0.7 + Math.random() * 0.6));
      }
    } finally {
      // 动画结束才一次性放出完整句子
      textEl.textContent = text;
      textEl.classList.remove("is-pinyin-typing");
      bubble.classList.remove("is-pinyin-typing");
      showHint("打字完成 ✓ 拖动面板可移动，× 可关闭");
      clearAnimateArea();
    }
  }

  function findTextEl(bubble) {
    const candidates = Array.from(bubble.children);
    const el = candidates.find((node) => node.classList?.contains("ix-text"));
    if (!el) return null;
    if (el.childElementCount > 0) return null;
    return el;
  }
  function isPendingBubble(bubble) {
    return bubble.classList.contains("typing")
      || bubble.classList.contains("x-typing-bubble")
      || bubble.classList.contains("x-streaming-bubble");
  }

  function checkLatest() {
    if (!logEl || !logEl.isConnected) return;
    const all = logEl.querySelectorAll(".ix-bubble.ta");
    const bubble = all[all.length - 1];
    if (!bubble) return;
    if (bubble.dataset.xPinyinDone === "1") return;
    // 只处理拼音功能自己创建的气泡（演示/自主发送），字卡/原站 AI 回复一律跳过
    const isDemo = bubble.dataset.xPinyinDemo === "1";
    if (!isDemo) return;
    if (!isAutoOn()) return;
    if (isPendingBubble(bubble)) { scheduleCheck(700); return; }
    const textEl = findTextEl(bubble);
    if (!textEl) { scheduleCheck(500); return; }
    const text = String(textEl.textContent || "").trim();
    if (!text) { scheduleCheck(500); return; }
    if (text.length > 400) return;
    bubble.dataset.xPinyinDone = "1";
    retryCount = 0; allowInQuiet = false;
    void loadDicts().then((ready) => {
      if (!ready) { delete bubble.dataset.xPinyinDone; return; }
      queue = queue.then(() => animate(bubble, textEl, text)).catch(() => {});
    });
  }

  function scheduleCheck(delay) {
    clearTimeout(checkTimer);
    checkTimer = window.setTimeout(() => {
      const quietLeft = 2500 - (Date.now() - attachedAt);
      if (quietLeft > 0) {
        if (!allowInQuiet) return;
        scheduleCheck(quietLeft + 80);
        return;
      }
      if (retryCount > 60) return;
      retryCount += 1;
      checkLatest();
    }, typeof delay === "number" ? delay : 700);
  }

  function countTaBubbles(node) {
    if (!(node instanceof Element)) return 0;
    let count = node.matches?.(".ix-bubble.ta") ? 1 : 0;
    count += node.querySelectorAll?.(".ix-bubble.ta").length || 0;
    return count;
  }

  function attach() {
    const log = document.getElementById("ixLog");
    if (!log) { if (logEl) { observer?.disconnect(); observer = null; logEl = null; } return; }
    if (log === logEl && observer) return;
    observer?.disconnect();
    logEl = log;
    attachedAt = Date.now(); retryCount = 0; allowInQuiet = false;
    observer = new MutationObserver((records) => {
      let removed = 0, addedElements = 0, taAdded = 0;
      let textChanged = false, classChanged = false, demoAdded = false;
      records.forEach((record) => {
        removed += record.removedNodes.length;
        if (record.type === "characterData") textChanged = true;
        if (record.type === "attributes") classChanged = true;
        record.addedNodes.forEach((node) => {
          if (node instanceof Element) {
            addedElements += 1;
            if (node.dataset?.xPinyinDemo === "1") demoAdded = true;
          }
          taAdded += countTaBubbles(node);
        });
      });
      if (removed > 3) attachedAt = Date.now();
      if (taAdded === 1 && addedElements <= 3) allowInQuiet = true;
      if (demoAdded) allowInQuiet = true;
      const taAll = log.querySelectorAll(".ix-bubble.ta");
      const lastTa = taAll[taAll.length - 1] || null;
      if (textChanged && lastTa && isPendingBubble(lastTa)) allowInQuiet = true;
      if (taAdded || textChanged || classChanged) scheduleCheck(700);
    });
    observer.observe(log, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["class"] });
  }

  // 样式
  function injectStyles() {
    if (document.getElementById("xPinyinStyles")) return;
    const css = [
      "#xPinyinPanel .xpty-panel{",
      "  position:static; width:272px; max-width:92vw;",
      "  background:#fff9f2; color:#5a4a3c; border-radius:16px;",
      "  box-shadow:0 8px 28px rgba(90,74,60,.22);",
      "  border:1px solid rgba(183,142,101,.25);",
      "  font:13px/1.5 -apple-system,system-ui,'PingFang SC','Microsoft YaHei',sans-serif;",
      "  overflow:hidden; transition:none;",
      "}",
      "#xPinyinPanel.is-open{display:block;animation:xptySlide .2s ease-out;}",
      "#xPinyinPanel{display:none;}",
      "@keyframes xptySlide{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:translateY(0);}}",
      "#xPinyinPanel .xpty-head{",
      "  display:flex;align-items:center;gap:6px;",
      "  padding:8px 12px;background:rgba(183,142,101,.14);cursor:grab;user-select:none;",
      "}",
      "#xPinyinPanel .xpty-head:active{cursor:grabbing;}",
      "#xPinyinPanel .xpty-drag{",
      "  width:22px;height:20px;color:#8c6e52;font-size:14px;",
      "  display:flex;align-items:center;justify-content:center;flex-shrink:0;cursor:grab;",
      "}",
      "#xPinyinPanel .xpty-title{flex:1;font-size:13px;font-weight:600;letter-spacing:.5px;}",
      "#xPinyinPanel .xpty-close{",
      "  width:24px;height:24px;border:0;background:transparent;color:#8c6e52;",
      "  font-size:18px;line-height:1;border-radius:6px;cursor:pointer;flex-shrink:0;",
      "  transition:background .15s; display:flex;align-items:center;justify-content:center;",
      "}",
      "#xPinyinPanel .xpty-close:hover{background:rgba(183,142,101,.22);color:#4a3a28;}",
      "#xPinyinPanel .xpty-minimize{",
      "  width:24px;height:24px;border:0;background:transparent;color:#8c6e52;",
      "  font-size:14px;line-height:1;border-radius:6px;cursor:pointer;flex-shrink:0;",
      "  transition:background .15s; display:flex;align-items:center;justify-content:center;",
      "}",
      "#xPinyinPanel .xpty-minimize:hover{background:rgba(183,142,101,.22);color:#4a3a28;}",
      "#xPinyinPanel.is-minimized .xpty-panel{",
      "  width:auto;min-width:0;border-radius:10px;padding:0;overflow:hidden;",
      "  box-shadow:0 2px 12px rgba(183,142,101,.25);",
      "}",
      "#xPinyinPanel.is-minimized .xpty-head{padding:6px 8px;background:rgba(183,142,101,.18);}",
      "#xPinyinPanel.is-minimized .xpty-title{font-size:12px;}",
      "#xPinyinPanel.is-minimized .xpty-hint-row,",
      "#xPinyinPanel.is-minimized .xpty-compose,",
      "#xPinyinPanel.is-minimized .xpty-candidates,",
      "#xPinyinPanel.is-minimized .xpty-controls,",
      "#xPinyinPanel.is-minimized .xpty-settings{",
      "  display:none !important;",
      "}",
      "#xPinyinPanel .xpty-status{",
      "  width:8px;height:8px;border-radius:50%;background:rgba(183,142,101,.35);flex-shrink:0;",
      "  transition:background .2s, box-shadow .2s;margin-right:2px;",
      "}",
      "#xPinyinPanel .xpty-status.typing{",
      "  background:#b78e65;box-shadow:0 0 0 0 rgba(183,142,101,.6);animation:xptyPulse 1.6s ease-out infinite;",
      "}",
      "#xPinyinPanel .xpty-status.auto{",
      "  background:#8faa6a;box-shadow:0 0 0 0 rgba(143,170,106,.6);animation:xptyPulseAuto 2.2s ease-out infinite;",
      "}",
      "#xPinyinPanel .xpty-status.typing.auto{",
      "  background:linear-gradient(135deg,#b78e65 50%,#8faa6a 50%);",
      "}",
      "@keyframes xptyPulse{",
      "  0%{box-shadow:0 0 0 0 rgba(183,142,101,.55);}",
      "  70%{box-shadow:0 0 0 6px rgba(183,142,101,0);}",
      "  100%{box-shadow:0 0 0 0 rgba(183,142,101,0);}",
      "}",
      "@keyframes xptyPulseAuto{",
      "  0%{box-shadow:0 0 0 0 rgba(143,170,106,.55);}",
      "  70%{box-shadow:0 0 0 5px rgba(143,170,106,0);}",
      "  100%{box-shadow:0 0 0 0 rgba(143,170,106,0);}",
      "}",
      "#xPinyinPanel .xpty-autospeak{",
      "  padding:7px 12px;border-radius:8px;border:1px solid rgba(183,142,101,.3);background:#fff;",
      "  color:#6b5440;font-size:12px;cursor:pointer;transition:all .15s;flex:1;",
      "}",
      "#xPinyinPanel .xpty-autospeak:hover{background:rgba(183,142,101,.08);}",
      "#xPinyinPanel .xpty-autospeak.is-on{",
      "  background:#8faa6a;color:#fff;border-color:#8faa6a;font-weight:600;",
      "}",
      "#xPinyinPanel .xpty-hint-row{padding:6px 12px;color:#8c6e52;font-size:12px;}",
      "#xPinyinPanel .xpty-compose{",
      "  padding:10px 12px;background:#fff;border-top:1px dashed rgba(183,142,101,.3);border-bottom:1px dashed rgba(183,142,101,.3);",
      "  min-height:36px;display:flex;align-items:center;",
      "}",
      "#xPinyinPanel .xpty-letters{font:600 22px/1.2 'Courier New',monospace;color:#4a3a28;letter-spacing:1.5px;}",
      "#xPinyinPanel .xpty-caret{",
      "  width:2px;height:20px;background:#b78e65;margin-left:3px;flex-shrink:0;",
      "  animation:xptyBlink 1s step-end infinite;",
      "}",
      "@keyframes xptyBlink{50%{opacity:0;}}",
      "#xPinyinPanel .xpty-candidates{",
      "  padding:8px 10px;display:flex;flex-wrap:wrap;gap:6px;min-height:40px;max-height:72px;overflow:auto;",
      "}",
      "#xPinyinPanel .xpty-cand{",
      "  display:inline-flex;align-items:center;padding:4px 9px;border-radius:8px;",
      "  background:rgba(183,142,101,.16);color:#6b5440;font-size:12px;transition:all .1s;",
      "}",
      "#xPinyinPanel .xpty-cand.is-target{",
      "  background:#b78e65;color:#fff;font-weight:600;transform:scale(1.05);box-shadow:0 2px 6px rgba(183,142,101,.3);",
      "}",
      "#xPinyinPanel .xpty-controls{",
      "  display:flex;gap:8px;padding:10px 12px;background:rgba(255,249,242,.5);",
      "}",
      "#xPinyinPanel .xpty-controls button{",
      "  flex:1;padding:8px 10px;border-radius:10px;border:1px solid rgba(183,142,101,.35);",
      "  background:#fff;color:#6b5440;font-size:12px;cursor:pointer;transition:all .15s;",
      "}",
      "#xPinyinPanel .xpty-controls button:hover{background:rgba(183,142,101,.1);}",
      "#xPinyinPanel .xpty-toggle.is-on{",
      "  background:#b78e65;color:#fff;border-color:#b78e65;font-weight:600;",
      "}",
      ".ix-bubble.is-pinyin-typing .ix-text::after{",
      "  content:'|';color:#b78e65;margin-left:1px;animation:xptyBlink 1s step-end infinite;",
      "}",
      "#xPinyinPanel .xpty-settings-toggle{",
      "  width:24px;height:24px;border:0;background:transparent;color:#8c6e52;",
      "  font-size:15px;line-height:1;border-radius:6px;cursor:pointer;flex-shrink:0;",
      "  transition:background .15s; display:flex;align-items:center;justify-content:center;",
      "}",
      "#xPinyinPanel .xpty-settings-toggle:hover{background:rgba(183,142,101,.22);}",
      "#xPinyinPanel .xpty-settings{",
      "  border-top:1px dashed rgba(183,142,101,.3);padding:10px 12px;background:rgba(255,249,242,.5);",
      "}",
      "#xPinyinPanel .xpty-setting-row{",
      "  display:grid;grid-template-columns:70px 1fr 56px;align-items:center;gap:6px;margin-bottom:8px;font-size:12px;color:#6b5440;",
      "}",
      "#xPinyinPanel .xpty-setting-row label{font-size:11px;color:#8c6e52;}",
      "#xPinyinPanel .xpty-mode-group{display:flex;gap:5px;grid-column:2/-1;}",
      "#xPinyinPanel .xpty-mode-btn{",
      "  flex:1;padding:5px 6px;border-radius:8px;border:1px solid rgba(183,142,101,.35);",
      "  background:#fff;color:#6b5440;font-size:11px;cursor:pointer;transition:all .15s;",
      "}",
      "#xPinyinPanel .xpty-mode-btn.is-on{background:#b78e65;color:#fff;border-color:#b78e65;}",
      "#xPinyinPanel .xpty-mode-btn:hover{background:rgba(183,142,101,.1);}",
      "#xPinyinPanel .xpty-mode-btn.is-on:hover{background:#a67d54;}",
      "#xPinyinPanel .xpty-setting-row:first-of-type .xpty-mode-group{margin-top:2px;}",
      "#xPinyinPanel .xpty-speed{",
      "  -webkit-appearance:none;appearance:none;height:4px;border-radius:2px;background:rgba(183,142,101,.35);outline:none;",
      "}",
      "#xPinyinPanel .xpty-speed::-webkit-slider-thumb{",
      "  -webkit-appearance:none;appearance:none;width:14px;height:14px;border-radius:50%;",
      "  background:#b78e65;cursor:pointer;box-shadow:0 1px 4px rgba(183,142,101,.4);",
      "}",
      "#xPinyinPanel .xpty-speed::-moz-range-thumb{",
      "  width:14px;height:14px;border-radius:50%;background:#b78e65;cursor:pointer;border:0;",
      "}",
      "#xPinyinPanel .xpty-speed-val{",
      "  font-size:11px;color:#8c6e52;text-align:right;font-variant-numeric:tabular-nums;",
      "}",
      "#xPinyinPanel .xpty-settings-actions{display:flex;justify-content:flex-end;margin-top:6px;}",
      "#xPinyinPanel .xpty-reset{",
      "  padding:6px 10px;border-radius:8px;border:1px solid rgba(183,142,101,.35);background:#fff;",
      "  color:#6b5440;font-size:11px;cursor:pointer;transition:all .15s;",
      "}",
      "#xPinyinPanel .xpty-reset:hover{background:rgba(183,142,101,.1);}",
      "#xPinyinPanel .xpty-wordbank{",
      "  padding:6px 10px;border-radius:8px;border:1px solid #b78e65;background:#b78e65;",
      "  color:#fff;font-size:11px;cursor:pointer;transition:all .15s;",
      "}",
      "#xPinyinPanel .xpty-wordbank:hover{background:#a67d54;}",
      /* ============ 词库管理浮层 ============ */
      ".xpty-wordbank-modal{position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;}",
      ".xpty-wb-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.45);}",
      ".xpty-wb-dialog{",
      "  position:relative;background:#fff;border-radius:14px;max-width:420px;width:calc(100vw - 32px);max-height:80vh;overflow:hidden;",
      "  box-shadow:0 10px 40px rgba(0,0,0,.25);display:flex;flex-direction:column;",
      "}",
      ".xpty-wb-head{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid #f1e6db;}",
      ".xpty-wb-title{font-size:14px;font-weight:600;color:#6b5440;}",
      ".xpty-wb-close{border:none;background:none;font-size:20px;color:#8c6e52;cursor:pointer;padding:2px 6px;border-radius:6px;}",
      ".xpty-wb-close:hover{background:rgba(183,142,101,.1);}",
      ".xpty-wb-body{padding:14px 16px;overflow-y:auto;flex:1;}",
      ".xpty-wb-note{font-size:11px;color:#8c6e52;margin-bottom:12px;padding:8px 10px;background:#faf4ee;border-radius:8px;line-height:1.5;}",
      ".xpty-wb-section{margin-bottom:14px;}",
      ".xpty-wb-label{font-size:12px;color:#6b5440;margin-bottom:6px;font-weight:500;}",
      ".xpty-wb-label-row{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;}",
      ".xpty-wb-count{color:#b78e65;font-style:normal;font-weight:600;}",
      ".xpty-wb-check{font-size:11px;color:#6b5440;display:flex;align-items:center;gap:4px;}",
      ".xpty-wb-add-row{display:flex;gap:6px;}",
      ".xpty-wb-input,.xpty-wb-textarea{",
      "  flex:1;padding:8px 10px;border:1px solid #e8d9c8;border-radius:8px;font-size:13px;",
      "  outline:none;background:#fdfaf6;color:#3d2d20;font-family:inherit;",
      "}",
      ".xpty-wb-input:focus,.xpty-wb-textarea:focus{border-color:#b78e65;background:#fff;}",
      ".xpty-wb-textarea{resize:vertical;min-height:80px;line-height:1.5;}",
      ".xpty-wb-btn{",
      "  padding:8px 14px;border-radius:8px;border:1px solid transparent;font-size:12px;font-weight:500;",
      "  cursor:pointer;transition:all .15s;font-family:inherit;white-space:nowrap;",
      "}",
      ".xpty-wb-btn-primary{background:#b78e65;color:#fff;border-color:#b78e65;}",
      ".xpty-wb-btn-primary:hover{background:#a67d54;}",
      ".xpty-wb-btn-danger{background:#d46a4e;color:#fff;border-color:#d46a4e;}",
      ".xpty-wb-btn-danger:hover{background:#c35a3e;}",
      ".xpty-wb-btn-danger-outline{background:#fff;color:#d46a4e;border-color:#f1c4b5;}",
      ".xpty-wb-btn-danger-outline:hover{background:#fff3ef;}",
      ".xpty-wb-btn-block{width:100%;}",
      ".xpty-wb-list{max-height:180px;overflow-y:auto;border:1px solid #f1e6db;border-radius:8px;background:#fdfaf6;}",
      ".xpty-wb-empty{padding:20px;text-align:center;color:#b5a08c;font-size:12px;}",
      ".xpty-wb-item{",
      "  display:flex;justify-content:space-between;align-items:center;padding:7px 10px;",
      "  border-bottom:1px solid #f5ebe0;font-size:13px;color:#3d2d20;gap:8px;",
      "}",
      ".xpty-wb-item:last-child{border-bottom:none;}",
      ".xpty-wb-item label{flex:1;display:flex;align-items:center;gap:8px;cursor:pointer;}",
      ".xpty-wb-item-del{",
      "  border:none;background:none;color:#c35a3e;font-size:15px;cursor:pointer;padding:2px 8px;",
      "  border-radius:5px;line-height:1;",
      "}",
      ".xpty-wb-item-del:hover{background:#fff3ef;}",
      ".xpty-wb-list-actions{display:flex;gap:8px;margin-top:10px;}",
      ".xpty-wb-add-row-2{display:flex;gap:6px;align-items:stretch;}",
      ".xpty-wb-add-row-2 .xpty-wb-input:first-child{flex:1.2;}",
      ".xpty-wb-add-row-2 .xpty-wb-pinyin{flex:1;}",
      ".xpty-wb-auto-hint{font-size:11px;color:#8faa6a;margin-top:4px;}",
      ".xpty-wb-item label.flex-between{display:flex;justify-content:space-between;flex:1;align-items:center;gap:8px;}",
      ".xpty-wb-item-text{color:#3d2d20;font-weight:500;}",
      ".xpty-wb-item-py{color:#b78e65;font-size:11px;background:#faf4ee;padding:2px 6px;border-radius:4px;font-family:'Courier New',monospace;}",
      "@media (max-width:420px){",
      "  #xPinyinPanel .xpty-panel{width:calc(100vw - 24px);}",
      "}"
    ].join("\n");
    const style = document.createElement("style");
    style.id = "xPinyinStyles";
    style.textContent = css;
    document.head.appendChild(style);
  }

  injectStyles();
  setInterval(attach, 1200);
  if (document.readyState !== "loading") attach();
  else document.addEventListener("DOMContentLoaded", attach, { once: true });
})();
