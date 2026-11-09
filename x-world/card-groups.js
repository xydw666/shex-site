/* X103：字卡分组 + 问题功能（纯逻辑 + 轻量界面）。
 *
 * 字卡分组
 *   - 每个梦角自己的字卡列表仍然是唯一的“总字卡”，字卡本身只存一份（纯文本）。
 *   - 分组只记录“哪些字卡属于这个组”，一张字卡可以属于多个组；删除分组不删字卡。
 *   - 配置按梦角保存在 shex_x_card_groups_dream_<梦角ID>_v1，随账号资料一起同步。
 *   - 没有建过任何分组、也没关过任何开关时，行为与升级前完全一致。
 *
 * 问题
 *   - 四种题型：单选 single / 判断 judge / 多选 multi / 开放回答 open。
 *   - 字卡模式随机作答；AI 模式由角色作答，结构化题型通过回复末尾的〔回答:序号〕标记取回选择。
 */
(function (root) {
  'use strict';

  const CONFIG_VERSION = 1;
  const MAX_GROUPS = 30;
  const MAX_GROUP_NAME = 12;
  const MAX_OPTIONS = 8;
  const MAX_OPTION_TEXT = 40;
  const MAX_QUESTION_TEXT = 200;
  const NO_CARDS_MESSAGE = '当前没有可用字卡，请至少开启一个字卡分组或开启系统字卡。';
  const KIND_LABELS = Object.freeze({ single: '单选', judge: '判断', multi: '多选', open: '开放回答' });
  const JUDGE_OPTIONS = Object.freeze(['是', '否']);
  const ANSWER_TAG_PATTERN = /[〔\[【]\s*回答\s*[:：]\s*([^〕\]】]*)[〕\]】]/g;
  const MAX_QUESTIONS = 5;
  const QUESTION_COUNT_WEIGHTS = Object.freeze([50, 25, 15, 7, 3]);
  const QUESTION_CARD_PREFIX = '【问题字卡】';
  const answerDrafts = new Map();

  const cleanText = (value) => String(value == null ? '' : value).trim();
  const uniqueTexts = (list) => {
    const seen = new Set();
    const result = [];
    (Array.isArray(list) ? list : []).forEach((item) => {
      const text = cleanText(item);
      if (!text || seen.has(text)) return;
      seen.add(text);
      result.push(text);
    });
    return result;
  };

  function storageKey(dreamId) {
    return `shex_x_card_groups_dream_${String(dreamId || '').trim()}_v1`;
  }

  function createId() {
    return `cg_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  }

  function normalizeConfig(value) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const seenIds = new Set();
    const groups = (Array.isArray(source.groups) ? source.groups : []).map((group) => {
      if (!group || typeof group !== 'object') return null;
      const id = cleanText(group.id);
      const name = cleanText(group.name).slice(0, MAX_GROUP_NAME);
      if (!id || !name || seenIds.has(id)) return null;
      seenIds.add(id);
      return {
        id,
        name,
        cards: uniqueTexts(group.cards),
        enabled: group.enabled !== false,
        createdAt: Number(group.createdAt || 0) || 0
      };
    }).filter(Boolean).slice(0, MAX_GROUPS);
    return {
      v: CONFIG_VERSION,
      groups,
      ungroupedEnabled: source.ungroupedEnabled !== false,
      systemEnabled: source.systemEnabled !== false,
      automaticQuestionsEnabled: source.automaticQuestionsEnabled !== false,
      updatedAt: Number(source.updatedAt || 0) || 0
    };
  }

  function storageOf(options) {
    return (options && options.storage) || root.localStorage;
  }

  function readConfig(dreamId, options) {
    const id = cleanText(dreamId);
    if (!id) return normalizeConfig(null);
    try {
      return normalizeConfig(JSON.parse(storageOf(options).getItem(storageKey(id)) || 'null'));
    } catch (_) {
      return normalizeConfig(null);
    }
  }

  function writeConfig(dreamId, config, options) {
    const id = cleanText(dreamId);
    if (!id) return null;
    const next = normalizeConfig({ ...config, updatedAt: Date.now() });
    try {
      storageOf(options).setItem(storageKey(id), JSON.stringify(next));
      return next;
    } catch (_) {
      return null;
    }
  }

  function updateConfig(dreamId, mutate, options) {
    const config = readConfig(dreamId, options);
    const result = mutate(config);
    if (result === false) return null;
    return writeConfig(dreamId, config, options);
  }

  function createGroup(dreamId, name, cards, options) {
    const groupName = cleanText(name).slice(0, MAX_GROUP_NAME);
    if (!groupName) return { ok: false, reason: 'empty_name' };
    let created = null;
    let reason = '';
    const saved = updateConfig(dreamId, (config) => {
      if (config.groups.length >= MAX_GROUPS) { reason = 'limit'; return false; }
      if (config.groups.some((group) => group.name === groupName)) { reason = 'duplicate_name'; return false; }
      created = { id: createId(), name: groupName, cards: uniqueTexts(cards), enabled: true, createdAt: Date.now() };
      config.groups.push(created);
      return true;
    }, options);
    return saved && created ? { ok: true, group: created } : { ok: false, reason: reason || 'save_failed' };
  }

  function renameGroup(dreamId, groupId, name, options) {
    const groupName = cleanText(name).slice(0, MAX_GROUP_NAME);
    if (!groupName) return { ok: false, reason: 'empty_name' };
    let reason = '';
    const saved = updateConfig(dreamId, (config) => {
      const group = config.groups.find((item) => item.id === groupId);
      if (!group) { reason = 'not_found'; return false; }
      if (config.groups.some((item) => item.id !== groupId && item.name === groupName)) { reason = 'duplicate_name'; return false; }
      group.name = groupName;
      return true;
    }, options);
    return saved ? { ok: true } : { ok: false, reason: reason || 'save_failed' };
  }

  // 删除分组只删“字卡和分组之间的关系”，字卡本身仍在总字卡里。
  function deleteGroup(dreamId, groupId, options) {
    return Boolean(updateConfig(dreamId, (config) => {
      const before = config.groups.length;
      config.groups = config.groups.filter((group) => group.id !== groupId);
      return config.groups.length !== before;
    }, options));
  }

  function setGroupEnabled(dreamId, groupId, enabled, options) {
    return Boolean(updateConfig(dreamId, (config) => {
      const group = config.groups.find((item) => item.id === groupId);
      if (!group) return false;
      group.enabled = enabled !== false;
      return true;
    }, options));
  }

  function setUngroupedEnabled(dreamId, enabled, options) {
    return Boolean(updateConfig(dreamId, (config) => { config.ungroupedEnabled = enabled !== false; return true; }, options));
  }

  function setSystemEnabled(dreamId, enabled, options) {
    return Boolean(updateConfig(dreamId, (config) => { config.systemEnabled = enabled !== false; return true; }, options));
  }

  function setAutomaticQuestionsEnabled(dreamId, enabled, options) {
    return Boolean(updateConfig(dreamId, (config) => { config.automaticQuestionsEnabled = enabled !== false; return true; }, options));
  }

  function setCardInGroup(dreamId, groupId, card, included, options) {
    const text = cleanText(card);
    if (!text) return false;
    return Boolean(updateConfig(dreamId, (config) => {
      const group = config.groups.find((item) => item.id === groupId);
      if (!group) return false;
      const has = group.cards.includes(text);
      if (included && !has) group.cards.push(text);
      else if (!included && has) group.cards = group.cards.filter((item) => item !== text);
      else return false;
      return true;
    }, options));
  }

  function addCardsToGroup(dreamId, groupId, cards, options) {
    const lines = uniqueTexts(cards);
    if (!lines.length) return 0;
    let added = 0;
    updateConfig(dreamId, (config) => {
      const group = config.groups.find((item) => item.id === groupId);
      if (!group) return false;
      const existing = new Set(group.cards);
      lines.forEach((line) => {
        if (existing.has(line)) return;
        existing.add(line);
        group.cards.push(line);
        added += 1;
      });
      return added > 0;
    }, options);
    return added;
  }

  // 总字卡里已经不存在的字卡，从各分组的关系里清掉（删除字卡 / 清空字卡之后调用）。
  function pruneGroups(dreamId, totalCards, options) {
    const total = new Set(uniqueTexts(totalCards));
    return Boolean(updateConfig(dreamId, (config) => {
      let changed = false;
      config.groups.forEach((group) => {
        const kept = group.cards.filter((card) => total.has(card));
        if (kept.length !== group.cards.length) { group.cards = kept; changed = true; }
      });
      return changed;
    }, options));
  }

  function groupedCardSet(config) {
    const set = new Set();
    config.groups.forEach((group) => group.cards.forEach((card) => set.add(card)));
    return set;
  }

  // 当前允许说的用户字卡：属于至少一个开启分组，或未分组且“未分组”开启。
  function allowedCards(totalCards, configInput) {
    const config = normalizeConfig(configInput);
    const total = uniqueTexts(totalCards);
    if (!config.groups.length && config.ungroupedEnabled) return total;
    const grouped = groupedCardSet(config);
    const enabled = new Set();
    config.groups.forEach((group) => { if (group.enabled) group.cards.forEach((card) => enabled.add(card)); });
    return total.filter((card) => enabled.has(card) || (!grouped.has(card) && config.ungroupedEnabled));
  }

  function systemAllowed(configInput) {
    return normalizeConfig(configInput).systemEnabled !== false;
  }

  function summarize(totalCards, configInput) {
    const config = normalizeConfig(configInput);
    const total = uniqueTexts(totalCards);
    const totalSet = new Set(total);
    const grouped = groupedCardSet(config);
    return {
      total: total.length,
      allowed: allowedCards(total, config).length,
      ungroupedCount: total.filter((card) => !grouped.has(card)).length,
      ungroupedEnabled: config.ungroupedEnabled,
      systemEnabled: config.systemEnabled,
      groups: config.groups.map((group) => ({
        id: group.id,
        name: group.name,
        enabled: group.enabled,
        count: group.cards.filter((card) => totalSet.has(card)).length
      }))
    };
  }

  /* ---------------- 问题 ---------------- */

  function normalizeQuestion(value) {
    const source = value && typeof value === 'object' ? value : {};
    const kind = Object.prototype.hasOwnProperty.call(KIND_LABELS, source.kind) ? source.kind : '';
    const question = cleanText(source.question).slice(0, MAX_QUESTION_TEXT);
    if (!kind || !question) return null;
    let options = [];
    if (kind === 'judge') options = JUDGE_OPTIONS.slice();
    if (kind === 'single' || kind === 'multi') {
      // 选项由位置标识；相同文字仍是独立选项，只移除空项。
      options = (Array.isArray(source.options) ? source.options : []).map((item) => cleanText(item).slice(0, MAX_OPTION_TEXT)).filter(Boolean).slice(0, MAX_OPTIONS);
      if (options.length < 2) return null;
    }
    const normalized = { kind, question, options };
    const answer = normalizeAnswer(source.answer, normalized);
    if (answer) normalized.answer = answer;
    return normalized;
  }

  function normalizeAnswer(value, question) {
    if (!value || typeof value !== 'object') return null;
    if (question.kind === 'open') {
      const text=cleanText(value.text).slice(0,200);return text ? {text,indices:[],source:cleanText(value.source)||'local',at:Number(value.at||0)||0} : null;
    }
    const max = question.options.length;
    const indices = Array.from(new Set((Array.isArray(value.indices) ? value.indices : [])
      .map((item) => Math.floor(Number(item)))
      .filter((item) => Number.isFinite(item) && item >= 0 && item < max))).sort((a, b) => a - b);
    if (question.kind !== 'open' && !indices.length) return null;
    return {
      indices: question.kind === 'single' || question.kind === 'judge' ? indices.slice(0, 1) : indices,
      source: cleanText(value.source) || 'local',
      at: Number(value.at || 0) || 0
    };
  }

  function kindLabel(kind) {
    return KIND_LABELS[kind] || '';
  }

  function answerText(question, indices) {
    return (Array.isArray(indices) ? indices : [])
      .map((index) => question.options[index])
      .filter(Boolean)
      .join('、');
  }

  // 聊天列表预览、引用、沉浸式模式、历史记录里用的纯文字版本。
  function questionSummaryText(questionInput) {
    if (Array.isArray(questionInput?.questions)) {
      const batch = normalizeQuestionBatch(questionInput);
      return batch ? batch.questions.map((question,index) => `${index + 1}. ${questionSummaryText(question)}`).join('\n\n') : '';
    }
    const question = normalizeQuestion(questionInput);
    if (!question) return '';
    if (question.kind === 'open') return `【问题】${question.question}`;
    return `【${kindLabel(question.kind)}】${question.question}\n${question.options.join(' / ')}`;
  }

  function buildQuestionPrompt(questionInput) {
    if (Array.isArray(questionInput?.questions)) {
      const batch = normalizeQuestionBatch(questionInput);
      if (!batch) return '';
      if (batch.questions.length === 1) return buildQuestionPrompt(batch.questions[0])+
        (batch.questions[0].kind==='open' ? '回复后附一行答案标记，如〔回答:q1:今天去了书店〕，这一行不用解释。' : '');
      const rows = batch.questions.map(q => q.kind === 'open'
        ? `${q.questionId}（开放回答）${q.question}`
        : `${q.questionId}（${kindLabel(q.kind)}）${q.question}；选项：${q.options.map((s,i)=>`${i+1}. ${s}`).join('；')}`);
      return `[互动事件：多个问题] 用户一次问了你${batch.questions.length}个问题，请以你的身份逐题回答，不漏答、不合并。\n${rows.join('\n')}\n单选和判断只选一项，多选可选多项；相同文字的选项按序号区分。自然说出答案，每题附独立标记，如〔回答:q1:2〕、〔回答:q2:1,3〕；开放题附文字答案，如〔回答:q3:今天去了书店〕。`;
    }
    const question = normalizeQuestion(questionInput);
    if (!question) return '';
    if (question.kind === 'open') {
      return `[互动事件：问题] 用户认真地问了你一个问题：“${question.question}”。请以你的身份，结合当前关系和对话，给出你自己真实的回答。`;
    }
    const numbered = question.options.map((option, index) => `${index + 1}. ${option}`).join('；');
    const rule = question.kind === 'multi'
      ? '可以选一个或多个'
      : (question.kind === 'judge' ? '只能回答其中一个' : '只能选其中一个');
    const example = question.kind === 'multi' ? '〔回答:1,3〕' : '〔回答:2〕';
    return `[互动事件：问题·${kindLabel(question.kind)}] 用户问你：“${question.question}”。选项：${numbered}。`
      + `请以你的身份，结合当前关系和对话，真的做出选择（${rule}），并像平时聊天一样自然地说出你选的内容，不要报序号，也不要照抄选项列表。`
      + `回复的最后另起一行，只写你选择的序号，格式如${example}，不要解释这一行。`;
  }

  function hasAnswerTag(text) {
    ANSWER_TAG_PATTERN.lastIndex = 0;
    return ANSWER_TAG_PATTERN.test(String(text || ''));
  }

  function stripAnswerTag(text) {
    ANSWER_TAG_PATTERN.lastIndex = 0;
    return String(text || '').replace(ANSWER_TAG_PATTERN, '').replace(/\n{3,}/g, '\n\n').trim();
  }

  // 从 AI 回复里取回选择：优先读〔回答:序号〕标记；没有标记时按“回复里提到了哪些选项”兜底。
  function parseAnswer(text, questionInput) {
    const question = normalizeQuestion(questionInput);
    const raw = String(text || '');
    const cleanedText = stripAnswerTag(raw);
    if (!question || question.kind === 'open') return { indices: null, cleanedText, source: '' };
    let tagged = null;
    ANSWER_TAG_PATTERN.lastIndex = 0;
    let match = ANSWER_TAG_PATTERN.exec(raw);
    while (match) {
      tagged = match[1];
      match = ANSWER_TAG_PATTERN.exec(raw);
    }
    const max = question.options.length;
    if (tagged !== null) {
      const fromNumbers = Array.from(new Set((String(tagged).match(/\d+/g) || [])
        .map((item) => Number(item) - 1)
        .filter((item) => item >= 0 && item < max)));
      const fromText = fromNumbers.length ? [] : question.options
        .map((option, index) => (String(tagged).includes(option) ? index : -1))
        .filter((index) => index >= 0);
      const indices = (fromNumbers.length ? fromNumbers : fromText).sort((a, b) => a - b);
      if (indices.length) {
        return {
          indices: question.kind === 'multi' ? indices : indices.slice(0, 1),
          cleanedText,
          source: 'tag'
        };
      }
    }
    const mentioned = matchAnswerByText(cleanedText, question);
    return { indices: mentioned, cleanedText, source: mentioned ? 'text' : '' };
  }

  function matchAnswerByText(text, questionInput) {
    const question = normalizeQuestion(questionInput);
    const body = String(text || '');
    if (!question || question.kind === 'open' || !body) return null;
    if (question.kind === 'judge') {
      // “是/否”太短，正文里随处可见，不做文字兜底，避免误判。
      return null;
    }
    const hits = question.options
      .map((option, index) => (option.length >= 2 && body.includes(option) ? index : -1))
      .filter((index) => index >= 0);
    if (!hits.length) return null;
    if (hits.some(index => question.options.indexOf(question.options[index]) !== question.options.lastIndexOf(question.options[index]))) return null;
    if (question.kind === 'single') return hits.length === 1 ? hits : null;
    return hits;
  }

  function normalizeQuestionBatch(value) {
    const list = Array.isArray(value?.questions) ? value.questions : [value];
    if (!list.length || list.length > MAX_QUESTIONS) return null;
    const questions = list.map((item,index) => {
      const q = normalizeQuestion(item);
      return q ? { ...q, questionId: `q${index+1}` } : null;
    });
    return questions.every(Boolean) ? { questions } : null;
  }

  function parseBatchAnswers(text, value) {
    const batch = normalizeQuestionBatch(value);
    if (!batch) return { answers: [], cleanedText: stripAnswerTag(text) };
    const answers = [];
    for (const q of batch.questions) {
      const pattern = new RegExp('[〔\\[【]\\s*回答\\s*[:：]\\s*'+q.questionId+'\\s*[:：]\\s*([^〕\\]】]*)[〕\\]】]', 'g');
      const matches = Array.from(String(text || '').matchAll(pattern));
      if(q.kind==='open' && matches.length){
        const answer=cleanText(matches.at(-1)[1]).slice(0,200);
        if(answer)answers.push({questionId:q.questionId,text:answer,indices:[],source:'tag'});
        continue;
      }
      const raw = matches.length ? `〔回答:${matches.at(-1)[1]}〕` : batch.questions.length === 1 ? text : '';
      const parsed = parseAnswer(raw,q);
      if (parsed.indices?.length) answers.push({ questionId:q.questionId, indices:parsed.indices, source:parsed.source });
    }
    return { answers, cleanedText:stripAnswerTag(text) };
  }

  function isQuestionCard(text) { return cleanText(text).startsWith(QUESTION_CARD_PREFIX); }
  function parseQuestionCard(text) {
    if (!isQuestionCard(text) || String(text).length > 8000) return null;
    try { return normalizeQuestionBatch(JSON.parse(cleanText(text).slice(QUESTION_CARD_PREFIX.length))); } catch (_) { return null; }
  }
  function serializeQuestionCard(value) {
    const batch=normalizeQuestionBatch(value);
    return batch ? QUESTION_CARD_PREFIX+JSON.stringify({questions:batch.questions.map(({kind,question,options})=>({kind,question,options}))}) : '';
  }
  function cardPreview(line) { const batch=parseQuestionCard(line);return batch ? questionSummaryText(batch) : String(line || ''); }
  function pickAutomaticQuestionCount(availableCount, random) {
    const weights = QUESTION_COUNT_WEIGHTS.slice(0, Math.min(MAX_QUESTIONS, availableCount));
    let draw = random() * weights.reduce((total, weight) => total + weight, 0);
    // 题库不足时只在可用数量之间重新分配权重，不把剩余概率全挤到最大题数。
    for (let index = 0; index < weights.length; index += 1) {
      draw -= weights[index];
      if (draw < 0) return index + 1;
    }
    return weights.length;
  }

  function pickQuestionBatch(cards, config, recent = [], random = Math.random, existingSystemCards = []) {
    const normalized = normalizeConfig(config);
    if (!normalized.automaticQuestionsEnabled) return null;
    // 系统来源由调用方沿用既有卡池；这里再次守住开关，不补任何默认题库。
    const lines = allowedCards(cards, normalized);
    if (systemAllowed(normalized)) lines.push(...(Array.isArray(existingSystemCards) ? existingSystemCards : []).filter(line => typeof line === 'string'));
    const ordinary = [], pool = [];
    for (const line of lines) {
      if (isQuestionCard(line)) {
        const batch = parseQuestionCard(line);
        if (batch) pool.push(...batch.questions.map(question => ({ question })));
        continue; // 非法、过长的结构卡也不作为普通文字或选项显示。
      }
      const text = cleanText(line);
      if (!text) continue;
      ordinary.push(text);
      pool.push({ question: { kind: 'open', question: text.slice(0, MAX_QUESTION_TEXT), options: [] }, line: text });
    }
    const seen = new Set((Array.isArray(recent) ? recent : []).flatMap(message => normalizeQuestionBatch(message?.interactionData)?.questions.map(q => q.question) || []));
    const explicitTitles = new Set(pool.filter(item => !item.line).map(item => item.question.question));
    const titles = new Set(seen);
    const available = pool.filter(item => {
      const title = item.question.question;
      if (item.line && explicitTitles.has(title)) return false;
      if (titles.has(title)) return false;
      titles.add(title);
      return true;
    });
    if (!available.length) return null;
    const take = list => list.splice(Math.min(list.length - 1, Math.floor(random() * list.length)), 1)[0];
    const count = pickAutomaticQuestionCount(available.length, random);
    const selected = [];
    while (selected.length < count && available.length) {
      const item = take(available);
      if (!item.line) { selected.push(item.question); continue; }
      let kind = ['open', 'single', 'multi'][Math.min(2, Math.floor(random() * 3))];
      const options = [];
      if (kind !== 'open') {
        const choices = ordinary.filter(line => line !== item.line);
        if (choices.length < 2) kind = 'open';
        else {
          const optionCount = Math.min(choices.length, 2 + Math.floor(random() * (MAX_OPTIONS - 1)));
          while (options.length < optionCount) options.push(take(choices).slice(0, MAX_OPTION_TEXT));
        }
      }
      selected.push({ ...item.question, kind, options });
    }
    return normalizeQuestionBatch({ questions: selected });
  }

  // 字卡模式：随机作答，不调用 AI。
  function randomAnswer(questionInput, random) {
    const question = normalizeQuestion(questionInput);
    const rng = typeof random === 'function' ? random : Math.random;
    if (!question || question.kind === 'open') return null;
    const count = question.options.length;
    if (question.kind === 'multi') {
      const size = Math.min(count, 1 + Math.floor(rng() * count));
      const pool = question.options.map((_, index) => index);
      for (let index = pool.length - 1; index > 0; index -= 1) {
        const swap = Math.min(index, Math.floor(rng() * (index + 1)));
        [pool[index], pool[swap]] = [pool[swap], pool[index]];
      }
      const indices = pool.slice(0, Math.max(1, Math.min(count, size))).sort((a, b) => a - b);
      return { indices, text: answerText(question, indices) };
    }
    const picked = Math.min(count - 1, Math.floor(rng() * count));
    return { indices: [picked], text: answerText(question, [picked]) };
  }

  // 把问题画进普通聊天气泡的正文里：气泡本身（颜色、样式、主题）完全沿用当前聊天的气泡。
  function renderQuestionContent(content, message, settings = {}) {
    const doc=content?.ownerDocument, batch=normalizeQuestionBatch(message?.interactionData);
    if(!doc||!batch)return false;
    const span=(className,text)=>{const node=doc.createElement('span');node.className=className;if(text!==undefined)node.textContent=text;return node;};
    content.textContent='';content.classList.add('x-q');
    if(message.role==='ta'&&message.text&&!String(message.text).startsWith('【')&&!/^\d+\. 【/.test(message.text)){
      const intro=span('x-q-intro',message.text);settings.renderIntro?.(intro);content.appendChild(intro);
    }
    const canAnswer=message.role==='ta'&&typeof settings.onSubmit==='function'&&!message.revoked;
    const draftKey=settings.draftKey || '', draft=draftKey ? answerDrafts.get(draftKey) || {} : {};
    const answers={};let busy=false;
    batch.questions.forEach((q,number)=>{
      const section=span('x-q-item x-q-'+q.kind);section.appendChild(span('x-q-kind',`${batch.questions.length>1 ? (number+1)+'. ' : ''}${kindLabel(q.kind)}`));section.appendChild(span('x-q-title',q.question));
      const picked=new Set(q.answer?.indices || []);
      if(q.options.length){
        const list=span('x-q-options');
        q.options.forEach((option,index)=>{
          const row=doc.createElement(canAnswer&&!q.answer?'label':'span');row.className='x-q-option'+(picked.has(index)?' is-picked':'');
          if(canAnswer&&!q.answer){const input=doc.createElement('input');input.type=q.kind==='multi'?'checkbox':'radio';input.name='answer-'+message.id+'-'+q.questionId;input.dataset.qAnswer=q.questionId;input.dataset.qIndex=String(index);input.value=String(index);input.checked=Array.isArray(draft[q.questionId])&&draft[q.questionId].includes(index);row.appendChild(input);}else row.appendChild(span('x-q-mark'));
          row.appendChild(span('x-q-option-text',option));list.appendChild(row);
        });section.appendChild(list);
      }else if(canAnswer&&!q.answer){const input=doc.createElement('textarea');input.dataset.qAnswer=q.questionId;input.maxLength=200;input.rows=2;input.value=typeof draft[q.questionId]==='string'?draft[q.questionId]:'';input.placeholder='写下你的回答…';section.appendChild(input);}
      if(q.answer){answers[q.questionId]=q.answer;section.appendChild(span('x-q-status',(message.role==='ta'?'你的回答：':'对方的回答：')+(q.kind==='open'?q.answer.text:answerText(q,q.answer.indices))));}
      content.appendChild(section);
    });
    if(canAnswer&&batch.questions.some(q=>!q.answer)){
      const remember=event=>{
        const input=event.target, id=input.dataset?.qAnswer;if(!draftKey||!id)return;
        draft[id]=input.tagName==='TEXTAREA'?input.value:Array.from(content.querySelectorAll('[data-q-answer="'+id+'"]')).filter(n=>n.checked).map(n=>Number(n.dataset.qIndex));
        answerDrafts.set(draftKey,draft);if(answerDrafts.size>100)answerDrafts.delete(answerDrafts.keys().next().value);
      };
      content.addEventListener('input',remember);content.addEventListener('change',remember);
      const hint=span('x-q-status','逐题回答后统一发送');const submit=doc.createElement('button');submit.type='button';submit.dataset.qSubmit='1';submit.className='x-q-submit';submit.textContent='发送回答';content.append(hint,submit);
      submit.addEventListener('click',async event=>{
        event.stopPropagation();if(busy||settings.isActive&& !settings.isActive())return;
        const selected=batch.questions.map(q=>{
          if(answers[q.questionId])return {questionId:q.questionId,kind:q.kind,...answers[q.questionId]};
          const inputs=Array.from(content.querySelectorAll('[data-q-answer="'+q.questionId+'"]'));
          if(q.kind==='open')return {questionId:q.questionId,kind:q.kind,text:cleanText(inputs[0]?.value)};
          return {questionId:q.questionId,kind:q.kind,indices:inputs.filter(input=>input.checked).map(input=>Number(input.dataset.qIndex))};
        });
        if(selected.some(a=>a.kind==='open'?!a.text:!a.indices?.length)){hint.textContent='请先回答每一道问题';return;}
        busy=true;submit.disabled=true;
        try{const ok=await settings.onSubmit(selected);if(ok===false){submit.disabled=false;}else{answerDrafts.delete(draftKey);submit.textContent='已发送';hint.textContent='回答已保存';}}
        catch(error){hint.textContent=error.message || '发送失败，请重试';submit.disabled=false;}
        finally{busy=false;}
      });
    }
    return true;
  }

  /* ---------------- 问题编辑弹窗 ---------------- */

  function parseCssColor(value) {
    const text = cleanText(value);
    let match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text);
    if (match) {
      const hex = match[1].length === 3 ? match[1].split('').map((ch) => ch + ch).join('') : match[1];
      return [0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
    }
    match = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i.exec(text);
    return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
  }

  // 只接受能解析的纯色；文字色没给或对比不够时，按底色深浅自动选深色或白色字。
  function readableAccent(accent) {
    const bg = parseCssColor(accent && accent.bg);
    if (!bg) return null;
    const luminance = (rgb) => (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
    const fg = parseCssColor(accent.fg);
    const autoFg = luminance(bg) > 0.62 ? '#2f2a3d' : '#ffffff';
    const usable = fg && Math.abs(luminance(fg) - luminance(bg)) >= 0.4;
    return { bg: `rgb(${bg.map((n) => Math.round(n)).join(', ')})`, fg: usable ? `rgb(${fg.map((n) => Math.round(n)).join(', ')})` : autoFg };
  }

  function openQuestionEditor(options) {
    const doc=root.document, settings=options || {};
    if(!doc)return null;
    doc.querySelectorAll('.x-q-editor-mask').forEach(node=>node.remove());
    const mask=doc.createElement('div');mask.className='x-q-editor-mask';
    mask.innerHTML=`<section class="x-q-editor" role="dialog" aria-modal="true" aria-label="问题"><div class="x-q-editor-head"><strong>问题 · 最多5题</strong><button type="button" data-q-close aria-label="关闭">×</button></div><div data-q-editor-list></div><button type="button" class="x-q-editor-add" data-q-add-question>＋ 添加问题</button><p class="x-q-editor-note">按顺序排列，填写后一次发送。</p><div class="x-q-editor-actions"><button type="button" class="x-q-editor-send">发送</button></div></section>`;
    doc.body.appendChild(mask);
    const accent=readableAccent(settings.accent);
    if(accent){mask.classList.add('has-accent');mask.style.setProperty('--x-q-accent',accent.bg);mask.style.setProperty('--x-q-accent-fg',accent.fg);}
    const questions=[{kind:'single',question:'',options:['','']}];let sending=false;
    const list=mask.querySelector('[data-q-editor-list]');
    const collect=()=>list.querySelectorAll('[data-q-editor-row]').forEach(row=>{
      const q=questions[Number(row.dataset.qEditorRow)];q.question=row.querySelector('.x-q-editor-question').value;
      row.querySelectorAll('[data-q-option]').forEach(input=>q.options[Number(input.dataset.qOption)]=input.value);
    });
    const render=()=>{
      list.textContent='';
      questions.forEach((q,index)=>{
        const row=doc.createElement('section');row.className='x-q-editor-row';row.dataset.qEditorRow=String(index);
        row.innerHTML=`<div class="x-q-editor-head"><strong>第${index+1}题</strong>${questions.length>1?'<button type="button" data-q-remove-question aria-label="删除这个问题">×</button>':''}</div><div class="x-q-editor-kinds" role="group" aria-label="问题类型">${Object.entries(KIND_LABELS).map(([kind,label])=>`<button type="button" data-q-kind="${kind}" class="${q.kind===kind?'is-active':''}" aria-pressed="${q.kind===kind}">${label}</button>`).join('')}</div><textarea class="x-q-editor-question" rows="2" maxlength="${MAX_QUESTION_TEXT}" placeholder="想问什么？"></textarea><div class="x-q-editor-options"></div>`;
        row.querySelector('.x-q-editor-question').value=q.question;
        const box=row.querySelector('.x-q-editor-options');
        if(q.kind==='single'||q.kind==='multi'){
          q.options.forEach((value,i)=>{
            const item=doc.createElement('div');item.className='x-q-editor-option';
            item.innerHTML=`<input type="text" data-q-option="${i}" maxlength="${MAX_OPTION_TEXT}" placeholder="选项 ${i+1}">${q.options.length>2?`<button type="button" data-q-remove="${i}" aria-label="删除这个选项">×</button>`:''}`;
            item.querySelector('input').value=value;box.appendChild(item);
          });
          if(q.options.length<MAX_OPTIONS){const add=doc.createElement('button');add.type='button';add.className='x-q-editor-add';add.dataset.qAdd='1';add.textContent='＋ 添加选项';box.appendChild(add);}
        }
        list.appendChild(row);
      });
      const add=mask.querySelector('[data-q-add-question]');add.disabled=questions.length>=MAX_QUESTIONS;
    };
    mask.addEventListener('click',async event=>{
      const target=event.target;
      if(target===mask||target.closest('[data-q-close]')){mask.remove();return;}
      if(sending)return;
      const row=target.closest('[data-q-editor-row]'), index=Number(row?.dataset.qEditorRow), q=questions[index];
      collect();
      if(target.closest('[data-q-add-question]')){if(questions.length<MAX_QUESTIONS)questions.push({kind:'single',question:'',options:['','']});render();list.lastElementChild?.scrollIntoView({block:'nearest'});return;}
      if(target.closest('[data-q-remove-question]')){questions.splice(index,1);render();return;}
      const kind=target.closest('[data-q-kind]');if(kind&&q){q.kind=kind.dataset.qKind;render();return;}
      if(target.closest('[data-q-add]')&&q){if(q.options.length<MAX_OPTIONS)q.options.push('');render();return;}
      const remove=target.closest('[data-q-remove]');if(remove&&q){q.options.splice(Number(remove.dataset.qRemove),1);render();return;}
      const send=target.closest('.x-q-editor-send');
      if(!send)return;
      const batch=normalizeQuestionBatch({questions});
      if(!batch){settings.toast?.('请填写每道问题；单选、多选至少填写两个选项');return;}
      sending=true;
      try{
        const result=await settings.onSend?.(batch);
        if(result!==false)mask.remove();
      }catch(error){settings.toast?.(error.message || '操作失败，请重试');}finally{sending=false;}
    });
    render();root.setTimeout(()=>list.querySelector('.x-q-editor-question')?.focus(),30);return mask;
  }

  /* ---------------- 聊天设置里的分组管理 ---------------- */

  const escapeHtml = (value) => String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  function toggleMarkup(attribute, value, enabled) {
    // 一个按钮直接显示当前状态，点一下就切换。
    return `<button type="button" class="x-cg-switch ${enabled ? 'is-on' : 'is-off'}" ${attribute}="${escapeHtml(value)}" data-cg-state="${enabled ? 'on' : 'off'}" aria-pressed="${enabled ? 'true' : 'false'}">${enabled ? '已开启' : '已关闭'}</button>`;
  }

  function parseImportedCards(text, fileName) {
    const body = String(text || '');
    if (/\.json$/i.test(String(fileName || '')) || /^\s*[\[{]/.test(body)) {
      try {
        const parsed = JSON.parse(body);
        const list = Array.isArray(parsed) ? parsed : (Array.isArray(parsed && parsed.customReplies) ? parsed.customReplies : null);
        if (list) return uniqueTexts(list.filter((item) => typeof item === 'string'));
      } catch (_) {}
    }
    return uniqueTexts(body.split(/\r?\n/));
  }

  // deps: { readCards(dreamId) -> string[], appendCards(lines, dreamId) -> result, toast(text), confirm({title,body,confirmText,onConfirm}), onChange() }
  function renderSettings(container, dreamId, deps) {
    const doc = root.document;
    if (!container || !doc) return;
    let block = container.querySelector('#xCardGroupsBlock');
    if (!dreamId) { if (block) block.hidden = true; return; }
    if (!block) {
      block = doc.createElement('div');
      block.id = 'xCardGroupsBlock';
      block.className = 'ix-card-manager x-cg-block';
      container.appendChild(block);
      block.addEventListener('click', (event) => {
        const currentDreamId = block.dataset.dreamId || '';
        const currentDeps = block._cgDeps || {};
        const stateButton = event.target.closest('[data-cg-state]');
        if (stateButton) {
          // 按钮显示的是当前状态，点击后切换到相反状态。
          const enabled = stateButton.dataset.cgState !== 'on';
          const stateText = enabled ? '已开启' : '已关闭';
          let label = '';
          if (stateButton.hasAttribute('data-cg-group')) {
            const groupId = stateButton.getAttribute('data-cg-group');
            const group = readConfig(currentDreamId).groups.find((item) => item.id === groupId);
            setGroupEnabled(currentDreamId, groupId, enabled);
            label = `“${group ? group.name : '这个'}”分组${stateText}`;
          } else if (stateButton.hasAttribute('data-cg-ungrouped')) {
            setUngroupedEnabled(currentDreamId, enabled);
            label = `“未分组”${stateText}`;
          } else if (stateButton.hasAttribute('data-cg-system')) {
            setSystemEnabled(currentDreamId, enabled);
            label = `系统字卡${stateText}`;
          }
          renderSettings(container, currentDreamId, currentDeps);
          currentDeps.onChange?.();
          const summary = summarize(currentDeps.readCards?.(currentDreamId) || [], readConfig(currentDreamId));
          currentDeps.toast?.(!summary.systemEnabled && !summary.allowed ? `${label}。${NO_CARDS_MESSAGE}` : label);
          return;
        }
        if (event.target.closest('[data-cg-add]')) {
          const input = block.querySelector('#xCardGroupName');
          const result = createGroup(currentDreamId, input?.value || '');
          if (!result.ok) {
            currentDeps.toast?.(result.reason === 'duplicate_name' ? '已经有同名分组了'
              : result.reason === 'limit' ? `最多创建 ${MAX_GROUPS} 个分组`
                : '先写下分组名称');
            return;
          }
          renderSettings(container, currentDreamId, currentDeps);
          currentDeps.onChange?.();
          openGroupEditor(currentDreamId, result.group.id, currentDeps, () => renderSettings(container, currentDreamId, currentDeps));
          return;
        }
        const manage = event.target.closest('[data-cg-manage]');
        if (manage) {
          openGroupEditor(currentDreamId, manage.getAttribute('data-cg-manage'), currentDeps, () => renderSettings(container, currentDreamId, currentDeps));
        }
      });
    }
    block.hidden = false;
    block.dataset.dreamId = String(dreamId);
    block._cgDeps = deps || {};
    const summary = summarize(deps?.readCards?.(dreamId) || [], readConfig(dreamId));
    const keepName = block.querySelector('#xCardGroupName')?.value || '';
    block.innerHTML = `
      <div class="x-cg-head"><strong>字卡分组</strong><span class="ix-setting-note">当前可说 ${summary.allowed} / ${summary.total} 张</span></div>
      <p class="ix-setting-note">字卡只存一份，分组只是给它分类。聊天时只会从开启的分组里抽字卡；一张字卡属于多个分组时，只要有一个分组开着就能说。</p>
      <div class="x-cg-list">
        ${summary.groups.map((group) => `
          <div class="x-cg-row">
            <span class="x-cg-name is-manage" role="button" tabindex="0" data-cg-manage="${escapeHtml(group.id)}"><span>${escapeHtml(group.name)}</span><em>${group.count} 张 · 管理</em></span>
            ${toggleMarkup('data-cg-group', group.id, group.enabled)}
          </div>`).join('')}
        <div class="x-cg-row">
          <span class="x-cg-name is-static"><span>未分组</span><em>${summary.ungroupedCount} 张</em></span>
          ${toggleMarkup('data-cg-ungrouped', '1', summary.ungroupedEnabled)}
        </div>
        <div class="x-cg-row">
          <span class="x-cg-name is-static"><span>系统字卡</span><em>SHE.X 内置回复</em></span>
          ${toggleMarkup('data-cg-system', '1', summary.systemEnabled)}
        </div>
      </div>
      <div class="x-cg-create">
        <input id="xCardGroupName" type="text" maxlength="${MAX_GROUP_NAME}" placeholder="新分组名称，例如：撒娇" autocomplete="off">
        <button type="button" data-cg-add>新建分组</button>
      </div>
      <p class="ix-setting-note">问题字卡可包含1～5题，沿用分组开关；字卡聊天会偶尔抽取来问你。</p>
      ${!summary.systemEnabled && !summary.allowed ? `<p class="ix-setting-note x-cg-warning">${NO_CARDS_MESSAGE}</p>` : ''}`;
    const nameInput = block.querySelector('#xCardGroupName');
    if (nameInput && keepName) nameInput.value = keepName;
  }

  const EDITOR_RENDER_LIMIT = 300;

  function openGroupEditor(dreamId, groupId, deps, onChange) {
    const doc = root.document;
    if (!doc) return null;
    doc.querySelectorAll('.x-cg-editor-mask').forEach((node) => node.remove());
    const findGroup = () => readConfig(dreamId).groups.find((group) => group.id === groupId) || null;
    if (!findGroup()) return null;
    const mask = doc.createElement('div');
    mask.className = 'x-cg-editor-mask';
    mask.innerHTML = `
      <section class="x-cg-editor" role="dialog" aria-modal="true">
        <div class="x-q-editor-head"><strong>管理分组</strong><button type="button" data-cg-close aria-label="关闭">×</button></div>
        <div class="x-cg-editor-name">
          <input type="text" maxlength="${MAX_GROUP_NAME}" data-cg-name autocomplete="off">
          <button type="button" data-cg-rename>改名</button>
          <button type="button" class="danger" data-cg-delete>删除分组</button>
        </div>
        <strong class="x-cg-editor-title">从总字卡里选择</strong>
        <input type="search" data-cg-search placeholder="搜索字卡" autocomplete="off">
        <div class="x-cg-editor-list" data-cg-cards></div>
        <strong class="x-cg-editor-title">在这个分组里新增</strong>
        <textarea rows="3" data-cg-new placeholder="一行一句。保存后会同时进入总字卡，并自动加入这个分组。"></textarea>
        <div class="x-cg-editor-actions">
          <button type="button" data-cg-save-new>保存到本组</button>
          <label class="x-cg-editor-import">导入到本组<input type="file" accept=".txt,.csv,.json,text/plain,application/json" data-cg-import></label>
        </div>
      </section>`;
    doc.body.appendChild(mask);
    const nameInput = mask.querySelector('[data-cg-name]');
    const searchInput = mask.querySelector('[data-cg-search]');
    const cardsBox = mask.querySelector('[data-cg-cards]');
    const changed = () => { onChange?.(); deps?.onChange?.(); };
    const renderCards = () => {
      const group = findGroup();
      if (!group) return;
      const keyword = cleanText(searchInput.value).toLowerCase();
      const included = new Set(group.cards);
      const total = uniqueTexts(deps?.readCards?.(dreamId) || []);
      const matched = total.filter((card) => !keyword || card.toLowerCase().includes(keyword));
      // 已在本组的排前面，方便检查。
      matched.sort((a, b) => Number(included.has(b)) - Number(included.has(a)));
      cardsBox.textContent = '';
      if (!matched.length) {
        const empty = doc.createElement('p');
        empty.className = 'ix-setting-note';
        empty.textContent = total.length ? '没有匹配的字卡' : '总字卡里还没有字卡，可以在下面直接新增。';
        cardsBox.appendChild(empty);
        return;
      }
      matched.slice(0, EDITOR_RENDER_LIMIT).forEach((card) => {
        const label = doc.createElement('label');
        label.className = 'x-cg-card';
        const box = doc.createElement('input');
        box.type = 'checkbox';
        box.checked = included.has(card);
        box.dataset.cgCard = card;
        const text = doc.createElement('span');
        text.textContent = cardPreview(card);
        label.append(box, text);
        cardsBox.appendChild(label);
      });
      if (matched.length > EDITOR_RENDER_LIMIT) {
        const more = doc.createElement('p');
        more.className = 'ix-setting-note';
        more.textContent = `只显示前 ${EDITOR_RENDER_LIMIT} 张，可以用搜索找到其余字卡。`;
        cardsBox.appendChild(more);
      }
    };
    // 勾选是即时保存的；这里记下本次打开后勾选产生的变化，点“保存到本组”时如实告诉用户结果。
    const pendingChecks = { added: 0, removed: 0 };
    const reportCheckChanges = () => {
      const { added, removed } = pendingChecks;
      pendingChecks.added = 0;
      pendingChecks.removed = 0;
      if (added && removed) deps?.toast?.(`已加入 ${added} 张字卡，移出 ${removed} 张`);
      else if (added) deps?.toast?.(`已加入 ${added} 张字卡`);
      else if (removed) deps?.toast?.(`已从本组移出 ${removed} 张字卡`);
      else deps?.toast?.('没有新的字卡可以加入');
    };
    const addLinesToGroup = (lines) => {
      const wanted = uniqueTexts(lines);
      if (!wanted.length) { reportCheckChanges(); return; }
      // 先进总字卡（沿用原有的去重和数量上限），再把确实在总字卡里的那些归进本组。
      deps?.appendCards?.(wanted, dreamId);
      const total = new Set(uniqueTexts(deps?.readCards?.(dreamId) || []));
      const accepted = wanted.filter((line) => total.has(line));
      const added = addCardsToGroup(dreamId, groupId, accepted);
      const checkedAdded = pendingChecks.added;
      pendingChecks.added = 0;
      pendingChecks.removed = 0;
      if (added + checkedAdded > 0) deps?.toast?.(`已加入 ${added + checkedAdded} 张字卡`);
      else if (accepted.length) deps?.toast?.('没有新的字卡可以加入');
      else deps?.toast?.('这些字卡没能加入总字卡，可能已达到数量上限');
      renderCards();
      changed();
    };
    nameInput.value = findGroup().name;
    searchInput.addEventListener('input', renderCards);
    cardsBox.addEventListener('change', (event) => {
      const box = event.target.closest('input[data-cg-card]');
      if (!box) return;
      if (setCardInGroup(dreamId, groupId, box.dataset.cgCard, box.checked)) {
        // 勾上又取消（或反过来）互相抵消，只统计净变化。
        if (box.checked) { if (pendingChecks.removed) pendingChecks.removed -= 1; else pendingChecks.added += 1; }
        else if (pendingChecks.added) pendingChecks.added -= 1;
        else pendingChecks.removed += 1;
      }
      changed();
    });
    mask.querySelector('[data-cg-import]').addEventListener('change', (event) => {
      const input = event.target;
      const file = input.files && input.files[0];
      if (!file) return;
      if (file.size > 1024 * 1024) { deps?.toast?.('文件太大，请控制在 1MB 以内'); input.value = ''; return; }
      const reader = new root.FileReader();
      reader.onload = () => { addLinesToGroup(parseImportedCards(reader.result, file.name)); input.value = ''; };
      reader.onerror = () => { deps?.toast?.('读取文件失败'); input.value = ''; };
      reader.readAsText(file);
    });
    mask.addEventListener('click', (event) => {
      const target = event.target;
      if (target === mask || target.closest('[data-cg-close]')) { mask.remove(); return; }
      if (target.closest('[data-cg-rename]')) {
        const result = renameGroup(dreamId, groupId, nameInput.value);
        deps?.toast?.(result.ok ? '分组名称已保存'
          : result.reason === 'duplicate_name' ? '已经有同名分组了' : '先写下分组名称');
        if (result.ok) changed();
        return;
      }
      if (target.closest('[data-cg-delete]')) {
        const remove = () => { deleteGroup(dreamId, groupId); mask.remove(); deps?.toast?.('分组已删除，字卡仍保留在总字卡里'); changed(); };
        if (typeof deps?.confirm === 'function') {
          deps.confirm({ title: '删除这个分组？', body: '只删除分组，里面的字卡仍保留在总字卡里。', confirmText: '删除分组', onConfirm: remove });
        } else remove();
        return;
      }
      if (target.closest('[data-cg-save-new]')) {
        const textarea = mask.querySelector('[data-cg-new]');
        addLinesToGroup(String(textarea.value || '').split(/\r?\n/));
        textarea.value = '';
      }
    });
    renderCards();
    return mask;
  }

  const api = {
    NO_CARDS_MESSAGE,
    KIND_LABELS,
    MAX_OPTIONS,
    storageKey,
    normalizeConfig,
    readConfig,
    writeConfig,
    createGroup,
    renameGroup,
    deleteGroup,
    setGroupEnabled,
    setUngroupedEnabled,
    setSystemEnabled,
    setAutomaticQuestionsEnabled,
    setCardInGroup,
    addCardsToGroup,
    pruneGroups,
    allowedCards,
    systemAllowed,
    summarize,
    parseImportedCards,
    normalizeQuestion,
    MAX_QUESTIONS,
    normalizeQuestionBatch,
    parseBatchAnswers,
    isQuestionCard,
    parseQuestionCard,
    serializeQuestionCard,
    cardPreview,
    pickQuestionBatch,
    kindLabel,
    answerText,
    questionSummaryText,
    buildQuestionPrompt,
    hasAnswerTag,
    stripAnswerTag,
    parseAnswer,
    matchAnswerByText,
    randomAnswer,
    renderQuestionContent,
    openQuestionEditor,
    readableAccent,
    renderSettings,
    openGroupEditor
  };
  root.SHEXCardGroups = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
