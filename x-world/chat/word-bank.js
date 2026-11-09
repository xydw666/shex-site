/* SHE.X — TA 拼音拼字词库（三档模式）
   random：随机取拼音、随机选一个字，最真实但语义不通。
   words ：随机挑词再拼起来，词都对，整句像拼贴。
   fluent：按「前 3～4 个字 → 下一个字」的常用搭配接字，基本通顺。
   三档都只负责生成文字，真正敲拼音、选字、上屏由 pinyin-typing.js 完成。 */
(function () {
  const pick = (list) => list[Math.floor(Math.random() * list.length)];

  /* ---------- 乱码版：纯随机单字 ---------- */
  function generateRandomChar() {
    const dict = window.SHEX_PINYIN_DICT || {};
    const pinyins = Object.keys(dict);
    if (!pinyins.length) return "想你。";

    const count = 4 + Math.floor(Math.random() * 5);
    let text = "";
    for (let i = 0; i < count; i += 1) {
      const candidates = Array.from(String(dict[pick(pinyins)] || "")).filter((ch) => /[\u4e00-\u9fff]/.test(ch));
      if (!candidates.length) continue;
      text += pick(candidates);
    }
    return (text || "想你") + "。";
  }

  /* ---------- 拼词版：随机挑词拼起来 ---------- */
  const words = [
    "想你", "今天", "晚安", "早安", "好梦", "吃饭", "下班", "回家", "月亮", "星星",
    "口袋", "小熊", "牛奶", "窗边", "下雨", "天气", "开心", "难过", "抱抱", "陪你",
    "等你", "说话", "聊天", "消息", "回信", "早点睡", "多喝水", "照顾好自己", "别熬夜", "记得吃饭",
    "刚睡醒", "刚到家", "刚吃完饭", "在听歌", "发呆", "看云", "风很舒服", "花开了", "很想你", "特别想你",
    "一直在", "随时都在", "想见你", "想抱你", "想牵你", "听你的声音", "一起看星星", "待一整天", "有你在", "很安心",
    "心软", "温柔", "好运", "别担心", "有我在", "路上小心", "明天见", "好好吃饭", "要开心", "别太累",
    "说说话", "在吗", "忙吗", "有空吗", "想你了", "睡了吗", "到家了吗", "吃饭了吗", "今天怎么样", "累不累"
  ];

  function generateWords() {
    const count = 3 + Math.floor(Math.random() * 3);
    const picked = [];
    while (picked.length < count) {
      const word = pick(words);
      if (picked[picked.length - 1] === word) continue;
      picked.push(word);
    }
    return picked.join("") + "。";
  }

  /* ---------- 通顺版：按常用搭配逐字接 ---------- */
  const slots = {
    time: ["今天", "刚刚", "这会儿", "最近", "晚上", "早上", "昨天", "这两天", "今天下午", "睡前"],
    state: ["有点累", "心情很好", "刚睡醒", "忙完了", "有点困", "格外想你", "有点小开心", "今天有点忙", "有点无聊", "状态不错"],
    share: ["刚吃完晚饭", "在听一首歌", "看到一朵很好看的云", "路边的花开了", "刚喝完一杯热牛奶", "今天的风很舒服", "刚洗完澡", "刚下班", "刚到家", "在窗边发呆"],
    miss: ["有点想你", "突然很想你", "一直在想你", "又想你了", "忍不住想你", "特别想你", "忽然有点想你", "总是不自觉地想你"],
    ask: ["在忙什么呢", "过得怎么样", "有没有好好吃饭", "累不累呀", "开心吗", "在做什么呀", "有好好休息吗", "有没有想我"],
    care: ["记得按时吃饭", "别熬太晚", "早点休息", "要照顾好自己", "多喝点热水", "别太累了", "记得吃点水果", "天冷了多穿一点", "别一个人硬扛"],
    company: ["我在这里陪你", "想和你说说话", "等你回来", "我一直都在", "想陪你待一会儿", "随时都可以找我", "有事就跟我说", "我听着呢"],
    sweet: ["看到你就很开心", "想抱抱你", "想把今天的好运都给你", "你比星星还亮", "有你在就很好", "想把温柔都留给你", "你一笑我就心软", "和你说话最安心"],
    wish: ["想被抱抱", "想听你的声音", "想和你一起看星星", "想和你待一整天", "想牵你的手", "想去见你"],
    night: ["晚安", "好梦", "睡个好觉", "晚安啦"]
  };

  const templates = [
    "{time}{miss}。",
    "{miss}，{care}。",
    "{ask}？{care}。",
    "{care}，{company}。",
    "{sweet}，{care}。",
    "{miss}。{company}。",
    "{time}{care}，{company}。",
    "{ask}？{company}。",
    "{sweet}。{company}。",
    "{night}，{care}。",
    "{time}{miss}，{sweet}。",
    "{company}，{care}。",
    "{sweet}，{company}。",
    "{share}，{miss}。",
    "{share}。{ask}？",
    "{miss}，{wish}。",
    "{state}。{company}。",
    "{wish}，{care}。",
    "{share}，{sweet}。",
    "{ask}？{wish}。",
    "{time}{state}，{company}。",
    "{state}，{wish}。",
    "{share}。{care}。",
    "{miss}。{care}。",
    "{state}，{ask}？",
    "{share}。{company}。",
    "{time}{wish}。",
    "{sweet}。{ask}？",
    "{wish}。{night}。",
    "{state}，{miss}。",
    "{time}{state}。",
    "{share}，{wish}。",
    "{care}。{night}。",
    "{night}。{wish}。",
    "{miss}，{ask}？",
    "{company}。{wish}。"
  ];

  function expand(template) {
    const parts = template.split(/(\{\w+\})/);
    let results = [""];
    parts.forEach((part) => {
      const slot = part.match(/^\{(\w+)\}$/);
      if (!slot) {
        results = results.map((text) => text + part);
        return;
      }
      const list = slots[slot[1]] || [""];
      const next = [];
      results.forEach((text) => list.forEach((word) => next.push(text + word)));
      results = next;
    });
    return results;
  }

  const corpus = templates.flatMap(expand);
  const corpusSet = new Set(corpus);
  const starts = [];
  const trigram = Object.create(null);
  const fourgram = Object.create(null);

  corpus.forEach((line) => {
    const chars = Array.from(String(line));
    if (chars.length < 4) return;
    starts.push(chars.slice(0, 3).join(""));
    for (let i = 0; i < chars.length - 2; i += 1) {
      const key = chars[i] + chars[i + 1];
      (trigram[key] || (trigram[key] = [])).push(chars[i + 2]);
    }
    for (let i = 0; i < chars.length - 3; i += 1) {
      const key = chars[i] + chars[i + 1] + chars[i + 2];
      (fourgram[key] || (fourgram[key] = [])).push(chars[i + 3]);
    }
  });

  let last = "";

  function generateFluent() {
    for (let attempt = 0; attempt < 16; attempt += 1) {
      let text = pick(starts);
      while (text.length < 26) {
        const longKey = text.slice(-3);
        const shortKey = text.slice(-2);
        const nexts = fourgram[longKey] || trigram[shortKey];
        if (!nexts || !nexts.length) break;
        const ch = pick(nexts);
        text += ch;
        if ("。！？".includes(ch) && text.length >= 8) break;
      }
      if (!/[。！？]$/.test(text)) text += "。";
      if (text.length >= 8 && text !== last && !corpusSet.has(text)) {
        last = text;
        return text;
      }
    }
    last = pick(corpus);
    return last;
  }

  function generate(mode) {
    let text;
    if (mode === "random") text = generateRandomChar();
    else if (mode === "fluent") text = generateFluent();
    else text = generateWords();
    last = text;
    return text;
  }

  window.SHEXWordBank = {
    generate,
    words,
    modes: ["random", "words", "fluent"],
    // 方便以后接入 AI：把外部生成的句子交给同一套打字流程
    setLast(text) { last = String(text || ""); }
  };
})();
