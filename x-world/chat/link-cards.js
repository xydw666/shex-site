(function (root) {
  'use strict';

  var BOARDS = [
    { id: 'letters', label: 'X信笺' },
    { id: 'companion', label: 'X陪伴' },
    { id: 'pet', label: '小宠' },
    { id: 'games', label: '一起玩' },
    { id: 'dating', label: 'X约会' }
  ];
  var MIN = 60000, HOUR = 3600000, DAY = 86400000;
  // 测试开关：true 时每条消息都尝试出卡，忽略 15% 概率、20 分钟间隔和各板块冷却。正式上线前必须改回 false。
  var TEST_MODE = false;
  // 测试时只出某一种卡：'letters' / 'pet' / 'companion' / ''（不限）。只在 TEST_MODE 为 true 时生效。
  var TEST_ONLY = '';
  var LOG_PREFIX = 'shex_link_cards_log_v1:';
  var SET_PREFIX = 'shex_link_cards_settings_v1:';
  var memory = {};
  var expandedState = false;

  function storeGet(key) {
    try {
      var v = root.localStorage.getItem(key);
      if (v !== null && v !== undefined) return v;
    } catch (e) { /* fall through */ }
    return Object.prototype.hasOwnProperty.call(memory, key) ? memory[key] : null;
  }
  function storeSet(key, val) {
    memory[key] = val;
    try { root.localStorage.setItem(key, val); } catch (e) { /* memory only */ }
  }
  function parse(s, fb) {
    try { var o = JSON.parse(s); return o && typeof o === 'object' ? o : fb; } catch (e) { return fb; }
  }

  // ---------- settings ----------
  function defaultSettings() { return { on: true, boards: { letters: true, companion: true, pet: true, games: true, dating:true } }; }
  function readSettings(userId, dreamId) {
    var raw = parse(storeGet(SET_PREFIX + userId + ':' + dreamId), null);
    var s = defaultSettings();
    if (raw) {
      if (raw.on === false) s.on = false;
      BOARDS.forEach(function (b) { if (raw.boards && raw.boards[b.id] === false) s.boards[b.id] = false; });
    }
    return s;
  }
  function writeSettings(userId, dreamId, settings) {
    var s = defaultSettings();
    s.on = !(settings && settings.on === false);
    BOARDS.forEach(function (b) { s.boards[b.id] = !(settings && settings.boards && settings.boards[b.id] === false); });
    storeSet(SET_PREFIX + userId + ':' + dreamId, JSON.stringify(s));
  }

  // ---------- log ----------
  function readLog(userId, dreamId, now) {
    var log = parse(storeGet(LOG_PREFIX + userId + ':' + dreamId), {});
    var out = { lastAt: Number(log.lastAt) || 0, letters: {}, pet: {}, companion: { invite: 0, decline: 0 }, adopt: { invite: 0, decline: 0 }, games: { invite: 0, decline: 0 } };
    out.dating={sent:Number(log.dating&&log.dating.sent)||0,declinedInvite:Number(log.dating&&log.dating.declinedInvite)||0};
    var cut = now - 30 * DAY;
    var l = log.letters || {};
    Object.keys(l).forEach(function (k) {
      if (l[k] && l[k].last > cut) out.letters[k] = { count: Number(l[k].count) || 0, last: l[k].last };
    });
    var p = log.pet || {};
    Object.keys(p).forEach(function (k) { if (p[k] > cut) out.pet[k] = p[k]; });
    ['companion', 'adopt', 'games'].forEach(function (g) {
      ['invite', 'decline'].forEach(function (f) {
        var v = log[g] && Number(log[g][f]);
        if (v && v > cut) out[g][f] = v;
      });
    });
    var keys = Object.keys(out.letters);
    if (keys.length > 20) {
      keys.sort(function (a, b) { return out.letters[b].last - out.letters[a].last; });
      keys.slice(20).forEach(function (k) { delete out.letters[k]; });
    }
    var pk = Object.keys(out.pet);
    if (pk.length > 20) {
      pk.sort(function (a, b) { return out.pet[b] - out.pet[a]; });
      pk.slice(20).forEach(function (k) { delete out.pet[k]; });
    }
    return out;
  }
  function writeLog(userId, dreamId, log) { storeSet(LOG_PREFIX + userId + ':' + dreamId, JSON.stringify(log)); }

  function pick(arr, random) {
    return arr[Math.min(arr.length - 1, Math.floor(random() * arr.length))];
  }

  // ---------- text ----------
  var NEED_TEXT = { hungry: '肚子饿了', sleepy: '有点困了', bored: '想找人玩' };
  var NEED_SHORT = { hungry: '饿了', sleepy: '困了', bored: '想玩' };

  // 信件和小宠卡用梦角自己的口吻；按卡片编号固定选一句，重绘时不会变。
  var LETTER_LINES = ['我给你写了一封信，还没拆吧？', '有封信在等你，是我写的。', '信寄到了，记得拆开看看。', '给你写了点东西，放在信笺里了。'];
  var PET_LINES = {
    hungry: ['{n}好像饿了，一直围着碗转。', '{n}肚子咕咕叫了，我们去喂喂它？', '{n}好像饿了，你去看看它吧。'],
    sleepy: ['{n}困得眼睛都睁不开了。', '{n}打了好几个哈欠，陪它去睡会儿？', '{n}好像困了，去哄它睡一下吧。'],
    bored: ['{n}一直在找你，想让你陪它玩。', '{n}好无聊的样子，去陪它玩一玩？', '{n}叼着玩具在等你呢。']
  };
  var PET_BUTTON = { hungry: '去喂它', sleepy: '去哄它睡', bored: '陪它玩一玩' };
  function pickLine(c, list) {
    var id = String(c.cardId || ''), h = 0;
    for (var i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 9973;
    return list[h % list.length];
  }
  function voiceLine(c) {
    var d = c.data || {};
    if (c.kind === 'letter') return pickLine(c, LETTER_LINES);
    if (c.kind === 'pet_status') return pickLine(c, PET_LINES[d.need] || PET_LINES.bored).replace('{n}', String(d.name || '小宠'));
    return '';
  }
  function summaryText(c) {
    if (!c || !c.data) return '';
    var d = c.data, s = c.status, t;
    if (String(c.kind).indexOf('dating_')===0) return String(d.summary||'');
    if (c.kind === 'letter') {
      t = '（发来信件卡片：' + voiceLine(c) + '）';
      return s === 'done' ? t.slice(0, -1) + '——对方已经去看了）' : t;
    }
    if (c.kind === 'pet_status') {
      t = '（发来小宠卡片：' + voiceLine(c) + '）';
      return s === 'done' ? t.slice(0, -1) + '——对方已去照顾）' : t;
    }
    if (c.kind === 'pet_adopt') {
      t = '（发来领养邀请：要不要一起养一只小宠）';
      if (s === 'accepted') return t.slice(0, -1) + '——对方去看看了）';
      if (s === 'declined') return t.slice(0, -1) + '——对方暂时不想养）';
      return t;
    }
    if (c.kind === 'companion') {
      t = '（发来陪伴邀请：' + (d.goalSource === 'card' ? '「' + d.goal + '」' : '一起' + d.goal) + '，' + d.minutes + '分钟，歌曲《' + d.trackTitle + '》）';
      var suf = { accepted: '对方已接受，陪伴已开始', declined: '对方拒绝了', failed: '没能开始' }[s];
      return suf ? t.slice(0, -1) + '——' + suf + '）' : t;
    }
    if (c.kind === 'game') {
      t = '（发来游戏邀请：' + gameTitle(d) + '）';
      return s === 'accepted' ? t.slice(0, -1) + '——对方已参与，进入游戏准备页）' : s === 'declined' ? t.slice(0, -1) + '——对方暂时不玩）' : t;
    }
    return '';
  }
  function describe(c) {
    var d = c.data;
    if (c.kind === 'letter') return '信件卡片（你说：“' + voiceLine(c) + '”，提醒对方去看你写的信）';
    if (c.kind === 'pet_status') return '小宠卡片（你说：“' + voiceLine(c) + '”，小宠' + (NEED_TEXT[d.need] || '') + '）';
    if (c.kind === 'pet_adopt') return '领养邀请（邀请对方一起养小宠）';
    if (c.kind === 'game') return '游戏邀请（邀请对方一起玩' + gameTitle(d) + '，还没有开始对局或扣费）';
    if (d.goalByAI === 'pending') return '陪伴邀请（' + d.minutes + '分钟，歌曲《' + d.trackTitle + '》，目标由你来定）';
    if (d.goalSource === 'card') return '陪伴邀请（「' + d.goal + '」，' + d.minutes + '分钟，歌曲《' + d.trackTitle + '》）';
    return '陪伴邀请（一起' + d.goal + '，' + d.minutes + '分钟，歌曲《' + d.trackTitle + '》）';
  }

  // ---------- create ----------
  function petNeed(p) {
    if (!p || p.isSleeping) return null;
    if (p.satiety < 30) return 'hungry';
    if (p.energy < 30) return 'sleepy';
    if (p.mood < 30) return 'bored';
    return null;
  }

  function gameTitle(d) { return d.game === 'ludo' ? '飞行棋 · ' + String(d.levelTitle || ('第 ' + d.levelId + ' 关')) : '二选一'; }

  function planCard(ctx) {
    if (!ctx || !ctx.userId || !ctx.dreamId) return null;
    var now = typeof ctx.now === 'number' ? ctx.now : Date.now();
    var random = typeof ctx.random === 'function' ? ctx.random : Math.random;
    var st = readSettings(ctx.userId, ctx.dreamId);
    if (!st.on) return null;
    if (TEST_MODE && TEST_ONLY) st = { on: true, boards: { letters: TEST_ONLY === 'letters' && st.boards.letters, pet: TEST_ONLY === 'pet' && st.boards.pet, companion: TEST_ONLY === 'companion' && st.boards.companion, games: TEST_ONLY === 'games' && st.boards.games } };
    var log = TEST_MODE ? readLog('', '', 0) : readLog(ctx.userId, ctx.dreamId, now);
    var datingPolicy=root.SHEXDatingCards&&root.SHEXDatingCards.POLICY;
    if (!TEST_MODE && log.lastAt && now - log.lastAt < (datingPolicy?datingPolicy.globalCooldownMs:20 * MIN)) return null;
    if (!TEST_MODE && random() >= (datingPolicy?datingPolicy.attemptProbability:0.15)) return null;

    var kind = null, data = null, mark = null, candidates = [];
    var lt = ctx.letters && ctx.letters.unreadPaperId;
    if (st.boards.letters && lt) {
      var rec = log.letters[lt];
      if (!rec || (rec.count < 2 && now - rec.last > 6 * HOUR)) {
        kind = 'letter'; data = { paperId: String(lt) };
        mark = function () {
          var r = log.letters[lt] || { count: 0, last: 0 };
          log.letters[lt] = { count: r.count + 1, last: now };
        };
        candidates.push({ kind: kind, data: data, mark: mark });
      }
    }
    var cp = ctx.companion;
    if (st.boards.companion && cp && !cp.inSession && cp.tracks && cp.tracks.length) {
      if ((!log.companion.invite || now - log.companion.invite >= DAY) &&
          (!log.companion.decline || now - log.companion.decline >= 3 * DAY)) {
        var goal = '', goalSource = '';
        if (ctx.replyMode === 'ai') {
          goal = String(cp.lastGoal || '').trim().slice(0, 20);
          if (!goal) goal = pick(['看书', '学习', '整理房间', '工作', '写作业', '画画', '练字'], random);
        } else {
          // 字卡模式：目标从这位梦角当前启用的字卡里抽，不用系统设定；没有可用字卡就不发陪伴卡。
          var cardGoals = (Array.isArray(cp.cardGoals) ? cp.cardGoals : []).map(function (line) { return String(line || '').trim(); })
            .filter(function (line) { return line && line.length <= 40; });
          if (cardGoals.length) { goal = pick(cardGoals, random); goalSource = 'card'; }
        }
      }
      if (goal) {
        var tr = pick(cp.tracks, random);
        kind = 'companion';
        data = { goal: goal, trackId: String(tr.id), trackTitle: String(tr.title), minutes: pick([25, 30, 45, 60], random) };
        if (goalSource) data.goalSource = goalSource;
        // AI 模式：目标由梦角在本轮回复里定（隐藏标记），没给就用上面的备选目标。
        if (ctx.replyMode === 'ai') data.goalByAI = 'pending';
        mark = function () { log.companion.invite = now; };
        candidates.push({ kind: kind, data: data, mark: mark });
      }
    }
    var pets = Array.isArray(ctx.pets) ? ctx.pets : null;
    if (st.boards.pet && pets && pets.length) {
      var p = pets[0], need = petNeed(p);
      if (need) {
        var pk = String(p.species) + ':' + need;
        var petRecent = Object.keys(log.pet).some(function (k) { return now - log.pet[k] < DAY; });
        if (!petRecent) {
          kind = 'pet_status'; data = { species: String(p.species), name: String(p.name || '小宠'), need: need };
          mark = function () { log.pet[pk] = now; };
          candidates.push({ kind: kind, data: data, mark: mark });
        }
      }
    }
    if (st.boards.pet && pets && pets.length === 0) {
      if ((!log.adopt.invite || now - log.adopt.invite >= 7 * DAY) &&
          (!log.adopt.decline || now - log.adopt.decline >= 14 * DAY)) {
        kind = 'pet_adopt'; data = {};
        mark = function () { log.adopt.invite = now; };
        candidates.push({ kind: kind, data: data, mark: mark });
      }
    }
    if (st.boards.games && ctx.games && (!log.games.invite || now - log.games.invite >= DAY) &&
        (!log.games.decline || now - log.games.decline >= 3 * DAY)) {
      candidates.push({ kind: 'game', data: null, mark: function () { log.games.invite = now; } });
    }
    if(st.boards.dating&&ctx.dating&&datingPolicy&&(!log.dating.sent||now-log.dating.sent>=datingPolicy.datingCooldownMs)){
      candidates.push({kind:'dating',data:null,mark:function(){log.dating.sent=now;}});
    }
    if (!candidates.length) return null;
    var dating=candidates.find(function(v){return v.kind==='dating';}),others=candidates.filter(function(v){return v.kind!=='dating';}),selected;
    if(dating&&others.length){var roll=random();selected=roll<datingPolicy.datingWeight?dating:others[Math.min(others.length-1,Math.floor((roll-datingPolicy.datingWeight)/(1-datingPolicy.datingWeight)*others.length))];}
    else selected=pick(candidates,random);
    return { now: now, random: random, log: log, candidate:selected };
  }

  function commitCard(ctx, plan, games) {
    if (!plan || (typeof ctx.stillValid === 'function' && !ctx.stillValid())) return null;
    var now = plan.now, random = plan.random, log = plan.log, candidate = plan.candidate;
    // A concurrent turn or decline may have changed cooldowns while the state read was in flight.
    if (!TEST_MODE && JSON.stringify(readLog(ctx.userId, ctx.dreamId, now)) !== JSON.stringify(log)) return null;
    var kind = candidate.kind, data = candidate.data;
    if (kind === 'game') {
      if (!games) return null;
      var options = [];
      if (games.choice === true) options.push({ game: 'choice' });
      var levels = (Array.isArray(games.levels) ? games.levels : []).filter(function (item) { return item && /^\d{1,2}-[1-6]$/.test(item.id) && ['open', 'cleared'].indexOf(item.status) >= 0; });
      if (levels.length) options.push({ game: 'ludo' });
      if (!options.length) return null;
      data = pick(options, random);
      if (data.game === 'ludo') { var level = pick(levels, random); data = { game: 'ludo', levelId: level.id, levelTitle: String(level.title || ('第 ' + level.id + ' 关')).slice(0,60) }; }
    }
    candidate.mark();
    log.lastAt = now;
    writeLog(ctx.userId, ctx.dreamId, log);
    var card = plan.datingCard || {
      v: 1,
      cardId: 'lc_' + now.toString(36) + Math.floor(random() * 1679616).toString(36),
      kind: kind, status: 'pending', createdAt: now, dreamId: ctx.dreamId, data: data
    };
    return {
      message: { role: 'ta', text: summaryText(card), linkCard: card, sourceMode: ctx.replyMode === 'ai' ? 'ai' : 'card' },
      aiNote: plan.datingCard ? root.SHEXDatingCards.aiNote(card) : '[联动事件] 你刚刚在聊天里给对方发了一张卡片：' + describe(card) +
        '。卡片已经由系统发出，你只需在这条回复里自然地提一句或顺着接话，不要复述卡片格式，不要假装对方已经回应。' +
        (data.goalByAI === 'pending' ? '这次陪伴的目标由你来定：根据刚才的聊天想一个具体的小目标（2到10个字，例如“把报告写完”），在台词末尾附隐藏标记〔陪伴目标:目标〕，标记不会显示给对方。' : ''),
      cardId: card.cardId
    };
  }

  function maybeCreate(ctx) {
    var plan=planCard(ctx);if(plan&&plan.candidate.kind==='dating')return null;
    return commitCard(ctx, plan, ctx && typeof ctx.games !== 'function' ? ctx.games : null);
  }
  async function maybeCreateAsync(ctx) {
    var plan = planCard(ctx);
    if (!plan) return null;
    if(plan.candidate.kind==='dating'){
      var p=root.SHEXDatingCards.POLICY,random=plan.random,canInvite=!plan.log.dating.declinedInvite||plan.now-plan.log.dating.declinedInvite>=p.declinedInviteCooldownMs;
      var kind=!canInvite||random()<p.photoProbability?'dating_ta_photo':'dating_invite';
      var cardId='lc_'+plan.now.toString(36)+Math.floor(random()*1679616).toString(36);
      try{plan.datingCard=await ctx.dating.prepare({kind:kind,cardId:cardId,seed:cardId,now:plan.now});}catch(_){return null;}
      if(!plan.datingCard||!root.SHEXDatingCards.validateCard(plan.datingCard).ok)return null;
      plan.candidate.kind=plan.datingCard.kind;plan.candidate.data=plan.datingCard.data;
    }
    var games = ctx.games;
    if (plan.candidate.kind === 'game' && typeof games === 'function') {
      try { games = await games(); } catch (_) { return null; }
    }
    return commitCard(ctx, plan, games);
  }

  // AI 回复到达后：有标记就用 AI 的目标，没有就保留备选目标。
  function setGoal(linkCard, goal) {
    var card = JSON.parse(JSON.stringify(linkCard || {}));
    if (card.kind !== 'companion' || !card.data || card.data.goalByAI !== 'pending') return null;
    var clean = String(goal || '').replace(/[\s〔〕\[\]【】]/g, '').slice(0, 12);
    if (clean) card.data.goal = clean.replace(/^一起/, '');
    card.data.goalByAI = clean ? 'ai' : 'fallback';
    return { linkCard: card, text: summaryText(card) };
  }

  function recordOutcome(userId, dreamId, linkCard, status) {
    if (!userId || !dreamId || !linkCard || status !== 'declined') return;
    var now = Date.now();
    var log = readLog(userId, dreamId, now);
    if (linkCard.kind === 'companion') log.companion.decline = now;
    else if(linkCard.kind==='dating_invite')log.dating.declinedInvite=now;
    else if (linkCard.kind === 'pet_adopt') log.adopt.decline = now;
    else if (linkCard.kind === 'game') log.games.decline = now;
    else return;
    writeLog(userId, dreamId, log);
  }

  function applyAction(message, action, result) {
    var old = (message && message.linkCard) || {};
    var card = JSON.parse(JSON.stringify(old));
    if ((card.kind === 'game'||card.kind==='dating_invite') && card.status !== 'pending') return { linkCard: card, text: summaryText(card) };
    var ok = !!(result && result.ok);
    if (card.kind === 'letter' && action === 'open' && ok) card.status = 'done';
    else if (card.kind === 'pet_status' && action === 'care' && ok) card.status = 'done';
    else if (card.kind === 'pet_adopt') {
      if (action === 'accept' && ok) card.status = 'accepted';
      else if (action === 'decline') card.status = 'declined';
    } else if (card.kind === 'companion' || card.kind === 'game'||card.kind==='dating_invite') {
      if (action === 'accept' && ok) card.status = 'accepted';
      else if (action === 'decline') card.status = 'declined';
    }
    if (action === 'later') card.status = 'later';
    card.updatedAt = Date.now();
    return { linkCard: card, text: summaryText(card) };
  }

  // ---------- rendering ----------
  var CSS = '.x-link-card{box-sizing:border-box;min-width:200px;max-width:260px;color:inherit;border:1px solid rgba(127,127,127,.35);border-radius:14px;padding:10px 12px;text-align:left;transition:opacity .2s}' +
    '.x-link-card.is-busy{opacity:.6}' +
    '.x-link-card-voice{font-size:15px;line-height:1.6}' +
    '.x-link-settings-expand{display:inline-block;margin:6px 0 2px;padding:2px 0;border:0;background:transparent;color:inherit;opacity:.7;font:inherit;font-size:13px;text-decoration:underline;text-underline-offset:3px;cursor:pointer}' +
    '.x-link-settings-list{display:flex;flex-direction:column;gap:6px;margin-top:6px}' +
    '.x-link-settings-note{margin:8px 0 0;font-size:12px;opacity:.65;line-height:1.5}' +
    '.x-link-card-head{display:flex;align-items:center;gap:6px}' +
    '.x-link-card-icon{display:inline-flex;flex:none}' +
    '.x-link-card-head strong{flex:1 1 auto;font-size:14px}' +
    '.x-link-card-state{flex:none;font-size:12px;opacity:.7}' +
    '.x-link-card-body{margin-top:8px;font-size:13px;overflow-wrap:anywhere;word-break:break-word}' +
    '.x-link-card[data-status=declined] .x-link-card-body{opacity:.7}' +
    '.x-link-card-row{display:flex;gap:8px;margin-top:3px}' +
    '.x-link-card-row span{flex:none;opacity:.7}' +
    '.x-link-card-row b{font-weight:500;min-width:0}' +
    '.x-link-card-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}' +
    '.x-link-card-actions button{flex:1 1 auto;min-height:34px;border-radius:999px;padding:4px 12px;background:transparent;color:inherit;border:1px solid currentColor;font:inherit;font-size:13px;cursor:pointer}' +
    '.x-link-card-actions button[data-primary="1"]{font-weight:600}' +
    '.x-link-card-actions button:disabled{opacity:.55;cursor:default}';
  var ICONS = {
    letter: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
    pet_status: '<circle cx="6" cy="10" r="2"/><circle cx="10" cy="6" r="2"/><circle cx="14" cy="6" r="2"/><circle cx="18" cy="10" r="2"/><path d="M12 12c-3 0-5 3-5 5 0 2 2 2 5 2s5 0 5-2c0-2-2-5-5-5z"/>',
    companion: '<path d="M9 18V6l10-2v12"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="16" r="2"/>'
  };
  ICONS.pet_adopt = ICONS.pet_status;
  ICONS.game = '<rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8" cy="8" r="1"/><circle cx="16" cy="8" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="8" cy="16" r="1"/><circle cx="16" cy="16" r="1"/>';
  var TITLES = { letter: '给你的信', pet_status: '小宠', pet_adopt: '领养邀请', companion: '陪伴邀请', game: '游戏邀请' };
  var STATE_TEXT = { pending: '等待回应', accepted: '已接受', declined: '已拒绝', later: '改天再说', done: '已完成', failed: '未能开始' };

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function ensureStyle() {
    if (document.getElementById('shexLinkCardsStyle')) return;
    var s = document.createElement('style');
    s.id = 'shexLinkCardsStyle';
    s.textContent = CSS;
    (document.head || document.documentElement).appendChild(s);
  }
  function row(label, value) {
    var r = el('div', 'x-link-card-row');
    r.appendChild(el('span', '', label));
    r.appendChild(el('b', '', value));
    return r;
  }
  function validCard(c) {
    return !!(c && typeof c === 'object' && TITLES[c.kind] && c.data && typeof c.data === 'object');
  }

  function renderContent(contentEl, message, handlers) {
    var c = message && message.linkCard;
    if(c&&String(c.kind).indexOf('dating_')===0&&root.SHEXDatingCards&&root.SHEXDatingCards.renderContent)return root.SHEXDatingCards.renderContent(contentEl,message,handlers);
    if (!contentEl || !validCard(c)) return false;
    handlers = handlers || {};
    ensureStyle();
    while (contentEl.firstChild) contentEl.removeChild(contentEl.firstChild);
    var d = c.data;
    var stale = c.kind === 'letter' && c.status !== 'done' && typeof handlers.isStale === 'function' && !!handlers.isStale(c);
    var simple = c.kind === 'letter' || c.kind === 'pet_status';
    var stateText = STATE_TEXT[c.status] || STATE_TEXT.pending;
    if (simple) stateText = c.status === 'done' ? (c.kind === 'letter' ? '已读' : '去过了') : '';
    if (c.kind === 'letter' && stale) stateText = '已读';

    var card = el('div', 'x-link-card');
    card.setAttribute('data-kind', c.kind);
    card.setAttribute('data-status', c.status || 'pending');
    var head = el('div', 'x-link-card-head');
    var icon = el('span', 'x-link-card-icon');
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + ICONS[c.kind] + '</svg>';
    head.appendChild(icon);
    head.appendChild(el('strong', '', c.kind === 'pet_status' ? String(d.name || TITLES.pet_status) : TITLES[c.kind]));
    head.appendChild(el('span', 'x-link-card-state', stateText));
    card.appendChild(head);

    var body = el('div', 'x-link-card-body');
    var letterEnvelope = c.kind === 'letter' && root.SHEXLetterCard && root.SHEXLetterCard.render(body, d.letterPreview, {
      read: c.status === 'done' || stale,
      onOpen: function () { return typeof handlers.onAction === 'function' ? handlers.onAction('open') : false; }
    });
    if (simple) body.appendChild(el('div', 'x-link-card-voice', voiceLine(c)));
    else if (c.kind === 'pet_adopt') body.appendChild(el('div', '', '要不要一起养一只小宠'));
    else if (c.kind === 'game') {
      body.appendChild(el('div', 'x-link-card-voice', d.game === 'ludo' ? '陪我走一段约会地图？' : '来做几个选择，看看我们有多合拍？'));
      body.appendChild(row('游戏', gameTitle(d)));
    }
    else {
      body.appendChild(row('目标', d.goalByAI === 'pending' ? 'TA在想…' : String(d.goal || '')));
      body.appendChild(row('歌曲', '《' + (d.trackTitle || '') + '》'));
      body.appendChild(row('时长', (d.minutes || '') + '分钟'));
    }
    card.appendChild(body);

    var specs = [];
    var open = simple ? (c.status !== 'done' && !stale) : c.status === 'pending';
    if (open) {
      if (c.kind === 'letter' && !letterEnvelope) specs.push(['去看看', 'open', 1]);
      else if (c.kind === 'letter') { /* The envelope itself opens this exact letter. */ }
      else if (c.kind === 'pet_status') specs.push([PET_BUTTON[d.need] || '去看看它', 'care', 1]);
      else if (c.kind === 'pet_adopt') specs.push(['前往领养', 'accept', 1], ['拒绝', 'decline', 0]);
      else if (c.kind === 'game') specs.push(['参与', 'accept', 1], ['拒绝', 'decline', 0]);
      else {
        var busy = typeof handlers.companionBusy === 'function' && !!handlers.companionBusy();
        specs.push([busy ? '陪伴进行中' : '接受并开始', 'accept', 1, busy], ['拒绝', 'decline', 0]);
      }
    }
    if (specs.length) {
      var acts = el('div', 'x-link-card-actions');
      var btns = [];
      specs.forEach(function (sp) {
        var b = el('button', '', sp[0]);
        b.type = 'button';
        b.setAttribute('data-link-action', sp[1]);
        if (sp[2]) b.setAttribute('data-primary', '1');
        if (sp[3]) b.disabled = true;
        b.addEventListener('click', function (ev) {
          ev.stopPropagation();
          if (b.disabled || card.classList.contains('is-busy')) return;
          var prev = btns.map(function (x) { return x.disabled; });
          function release() {
            card.classList.remove('is-busy');
            btns.forEach(function (x, i) { x.disabled = prev[i]; });
          }
          card.classList.add('is-busy');
          btns.forEach(function (x) { x.disabled = true; });
          var r;
          try { r = typeof handlers.onAction === 'function' ? handlers.onAction(sp[1]) : null; } catch (e) { release(); return; }
          if (r && typeof r.then === 'function') r.then(release, release);
          else release();
        });
        btns.push(b);
        acts.appendChild(b);
      });
      acts.addEventListener('click', function (ev) { ev.stopPropagation(); });
      card.appendChild(acts);
    }
    card.addEventListener('click', function (ev) { ev.stopPropagation(); });
    contentEl.appendChild(card);
    if (c.kind === 'letter' && !letterEnvelope && typeof handlers.prepareLetter === 'function') handlers.prepareLetter(card);
    return true;
  }

  function renderSettings(container, opts) {
    if (!container || !opts) return;
    ensureStyle();
    var userId = opts.userId, dreamId = opts.dreamId;
    function pair(attrName, attrVal, on, disabled, label) {
      var g = el('div', 'x-character-ai-mode-options');
      g.setAttribute('role', 'group');
      g.setAttribute('aria-label', label);
      [['on', '开'], ['off', '关']].forEach(function (o) {
        var b = el('button', (o[0] === 'on') === on ? 'is-active' : '', o[1]);
        b.type = 'button';
        b.setAttribute(attrName, attrName === 'data-link-master' ? o[0] : attrVal);
        if (attrName !== 'data-link-master') b.setAttribute('data-value', o[0]);
        b.setAttribute('aria-pressed', (o[0] === 'on') === on ? 'true' : 'false');
        if (disabled) b.disabled = true;
        g.appendChild(b);
      });
      return g;
    }
    function draw() {
      var s = readSettings(userId, dreamId);
      while (container.firstChild) container.removeChild(container.firstChild);
      var r = el('div', 'x-character-ai-setting-row x-voice-mode-row');
      r.appendChild(el('strong', '', '联动许可'));
      r.appendChild(pair('data-link-master', '', s.on, false, '联动许可'));
      container.appendChild(r);
      var ex = el('button', 'x-link-settings-expand', expandedState ? '收起板块设置' : '展开板块设置');
      ex.type = 'button';
      ex.setAttribute('aria-expanded', expandedState ? 'true' : 'false');
      container.appendChild(ex);
      if (expandedState) {
        var list = el('div', 'x-link-settings-list');
        BOARDS.forEach(function (b) {
          var br = el('div', 'x-character-ai-setting-row x-voice-mode-row');
          br.appendChild(el('strong', '', b.label));
          br.appendChild(pair('data-link-board', b.id, s.boards[b.id], !s.on, b.label));
          list.appendChild(br);
        });
        container.appendChild(list);
      }
      container.appendChild(el('p', 'x-link-settings-note', '梦角会偶尔在聊天中发来相关卡片。'));
    }
    container._shexLinkOpts = opts;
    if (!container.dataset.shexLinkBound) {
      container.dataset.shexLinkBound = '1';
      container.addEventListener('click', function (ev) {
        var o = container._shexLinkOpts;
        var t = ev.target && ev.target.closest ? ev.target.closest('button') : null;
        if (!t || !container.contains(t) || t.disabled) return;
        var s = readSettings(o.userId, o.dreamId);
        if (t.hasAttribute('data-link-master')) s.on = t.getAttribute('data-link-master') === 'on';
        else if (t.hasAttribute('data-link-board')) s.boards[t.getAttribute('data-link-board')] = t.getAttribute('data-value') === 'on';
        else if (t.classList.contains('x-link-settings-expand')) expandedState = !expandedState;
        else return;
        writeSettings(o.userId, o.dreamId, s);
        container._shexRedraw();
      });
    }
    container._shexRedraw = draw;
    draw();
  }

  var api = {
    BOARDS: BOARDS, readSettings: readSettings, writeSettings: writeSettings, maybeCreate: maybeCreate, maybeCreateAsync: maybeCreateAsync,
    applyAction: applyAction, summaryText: summaryText, renderContent: renderContent,
    renderSettings: renderSettings, recordOutcome: recordOutcome, setGoal: setGoal
  };
  root.SHEXLinkCards = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
