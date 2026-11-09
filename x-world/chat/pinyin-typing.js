/* SHE.X — TA 拼音打字演示
   依赖：pinyin-dictionary.js（拼音 → 候选字）、pinyin-char-map.js（字 → 拼音） */
(() => {
  const DICT = window.SHEX_PINYIN_DICT || {};
  const CHAR_PINYIN = window.SHEX_CHAR_PINYIN || {};
  const CJK = /[\u4e00-\u9fff]/;

  const el = {
    log: document.getElementById("demoLog"),
    pinyin: document.getElementById("demoPinyin"),
    pinyinCaret: document.getElementById("demoPinyinCaret"),
    candidates: document.getElementById("demoCandidates"),
    compose: document.getElementById("demoCompose"),
    send: document.getElementById("demoSend"),
    keyboard: document.getElementById("demoKeyboard"),
    pause: document.getElementById("demoPause"),
    replay: document.getElementById("demoReplay"),
    random: document.getElementById("demoRandom"),
    modes: document.getElementById("demoModes"),
    speed: document.getElementById("demoSpeed"),
    chips: document.getElementById("demoChips"),
    customInput: document.getElementById("demoCustomInput"),
    customSend: document.getElementById("demoCustomSend"),
    hint: document.getElementById("demoTyperHint")
  };

  const sentences = [
    "今天也想你了，记得好好吃饭。",
    "我在月亮这边等你。",
    "小熊把今天的星星装进口袋，等你回来。",
    "晚安，明天也要好好被爱。"
  ];

  const base = {
    letter: 95,
    afterPinyin: 300,
    candidate: 620,
    pick: 240,
    commit: 180,
    beforeSend: 650,
    afterSend: 900
  };

  let speed = 1;
  let paused = false;
  let runToken = 0;
  let currentText = "";
  let resumeWaiters = [];
  let constructing = false;
  let loopTimer = 0;
  let mode = "words";

  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

  function setHint(text) {
    if (el.hint) el.hint.textContent = text;
  }

  function delay(ms) {
    let remain = reducedMotion ? Math.min(ms, 30) : ms / speed;
    return new Promise((resolve) => {
      const tick = () => {
        if (paused) {
          resumeWaiters.push(tick);
          return;
        }
        const step = Math.min(remain, 40);
        remain -= step;
        if (remain <= 0) {
          resolve(true);
        } else {
          setTimeout(tick, step);
        }
      };
      tick();
    });
  }

  function setPaused(next) {
    paused = next;
    if (el.pause) {
      el.pause.textContent = paused ? "继续" : "暂停";
      el.pause.setAttribute("aria-pressed", String(paused));
    }
    if (!paused) {
      const waiters = resumeWaiters;
      resumeWaiters = [];
      waiters.forEach((fn) => fn());
    }
  }

  function renderPinyin(text) {
    if (!el.pinyin) return;
    el.pinyin.textContent = text;
    el.pinyinCaret?.classList.toggle("is-hidden", !text);
  }

  function renderCompose(text) {
    if (el.compose) el.compose.textContent = text;
  }

  function clearCandidates() {
    if (el.candidates) el.candidates.replaceChildren();
  }

  function candidatesFor(pinyin, target) {
    const list = (DICT[pinyin] || []).slice(0, 8);
    if (!list.includes(target)) {
      if (list.length >= 9) list.pop();
      list.push(target);
    }
    return list;
  }

  function renderCandidates(pinyin, target) {
    if (!el.candidates) return;
    el.candidates.replaceChildren();
    candidatesFor(pinyin, target).forEach((char) => {
      const button = document.createElement("span");
      button.className = "demo-candidate";
      button.textContent = char;
      if (char === target) button.classList.add("is-target");
      el.candidates.appendChild(button);
    });
  }

  function pressKey(key) {
    const node = el.keyboard?.querySelector(`[data-key="${key}"]`);
    if (!node) return;
    node.classList.add("is-pressed");
    setTimeout(() => node.classList.remove("is-pressed"), 110);
  }

  function nowTime() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }

  function appendMessage(text, who) {
    if (!el.log) return;
    const row = document.createElement("div");
    row.className = `demo-msg demo-msg--${who}`;

    const avatar = document.createElement("span");
    avatar.className = "demo-msg-avatar";
    avatar.innerHTML = `<svg aria-hidden="true"><use href="#${who === "ta" ? "shex-bear-brown" : "shex-bear-cream"}"></use></svg>`;

    const content = document.createElement("div");
    const bubble = document.createElement("div");
    bubble.className = "demo-bubble";
    bubble.textContent = text;
    const time = document.createElement("div");
    time.className = "demo-msg-time";
    time.textContent = nowTime();
    content.append(bubble, time);

    row.append(avatar, content);
    el.log.appendChild(row);
    el.log.scrollTop = el.log.scrollHeight;
  }

  async function typeChinese(char) {
    const pinyin = CHAR_PINYIN[char];
    if (!pinyin || !DICT[pinyin]) return false;

    let typed = "";
    setHint("TA 正在敲拼音…");
    for (const letter of pinyin) {
      pressKey(letter);
      typed += letter;
      renderPinyin(typed);
      // 每个字母的间隔不完全一样，像真人手指的速度。
      if (!(await delay(base.letter * (0.75 + Math.random() * 0.7)))) return false;
    }

    if (!(await delay(base.afterPinyin + Math.random() * 250))) return false;

    setHint("正在候选字里选字…");
    renderCandidates(pinyin, char);
    if (!(await delay(base.candidate + Math.random() * 400))) return false;

    // 偶尔在候选字前犹豫一下，给“想字”的时间。
    if (Math.random() < 0.22) {
      setHint("犹豫了一下…");
      if (!(await delay(500 + Math.random() * 700))) return false;
      setHint("正在候选字里选字…");
    }

    const targetNode = Array.from(el.candidates?.children || []).find(
      (node) => node.textContent === char
    );
    targetNode?.classList.remove("is-target");
    targetNode?.classList.add("is-picked");
    if (!(await delay(base.pick))) return false;

    renderPinyin("");
    clearCandidates();
    return true;
  }

  async function run(text, token) {
    if (!el.compose || !el.send) return;
    let composed = "";
    renderPinyin("");
    clearCandidates();
    renderCompose("");

    for (const char of text) {
      if (token !== runToken) return;

      if (CJK.test(char)) {
        const ok = await typeChinese(char);
        if (token !== runToken) return;
        if (ok) {
          composed += char;
          renderCompose(composed);
          if (!(await delay(base.commit + Math.random() * 260))) return;
          continue;
        }
      }

      // 标点、数字、字母：直接上屏
      if (char === " ") pressKey("space");
      composed += char;
      renderCompose(composed);
      if (!(await delay(90))) return;
    }

    setHint("整句打完，准备发送…");
    el.send.classList.add("is-ready");
    if (!(await delay(base.beforeSend))) return;
    el.send.classList.remove("is-ready");
    el.send.classList.add("is-pressed");
    setTimeout(() => el.send.classList.remove("is-pressed"), 180);

    appendMessage(text, "ta");
    composed = "";
    renderCompose("");
    constructing = false;
    setHint("已发送 · 等 TA 想下一句…");
    await delay(base.afterSend);
    if (token === runToken) scheduleNext(token);
  }

  function randomSentence() {
    const bank = window.SHEXWordBank;
    if (bank && typeof bank.generate === "function") {
      try {
        return bank.generate(mode);
      } catch (_) {
        /* 词库异常时退回预设句，保证演示不中断 */
      }
    }
    return sentences[Math.floor(Math.random() * sentences.length)];
  }

  function scheduleNext(token) {
    clearTimeout(loopTimer);
    loopTimer = setTimeout(() => {
      if (token !== runToken) return;
      if (paused) {
        scheduleNext(token);
        return;
      }
      start(randomSentence());
    }, 2400 + Math.random() * 3000);
  }

  function start(text) {
    if (constructing) return;
    currentText = text;
    const token = ++runToken;
    constructing = true;
    setPaused(false);
    // 给“对面”一点操作时间：先发一会儿呆，再开始敲字。
    setHint("对面正在想…");
    delay(1000 + Math.random() * 1800)
      .then(() => {
        if (token !== runToken) return null;
        return run(text, token);
      })
      .catch(() => {
        constructing = false;
      });
  }

  function seed() {
    appendMessage("有点累，但看到你就好啦。", "me");
  }

  // —— 事件 ——
  el.pause?.addEventListener("click", () => setPaused(!paused));

  el.replay?.addEventListener("click", () => {
    clearTimeout(loopTimer);
    constructing = false;
    start(currentText || randomSentence());
  });

  el.random?.addEventListener("click", () => {
    clearTimeout(loopTimer);
    constructing = false;
    start(randomSentence());
  });

  el.modes?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-mode]");
    if (!button) return;
    mode = button.dataset.mode || "words";
    Array.from(el.modes.querySelectorAll("[data-mode]")).forEach((item) => {
      item.setAttribute("aria-pressed", String(item === button));
    });
    clearTimeout(loopTimer);
    constructing = false;
    start(randomSentence());
  });

  el.speed?.addEventListener("input", (event) => {
    speed = Math.max(0.6, Math.min(2.6, Number(event.target.value) || 1));
  });

  el.customSend?.addEventListener("click", () => {
    const value = String(el.customInput?.value || "").trim();
    if (!value) return;
    clearTimeout(loopTimer);
    constructing = false;
    start(value);
  });

  el.customInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      el.customSend?.click();
    }
  });

  if (el.keyboard) {
    el.keyboard.innerHTML = [
      ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
      ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
      ["z", "x", "c", "v", "b", "n", "m", "space"]
    ]
      .map((row) => {
        const keys = row
          .map((key) =>
            key === "space"
              ? '<span class="demo-key is-space" data-key="space">空格</span>'
              : `<span class="demo-key" data-key="${key}">${key}</span>`
          )
          .join("");
        return `<div class="demo-key-row">${keys}</div>`;
      })
      .join("");
  }

  seed();
  setHint("准备开始…");
  setTimeout(() => start(randomSentence()), 900);
})();
