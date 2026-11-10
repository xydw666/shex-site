/* SHE.X · 把拼音打字接到 X传讯
   不改动聊天原有逻辑：监听 ixLog 里最新的 TA 消息气泡，
   等这串文字“写完并稳定”后，再用拼音 → 候选字 → 上屏的过程逐字打出来。
   —— AI 回复、本地兜底回复、字卡回复都走同一条路径，不是只演预设句子。 */
(function () {
  "use strict";
  if (window.__SHEX_PINYIN_CHAT_BRIDGE__) return;
  window.__SHEX_PINYIN_CHAT_BRIDGE__ = true;

  const CJK = /^[\u3400-\u9fff]$/;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));

  let logEl = null;
  let observer = null;
  let attachedAt = 0;
  let queue = Promise.resolve();
  let strip = null;
  let dictLoading = null;
  let checkTimer = 0;
  let retryCount = 0;
  let allowInQuiet = false;

  // 默认开启：TA 的回复就用拼音打出来；面板里可以关掉。
  function isAutoOn() {
    try {
      return localStorage.getItem("shex_pinyin_typing_auto_v1") !== "0";
    } catch (_) {
      return true;
    }
  }

  function hasDict() {
    return !!(window.SHEX_PINYIN_DICT && window.SHEX_CHAR_PINYIN);
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.async = false;
      script.onload = () => resolve(true);
      script.onerror = () => reject(new Error(src));
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

  function ensureStrip() {
    if (strip && strip.isConnected) return strip;
    strip = document.createElement("div");
    strip.id = "xPinyinTyping";
    strip.innerHTML = [
      '<div class="xpty-head"><i class="xpty-dot"></i><span class="xpty-hint">TA 正在敲键盘…</span></div>',
      '<div class="xpty-compose"><span class="xpty-letters"></span><i class="xpty-caret"></i></div>',
      '<div class="xpty-candidates"></div>'
    ].join("");
    document.body.appendChild(strip);
    return strip;
  }

  function hideStrip() {
    if (!strip) return;
    strip.classList.remove("is-visible");
    const letters = strip.querySelector(".xpty-letters");
    const candidates = strip.querySelector(".xpty-candidates");
    if (letters) letters.textContent = "";
    if (candidates) candidates.innerHTML = "";
  }

  function keepAtBottom(bubble) {
    const log = bubble.closest("#ixLog") || logEl;
    if (!log) return;
    const nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 180;
    if (nearBottom) log.scrollTop = log.scrollHeight;
  }

  async function animate(bubble, textEl, text) {
    const dict = window.SHEX_PINYIN_DICT || {};
    const charMap = window.SHEX_CHAR_PINYIN || {};
    const chars = Array.from(text);
    const length = chars.length;
    const profile = length <= 24
      ? { letter: 65, candidate: 420, commit: 110 }
      : length <= 60
        ? { letter: 40, candidate: 220, commit: 60 }
        : { letter: 26, candidate: 140, commit: 30 };
    // 长回复只演开头，剩下的直接显示，避免等太久。
    const dumpAfter = length <= 60 ? length : 24;

    const bar = ensureStrip();
    bar.classList.add("is-visible");
    const hintEl = bar.querySelector(".xpty-hint");
    const lettersEl = bar.querySelector(".xpty-letters");
    const candidatesEl = bar.querySelector(".xpty-candidates");

    let output = "";
    textEl.textContent = "";
    textEl.classList.add("is-pinyin-typing");
    bubble.classList.add("is-pinyin-typing");

    try {
      for (let index = 0; index < length; index += 1) {
        if (!bubble.isConnected) return;
        const char = chars[index];

        if (index >= dumpAfter) {
          // 长回复不再逐字演，避免等太久。
          output = chars.join("");
          textEl.textContent = output;
          break;
        }

        const pinyin = CJK.test(char) ? charMap[char] : "";
        if (pinyin && dict[pinyin]) {
          hintEl.textContent = "TA 正在敲拼音…";
          candidatesEl.innerHTML = "";
          let typed = "";
          for (const letter of pinyin) {
            typed += letter;
            lettersEl.textContent = typed;
            await sleep(profile.letter * (0.7 + Math.random() * 0.6));
            if (!bubble.isConnected) return;
          }

          const list = (dict[pinyin] || []).slice(0, 6);
          if (!list.includes(char)) {
            if (list.length >= 7) list.pop();
            list.push(char);
          }
          hintEl.textContent = "正在候选字里选字…";
          candidatesEl.innerHTML = list
            .map((item) => `<span class="xpty-cand${item === char ? " is-target" : ""}">${item}</span>`)
            .join("");
          await sleep(profile.candidate * (0.8 + Math.random() * 0.5));
          if (!bubble.isConnected) return;
          candidatesEl.querySelector(".xpty-cand.is-target")?.classList.add("is-picked");
          await sleep(110);
          lettersEl.textContent = "";
          candidatesEl.innerHTML = "";
        } else if (char === "\n") {
          await sleep(profile.commit + 60);
        } else {
          await sleep(Math.min(profile.commit, 70));
        }

        output += char;
        textEl.textContent = output;
        keepAtBottom(bubble);
        await sleep(profile.commit * (0.8 + Math.random() * 0.6));
      }
    } finally {
      textEl.textContent = text;
      textEl.classList.remove("is-pinyin-typing");
      bubble.classList.remove("is-pinyin-typing");
      hideStrip();
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

  // 只看最后一条 TA 气泡：它才是“这一轮刚回复的话”。
  function checkLatest() {
    if (!logEl || !logEl.isConnected) return;
    const all = logEl.querySelectorAll(".ix-bubble.ta");
    const bubble = all[all.length - 1];
    if (!bubble) return;
    if (bubble.dataset.xPinyinDone === "1") return;

    const isDemo = bubble.dataset.xPinyinDemo === "1";
    if (!isDemo && !isAutoOn()) return;

    // 还在“正在输入”或流式输出：等它落定再打。
    if (isPendingBubble(bubble)) {
      scheduleCheck(700);
      return;
    }

    const textEl = findTextEl(bubble);
    if (!textEl) {
      scheduleCheck(500);
      return;
    }

    const text = String(textEl.textContent || "").trim();
    if (!text) {
      scheduleCheck(500);
      return;
    }
    if (text.length > 400) return;

    bubble.dataset.xPinyinDone = "1";
    retryCount = 0;
    allowInQuiet = false;
    void loadDicts().then((ready) => {
      if (!ready) {
        delete bubble.dataset.xPinyinDone;
        return;
      }
      queue = queue
        .then(() => animate(bubble, textEl, text))
        .catch(() => {});
    });
  }

  function scheduleCheck(delay) {
    clearTimeout(checkTimer);
    checkTimer = window.setTimeout(() => {
      const quietLeft = 2500 - (Date.now() - attachedAt);
      if (quietLeft > 0) {
        // 刚打开/切换会话：历史消息不打字；只有“确实新增了一条回复”才等安静期结束再补上。
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
    if (!log) {
      if (logEl) {
        observer?.disconnect();
        observer = null;
        logEl = null;
      }
      return;
    }
    if (log === logEl && observer) return;
    observer?.disconnect();
    logEl = log;
    attachedAt = Date.now();
    retryCount = 0;
    allowInQuiet = false;
    observer = new MutationObserver((records) => {
      let removed = 0;
      let addedElements = 0;
      let taAdded = 0;
      let textChanged = false;
      let classChanged = false;
      let demoAdded = false;
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
      // 切换会话 / 整页重绘：重置安静期，避免把历史消息当成新消息。
      if (removed > 3) attachedAt = Date.now();
      if (taAdded === 1 && addedElements <= 3) allowInQuiet = true; // 新增了一条 TA 回复
      if (demoAdded) allowInQuiet = true; // 面板里的演示句，随时可以打
      const taAll = log.querySelectorAll(".ix-bubble.ta");
      const lastTa = taAll[taAll.length - 1] || null;
      if (textChanged && lastTa && isPendingBubble(lastTa)) allowInQuiet = true; // 流式生成中
      if (taAdded || textChanged || classChanged) scheduleCheck(700);
    });
    observer.observe(log, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["class"]
    });
  }

  setInterval(attach, 1200);
  if (document.readyState !== "loading") attach();
  else document.addEventListener("DOMContentLoaded", attach, { once: true });
})();
