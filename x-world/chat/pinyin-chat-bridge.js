/* SHE.X · 把拼音打字接到 X传讯
   不改动聊天原有逻辑：只监听新出现的 TA 消息气泡，
   用拼音 → 候选字 → 上屏的过程把文字逐字“打”出来。 */
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

  function handleAdded(nodes) {
    const bubbles = [];
    nodes.forEach((node) => {
      if (!(node instanceof Element)) return;
      if (node.matches(".ix-bubble.ta")) bubbles.push(node);
      node.querySelectorAll?.(".ix-bubble.ta").forEach((item) => bubbles.push(item));
    });
    if (!bubbles.length) return;
    if (Date.now() - attachedAt < 2500) return;
    // 一次性出现很多条，基本是渲染历史记录，不做打字动画。
    if (bubbles.length > 2) return;

    bubbles.forEach((bubble) => {
      if (bubble.dataset.xPinyinDone === "1") return;
      if (!bubble.isConnected) return;
      const textEl = findTextEl(bubble);
      if (!textEl) return;
      const text = String(textEl.textContent || "").trim();
      if (!text || text.length > 400) return;
      bubble.dataset.xPinyinDone = "1";
      void loadDicts().then((ready) => {
        if (!ready) {
          delete bubble.dataset.xPinyinDone;
          return;
        }
        queue = queue
          .then(() => animate(bubble, textEl, text))
          .catch(() => {});
      });
    });
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
    observer = new MutationObserver((records) => {
      const added = [];
      let removed = 0;
      records.forEach((record) => {
        removed += record.removedNodes.length;
        record.addedNodes.forEach((node) => added.push(node));
      });
      // 切换会话 / 整页重绘：重置安静期，避免把历史消息当成新消息。
      if (removed > 3) attachedAt = Date.now();
      handleAdded(added);
    });
    observer.observe(log, { childList: true });
  }

  setInterval(attach, 1200);
  if (document.readyState !== "loading") attach();
  else document.addEventListener("DOMContentLoaded", attach, { once: true });
})();
