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
  // 自主发送：TA 随机主动说一句话
  function isAutoSpeakOn() {
    try { return localStorage.getItem("shex_pinyin_autospeak_v1") === "1"; } catch (_) { return false; }
  }
  function setAutoSpeakOn(on) {
    try { localStorage.setItem("shex_pinyin_autospeak_v1", on ? "1" : "0"); } catch (_) {}
  }
  let autoSpeakTimer = 0;
  function scheduleAutoSpeak() {
    clearTimeout(autoSpeakTimer);
    if (!isAutoSpeakOn() || !panel || !panel.classList.contains("is-open")) return;
    // 8~22 秒之间随机（有打字动画的时间缓冲）
    const delay = 8000 + Math.random() * 14000;
    autoSpeakTimer = setTimeout(() => {
      if (isAutoSpeakOn() && panel && panel.classList.contains("is-open") && logEl) {
        const text = typeof window.SHEXGenerateTypingSentence === "function"
          ? window.SHEXGenerateTypingSentence() : "今天也想你了，早点休息。";
        const bubble = document.createElement("div");
        bubble.className = "ix-bubble ta";
        bubble.dataset.xPinyinDemo = "1";
        const content = document.createElement("span");
        content.className = "ix-text"; content.textContent = text;
        bubble.appendChild(content);
        logEl.appendChild(bubble);
        logEl.scrollTop = logEl.scrollHeight;
      }
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
      '    <div class="xpty-settings-actions">',
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
      reset: panel.querySelector(".xpty-reset"),
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
    }
    panelElements.settingsToggle?.addEventListener("click", () => {
      const hidden = panelElements.settings.hasAttribute("hidden");
      if (hidden) renderSpeeds();
      panelElements.settings.hidden = !hidden;
    });
    for (const key of Object.keys(panelElements.speedInputs)) {
      const input = panelElements.speedInputs[key];
      input.addEventListener("input", () => {
        const s = getSpeed();
        s[key] = Number(input.value) || DEFAULTS[key];
        writeSpeed(s);
        const v = panelElements.speedVals[key];
        if (v) v.textContent = s[key] + " ms";
      });
    }
    panelElements.reset?.addEventListener("click", () => {
      writeSpeed({ ...DEFAULTS });
      renderSpeeds();
      showHint("已恢复默认速度");
    });

    renderPanelState();
    return panel;
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
      ? window.SHEXGenerateTypingSentence() : "今天也想你了，早点休息。";
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
        if (pinyin && dict[pinyin]) {
          let typed = "";
          for (const letter of pinyin) {
            typed += letter;
            setLetters(typed);
            await sleep(speed.letter * (0.8 + Math.random() * 0.6));
            if (!bubble.isConnected) return;
          }
          let candidates = (dict[pinyin] || []).slice(0, 6);
          if (!candidates.includes(char)) {
            if (candidates.length >= 7) candidates.pop();
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
