/* SHE.X · 给 X传讯里的「拼音」入口生成 TA 想说的话
   用户自定义条目 + 原站 word-bank.js → 全随机拼句。 */
(function () {
  "use strict";
  if (window.SHEXGenerateTypingSentence) return;

  const USER_KEY = "shex_pinyin_user_entries_v1";

  function normalize(item) {
    if (!item) return null;
    const text = String(item.text || item.word || item.char || "").trim();
    const pinyin = String(item.pinyin || "").trim().toLowerCase();
    if (!text || !pinyin || /[^a-z]/.test(pinyin)) return null;
    return { text, pinyin };
  }

  function loadUser() {
    try {
      const raw = localStorage.getItem(USER_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return [];
      const seen = new Set();
      return arr.map(normalize).filter((e) => e && !(e.text + "|" + e.pinyin && seen.add(e.text + "|" + e.pinyin)));
    } catch (_) { return []; }
  }
  function saveUser(arr) {
    try {
      // 去重 + 截 500 条
      const seen = new Set();
      const clean = arr.map(normalize).filter((e) => e && !(seen.add(e.text + "|" + e.pinyin))).slice(0, 500);
      localStorage.setItem(USER_KEY, JSON.stringify(clean));
    } catch (_) {}
  }

  // 对外管理接口
  window.SHEXPinyinUserBank = {
    getAll() { return loadUser(); },
    save(arr) { saveUser(arr); },
    add(items) {
      const cur = loadUser();
      const curMap = new Map(cur.map((e) => [e.text + "|" + e.pinyin, e]));
      let added = 0;
      (Array.isArray(items) ? items : [items]).forEach((raw) => {
        const e = normalize(raw);
        if (!e) return;
        if (!curMap.has(e.text + "|" + e.pinyin)) {
          curMap.set(e.text + "|" + e.pinyin, e);
          added += 1;
        }
      });
      const arr = Array.from(curMap.values());
      saveUser(arr);
      return { total: arr.length, added };
    },
    remove(keys) {
      const cur = loadUser();
      const removeSet = new Set((Array.isArray(keys) ? keys : [keys]).map((k) => String(k)));
      const arr = cur.filter((e) => !removeSet.has(e.text + "|" + e.pinyin));
      saveUser(arr);
      return { total: arr.length, removed: cur.length - arr.length };
    },
    clear() { saveUser([]); return 0; }
  };

  // 合并候选字字典：原站 dict + 用户加的同拼音条目
  window.SHEXPinyinDictWithUser = function (pinyin) {
    const base = (window.SHEX_PINYIN_DICT && window.SHEX_PINYIN_DICT[pinyin]) || [];
    const extras = loadUser().filter((e) => e.pinyin === pinyin).map((e) => e.text);
    // 合并去重，用户加的放在后面（让原站优先展示）
    const seen = new Set(base);
    const merged = base.slice();
    extras.forEach((w) => { if (!seen.has(w)) { merged.push(w); seen.add(w); } });
    return merged;
  };

  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  function generate(mode) {
    const userEntries = loadUser();
    const hasDefaultBank = !!(window.SHEXWordBank && typeof window.SHEXWordBank.generate === "function");

    // 全部候选词池 = 用户词组 + 原站 words + （可选）原站模板的槽
    let allWords = new Set();

    // 用户加的 text 不管是单字还是词组都算
    userEntries.forEach((e) => { if (e.text && e.text.length >= 1 && e.text.length <= 6) allWords.add(e.text); });

    // 原站 words 池
    if (hasDefaultBank && Array.isArray(window.SHEXWordBank.words)) {
      window.SHEXWordBank.words.forEach((w) => allWords.add(w));
    }

    const wordArr = Array.from(allWords);

    // 有足够的词 → 随机拼
    if (wordArr.length >= 3) {
      const count = 2 + Math.floor(Math.random() * 3); // 2~4 个词
      const picked = [];
      const used = new Set();
      for (let i = 0; i < count && picked.length < count; i += 1) {
        const w = pick(wordArr);
        // 尽量不重复
        if (used.has(w) && wordArr.length > count) continue;
        used.add(w);
        picked.push(w);
      }
      const joiners = ["", "，", " ", "，", "..."];
      let text = picked.join(pick(joiners));
      if (!/[。！？!?]$/.test(text) && Math.random() < 0.5) text += pick(["。", "！", "？", ""]);
      if (text.length > 60) text = text.slice(0, 30);
      if (text.length >= 2) return text;
    }

    // fallback：原站三档
    if (hasDefaultBank) return window.SHEXWordBank.generate(mode || "words");

    // 纯兜底
    return "想你了。";
  }

  window.SHEXGenerateTypingSentence = generate;
})();
