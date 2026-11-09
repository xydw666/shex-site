// X小宠｜家的记录（纯前端，不调 AI、不扣点）
// 1) 爸爸来过：你离开期间（≥1 小时），回来时按离开时长补上梦角来照顾小宠的几次记录，并真实作用到小宠状态上；
//    回家时弹一张卡片，房间里单独一个入口翻看全部记录。
// 2) 小妮的日记：按天汇总家里发生的事，用小宠第一人称模板拼句，在小宠信件页「日记」分类里看。
// 数据存在 shex_pet_journal_v1:账号:梦角:物种 键里，随账号云端快照同步，每只小宠各一份。
(function (root, factory) {
  'use strict';
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SHEXPetJournal = api;
}(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';
  const HOUR = 3600000, AWAY_MIN = HOUR, KEY = 'shex_pet_journal_v1:';
  const bjDay = t => new Date(t + 8 * HOUR).toISOString().slice(0, 10);
  const bjHour = t => new Date(t + 8 * HOUR).getUTCHours();
  const clock = t => new Date(t + 8 * HOUR).toISOString().slice(11, 16);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function seeded(seed) { let x = 2166136261; for (const ch of String(seed)) x = Math.imul(x ^ ch.charCodeAt(0), 16777619); return () => ((x = Math.imul(x ^ (x >>> 15), 2246822507) ^ Math.imul(x ^ (x >>> 13), 3266489909)) >>> 0) / 4294967296; }
  // 离开越久，记的事越多：1～4 小时 2 件，4～10 小时 3～4 件，再久每 6 小时多 1 件，最多 12 件。
  function visitCount(ms, rand = Math.random) { const h = ms / HOUR; return h < 1 ? 0 : h < 4 ? 2 : h < 10 ? 3 + (rand() < 0.5 ? 1 : 0) : Math.min(12, 4 + Math.floor((h - 10) / 6)); }
  // 事件词表：care = 照顾（会真实作用到小宠状态）；mischief = 小宠调皮（不改状态，只记事）。
  const CARE = Object.freeze({ feed: 'feed', treat: 'feed', pet: 'pet', groom: 'pet', play: 'play', outing: 'play', coax: 'sleep', nap_with: null, look: null });
  const MISCHIEF = Object.freeze(['slipper', 'cushion', 'cup', 'hide', 'beg', 'zoomies']);
  const pick = (rand, list) => list[Math.floor(rand() * list.length)];
  function chooseKind(state, at, rand, places) {
    const hour = bjHour(at);
    if (state.isSleeping) return pick(rand, ['nap_with', 'look', 'nap_with']);
    if (rand() < 0.22) return pick(rand, MISCHIEF);
    if (state.satiety < 45) return rand() < 0.75 ? 'feed' : 'treat';
    if ((hour >= 21 || state.energy < 25) && rand() < 0.7) return 'coax';
    if (state.mood < 60 && state.energy >= 25) return places.length && rand() < 0.5 ? 'outing' : 'play';
    return pick(rand, ['pet', 'groom', 'pet', 'treat', places.length ? 'outing' : 'play']);
  }
  // 纯函数：根据离开时长算出梦角在家的几件事，并按时间顺序作用到小宠状态上。
  function simulateAway({ before, now, seed, Actions, State, places = [] }) {
    const from = Number(before?.lastSavedAt) || 0, gap = now - from;
    if (!before || !from || gap < AWAY_MIN) return { visits: [], state: null, awayMs: Math.max(0, gap) };
    const rand = seeded(seed), n = visitCount(gap, rand), stamps = [];
    for (let i = 0; i < n; i++) {
      let at = Math.round(from + gap * (i + 0.15 + rand() * 0.7) / n);
      if (bjHour(at) < 7) at += (7 - bjHour(at)) * HOUR + Math.floor(rand() * 40) * 60000; // 不在半夜来
      if (at > from + 15 * 60000 && at < now - 5 * 60000 && !stamps.some(t => Math.abs(t - at) < 20 * 60000)) stamps.push(at);
    }
    stamps.sort((a, b) => a - b);
    let state = State.sanitize(before, from); const visits = [];
    const growth = {experience:0, satiety:0, mood:0, intimacy:0, energy:0, levelBefore:state.level, levelAfter:state.level};
    for (const at of stamps) {
      state = State.advance(state, at);
      // 同一次离开里，调皮的事不重样，同一种照顾最多两次。
      let kind = chooseKind(state, at, rand, places);
      for (let k = 0; k < 4 && visits.filter(v => v.type === kind).length >= (MISCHIEF.includes(kind) ? 1 : 2); k++) kind = chooseKind(state, at, rand, places);
      const overused = k => visits.filter(v => v.type === k || (CARE[v.type] && CARE[v.type] === CARE[k] && k !== v.type && false)).length >= (MISCHIEF.includes(k) ? 1 : 2);
      if (overused(kind)) kind = ['pet', 'groom', 'play', places.length ? 'outing' : 'treat', ...MISCHIEF].find(k => !overused(k) && (!state.isSleeping || ['nap_with', 'look'].includes(k))) || (state.isSleeping ? 'look' : 'pet');
      const action = CARE[kind];
      if (action) {
        const result = Actions.createActions().perform(action, state, at, {actor:'dream'});
        if (result.ok) {
          growth.experience += result.expGained || 0;
          for (const field of ['satiety','mood','intimacy','energy']) growth[field] += Math.max(0,result.state[field]-state[field]);
          state = result.state;
        }
      }
      visits.push({ id: `v_${at}`, at, type: kind, ...(kind === 'outing' ? { place: pick(rand, places) } : {}), ...(MISCHIEF.includes(kind) ? { variant: Math.floor(rand() * 3) } : {}) });
    }
    growth.levelAfter = state.level;
    for (const field of ['satiety','mood','intimacy','energy']) growth[field] = Math.round(growth[field]*100)/100;
    return { visits, state: visits.length ? State.advance(state, now) : null, awayMs: gap, growth };
  }
  function growthLines(growth) {
    if (!growth) return [];
    const lines=[];
    for (const [field,label] of [['experience','经验'],['satiety','饱食'],['mood','心情'],['intimacy','亲密'],['energy','精力']]) {
      const value=Number(growth[field]);if(Number.isFinite(value)&&value>0)lines.push(label+' +'+value);
    }
    if (growth.levelAfter>growth.levelBefore) lines.push('等级 Lv.'+growth.levelBefore+' → Lv.'+growth.levelAfter);
    return lines;
  }

  // ---------- 存储 ----------
  function legacyKeyFor(identity) { return identity?.userId && identity?.dreamId ? `${KEY}${encodeURIComponent(identity.userId)}:${encodeURIComponent(identity.dreamId)}` : null; }
  function keyFor(identity, sp = species()) { const base = legacyKeyFor(identity); return base ? `${base}:${encodeURIComponent(sp || 'dog')}` : null; }
  const EMPTY = () => ({ v: 1, visits: [], returns: [], days: {}, moments: [] });
  function loadJournal(storage, key) { try { const v = JSON.parse(storage?.getItem(key) || 'null'); return v?.v === 1 ? v : null; } catch (_) { return null; } }
  // 两个独立的32位散列组成固定16字符来源指纹，兼容本次开发中已有的完整来源串。
  function compactSource(value) {
    if (!String(value).startsWith('[')) return value;
    let a = 2166136261, b = 3339675911;
    for (let i = 0; i < value.length; i++) { const c = value.charCodeAt(i); a = Math.imul(a ^ c, 16777619); b = Math.imul(b ^ c, 2246822519); }
    return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
  }
  function* ownedLegacy(legacy, sp) {
    for (const kind of ['visits', 'returns', 'moments']) for (const row of Array.isArray(legacy?.[kind]) ? legacy[kind] : []) {
      let owner = row.species;
      if (!owner && kind === 'returns' && row.from != null) {
        const evidence = new Set((legacy.visits || []).filter(v => v.from === row.from && v.species).map(v => v.species));
        if (evidence.size === 1) owner = [...evidence][0];
      }
      if (owner !== sp) continue;
      const id = compactSource(JSON.stringify([kind, row.id || '', row.at, row.from, row.actor, row.type, owner]));
      yield { kind, id, row: { ...row, species: owner } };
    }
  }
  function readLegacy(identity, storage = root.localStorage, sp = species()) {
    const journal = { ...EMPTY(), ...(loadJournal(storage, keyFor(identity, sp)) || {}) }, legacy = loadJournal(storage, legacyKeyFor(identity));
    // A per-pet key establishes ownership even for early rows without a species.
    // The shared legacy source below still requires explicit ownership evidence.
    for (const kind of ['visits','returns','moments']) journal[kind] = (journal[kind] || []).map(row => row.species ? row : {...row, species:sp});
    if (!legacy) return journal;
    if (!journal.since?.[sp] && legacy.since?.[sp]) journal.since = { ...(journal.since || {}), [sp]: legacy.since[sp] };
    journal.celebrated = [...new Set([...(journal.celebrated || []), ...(legacy.celebrated || []).filter(value => String(value).startsWith(`${sp}:`))])];
    // 原共有本不改写。只提取有归属证据的事件；来源标识随本宠物存档保存，
    // 已合并或已超过保留上限的旧事件不重复导入，云端晚到的旧事件仍可补进来。
    const imported = new Set((journal.legacyImported || []).map(compactSource));
    for (const {kind, id, row} of ownedLegacy(legacy, sp)) {
      if (imported.has(id)) continue;
      imported.add(id); journal[kind].push(row);
      if (kind === 'moments') {
        const bucket = (journal.days[bjDay(row.at)] ||= {})[row.actor] ||= {};
        bucket[row.type] = (bucket[row.type] || 0) + (row.count || 1);
      }
    }
    for (const kind of ['visits', 'returns', 'moments']) journal[kind].sort((a, b) => a.at - b.at);
    journal.legacyImported = [...imported];
    journal.legacyAvailable = journal.legacyAvailable || ['visits', 'returns', 'moments'].some(kind => (legacy[kind] || []).some(row => !row.species)) || !!legacy.unlocked?.length || !!Object.keys(legacy.days || {}).length;
    return journal;
  }
  function dailyStore(identity) { const store = root.SHEXPetJournalStore; return store?.enabled(identity) ? store : null; }
  function read(identity, storage = root.localStorage, sp = species()) {
    const store = dailyStore(identity);
    if (!store) return readLegacy(identity, storage, sp);
    if (!store.ready(identity, sp)) store.prepare(identity, sp, store.needsLegacy?.(identity, sp) === false ? undefined : readLegacy(identity, storage, sp)).catch(() => {});
    return store.read(identity, sp);
  }
  // 记录长期保存：按天的统计不删；时刻记录各保留最近几千条（约一年以上的量），只在超出时丢最早的。
  function write(identity, journal, storage = root.localStorage, sp = species()) {
    const store = dailyStore(identity);
    if (store) { store.write(identity, sp, journal); return; }
    const key = keyFor(identity, sp); if (!key) return;
    const next = { ...journal, v: 1, days: JSON.parse(JSON.stringify(journal.days || {})) };
    const imported = new Set((journal.legacyImported || []).map(compactSource));
    const projections = new Map([...ownedLegacy(loadJournal(storage, legacyKeyFor(identity)), sp)].map(({kind, id, row}) => [`${kind}:${JSON.stringify(row)}`, id]));
    // 未改动的历史行由原共有本保留与同步，不再复制进每只宠物的新键。
    // 只有已与新互动合并的历史行才持久化来源指纹，避免刷新后重复导入。
    for (const [kind, limit] of [['visits', 2000], ['returns', 1000], ['moments', 3000]]) {
      next[kind] = (journal[kind] || []).filter(row => {
        const id = projections.get(`${kind}:${JSON.stringify(row)}`);
        if (!id) return true;
        imported.delete(id);
        if (kind === 'moments') {
          const day = bjDay(row.at), bucket = next.days[day]?.[row.actor];
          if (bucket) {
            bucket[row.type] = Math.max(0, (bucket[row.type] || 0) - (row.count || 1));
            if (!bucket[row.type]) delete bucket[row.type];
            if (!Object.keys(bucket).length) delete next.days[day][row.actor];
            if (!Object.keys(next.days[day]).length) delete next.days[day];
          }
        }
        return false;
      }).slice(-limit);
    }
    next.legacyImported = [...imported];
    delete next.demo;
    try { storage?.setItem(key, JSON.stringify(next)); } catch (_) {}
  }
  function bump(journal, t, actor, type) {
    const day = journal.days[bjDay(t)] ||= {};
    const bucket = day[actor] ||= {};
    bucket[type] = (bucket[type] || 0) + 1;
  }

  // ---------- 文案 ----------
  // 回家卡片 / 爸爸来过：用户视角，一件事一行。
  function visitText(v, D, P) {
    const place = v.place || '楼下';
    return ({
      feed: `${D}给${P}添了粮`, treat: `${D}偷偷给${P}塞了块零食`, pet: `${D}摸了摸${P}的头`, groom: `${D}给${P}梳了梳毛`,
      play: `${D}陪${P}玩了一会儿`, outing: `${D}带${P}去${place}转了一圈`, coax: `${D}把${P}抱回窝里，哄它睡着了`,
      nap_with: `${D}在${P}旁边陪它睡了个午觉`, look: `${D}来看了看睡着的${P}，没吵醒它`,
      slipper: [`${P}咬了${D}的拖鞋，被${D}说了两句`, `${P}叼走${D}一只拖鞋藏起来了，${D}找了半天`, `${P}啃坏了拖鞋边，${D}假装生气`][v.variant || 0],
      cushion: [`${P}把沙发靠垫拖到了地上，${D}捡回去了`, `${P}在靠垫上踩来踩去，被${D}抱开了`, `${P}把靠垫当窝睡了，${D}没舍得赶它`][v.variant || 0],
      cup: [`${P}碰倒了桌上的杯子，${D}收拾完，轻轻敲了下它的脑袋`, `${P}差点把杯子扫下桌，被${D}一把接住`, `${P}对着杯子里的水研究了半天，${D}在旁边笑`][v.variant || 0],
      hide: [`${P}躲在沙发底下不出来，${D}趴在地上哄了好久`, `${P}钻进纸箱，${D}假装找不到它`, `${P}藏在窗帘后面，尾巴露在外面，被${D}发现了`][v.variant || 0],
      beg: [`${P}围着${D}转圈讨吃的，${D}没忍住`, `${P}一直盯着${D}的碗，${D}分了它一口`, `${P}扒着${D}的腿要抱抱，${D}抱了它一会儿`][v.variant || 0],
      zoomies: [`${P}在屋里疯跑了好几圈，${D}追不上`, `${P}突然开始满屋子跑酷，${D}只好让开`, `${P}跑太快撞到门框，${D}赶紧过去看它`][v.variant || 0]
    })[v.type] || `${D}来过`;
  }
  // 小妮的日记：小宠第一人称，每天一篇（这一天里所有事写在同一篇里）。
  function diaryLine(v, D) {
    const place = v.place || '楼下';
    return ({
      feed: `${D}给我添了粮，我吃得很香。`, treat: `${D}偷偷给我塞了块零食，嘘，不能告诉别人。`, pet: `${D}摸了摸我的头，手很暖。`,
      groom: `${D}给我梳了毛，我舒服得眯起了眼睛。`, play: `${D}陪我玩了一会儿，我跑得好开心。`, outing: `${D}带我去${place}转了一圈，外面的味道好多好多。`,
      coax: `我还不想睡，${D}把我抱回窝里，拍着我的背，我就睡着了。`, nap_with: `我睡觉的时候，${D}在旁边陪着我，醒来的时候他还在。`,
      look: `${D}来看过我，那时候我正睡着，没看见他。`,
      slipper: [`我咬了${D}的拖鞋，被说了两句……可是拖鞋真的很好咬。`, `我把${D}的一只拖鞋藏起来了，他找了好久，嘿嘿。`, `拖鞋边被我啃坏了，${D}板着脸，可我知道他没真生气。`][v.variant || 0],
      cushion: [`我把靠垫拖到了地上，${D}又捡回去了。`, `我在靠垫上踩来踩去，被${D}抱开了。`, `靠垫上软软的，我在上面睡着了，${D}没赶我。`][v.variant || 0],
      cup: [`我碰倒了桌上的杯子，${D}收拾完轻轻敲了下我的脑袋。`, `杯子差点被我扫下桌，还好${D}接住了。`, `我盯着杯子里的水看了好久，${D}在旁边笑我。`][v.variant || 0],
      hide: [`我躲在沙发底下不出来，${D}趴在地上哄了我好久。`, `我钻进纸箱里，${D}假装找不到我。`, `我藏在窗帘后面，结果尾巴露出来了，被${D}发现了。`][v.variant || 0],
      beg: [`我围着${D}转圈要吃的，他没忍住，给了我一点。`, `我一直盯着${D}的碗，他分了我一口。`, `我扒着${D}的腿要抱抱，他抱了我好一会儿。`][v.variant || 0],
      zoomies: [`我在屋里疯跑了好几圈，${D}追不上我。`, `我突然好想跑，就满屋子跑酷，${D}只好让开。`, `我跑太快撞到门框了，${D}赶紧过来看我，一点也不疼啦。`][v.variant || 0]
    })[v.type] || `${D}来过。`;
  }
  // 你在的时候：真实发生的照顾 / 出门，按时间写进日记；你和爸爸半小时内做了同一件事，就写成“一起”。
  const PLACE = Object.freeze({ outdoor: '户外', beach: '海边', market: '市集', spring: '春天的园子', summer: '夏天的院子', autumn: '秋天的林子', winter: '下雪的地方' });
  const SCENE_KEYS = ['home', ...Object.keys(PLACE)];
  const partOfDay = t => { const h = bjHour(t); return h < 6 ? '半夜' : h < 11 ? '早上' : h < 14 ? '中午' : h < 18 ? '下午' : '晚上'; };
  function momentLine(m, who) {
    const many = (m.count || 1) > 1;
    if (m.type === 'home') return `${who}带我回家了。`;
    if (PLACE[m.type]) return `${who}带我去了${PLACE[m.type]}，${['我一路都在东闻西闻', '我跑在最前面', '回来的时候我累得走不动了'][(m.at >>> 10) % 3]}。`;
    return ({
      feed: many ? `${who}喂了我好几次，肚子圆滚滚的。` : `${who}喂我吃了饭。`,
      pet: many ? `${who}摸了我好多下，我把肚皮都翻出来了。` : `${who}摸了摸我的头。`,
      play: many ? `${who}陪我玩了好久好久。` : `${who}陪我玩了一会儿。`,
      sleep: `${who}哄我睡觉，我很快就睡着了。`, wake: `${who}把我叫醒了，我还迷迷糊糊的。`
    })[m.type] || '';
  }
  // 你在时的互动：半小时内你和爸爸做了同一件事就合成“一起”。返回 [{at, who, m}]。
  function pairMoments(moments, U, D) {
    const out = [], used = new Set(), list = moments.slice().sort((a, b) => a.at - b.at);
    list.forEach((m, i) => {
      if (used.has(i)) return;
      const partner = list.findIndex((o, j) => j !== i && !used.has(j) && o.type === m.type && o.actor !== m.actor && Math.abs(o.at - m.at) <= 30 * 60000);
      if (partner >= 0) used.add(partner);
      out.push({ at: m.at, m, who: partner >= 0 ? `${U}和${D}一起` : m.actor === 'dream' ? D : U });
    });
    return out;
  }
  // “一起的时光”板块：用户视角，一件事一行。
  function momentText({ m, who }, P) {
    if (m.type === 'home') return `${who}带${P}回家了`;
    if (PLACE[m.type]) return `${who}带${P}去了${PLACE[m.type]}`;
    const many = (m.count || 1) > 1;
    return ({ feed: many ? `${who}喂了${P}好几次` : `${who}喂${P}吃了饭`, pet: many ? `${who}摸了${P}好多下` : `${who}摸了摸${P}`,
      play: many ? `${who}陪${P}玩了好久` : `${who}陪${P}玩了一会儿`, sleep: `${who}哄${P}睡觉`, wake: `${who}把${P}叫醒了` })[m.type] || '';
  }
  function presentLines(moments, U, D) {
    const lines = [], used = new Set(), list = moments.slice().sort((a, b) => a.at - b.at);
    let lastPart = '';
    list.forEach((m, i) => {
      if (used.has(i)) return;
      const partner = list.findIndex((o, j) => j !== i && !used.has(j) && o.type === m.type && o.actor !== m.actor && Math.abs(o.at - m.at) <= 30 * 60000);
      if (partner >= 0) used.add(partner);
      const who = partner >= 0 ? `${U}和${D}一起` : m.actor === 'dream' ? D : U;
      const line = momentLine(m, who); if (!line) return;
      const part = partOfDay(m.at);
      lines.push((part !== lastPart ? `${part}，` : '') + line); lastPart = part;
    });
    return lines;
  }
  function diary(journal, { petName = '小宠', userCall = '妈妈', dreamCall = '爸爸' } = {}) {
    const moments = journal.moments || [];
    const days = new Set([...moments.map(m => bjDay(m.at)), ...journal.visits.map(v => bjDay(v.at)), ...journal.returns.map(r => bjDay(r.at))]);
    return [...days].sort().reverse().map(day => {
      // 按时间顺序穿插：你在时的互动、你不在时爸爸做的事、你回家。
      const events = journal.visits.filter(v => bjDay(v.at) === day).sort((a, b) => a.at - b.at);
      const items = [...moments.filter(m => bjDay(m.at) === day).map(m => ({ at: m.at, m })),
        ...(events.length ? [{ at: events[0].at, away: events }] : []),
        ...journal.returns.filter(x => bjDay(x.at) === day).map(r => ({ at: r.at, r }))].sort((a, b) => a.at - b.at);
      const lines = []; let run = [];
      const flush = () => { if (run.length) lines.push(...presentLines(run, userCall, dreamCall)); run = []; };
      for (const item of items) {
        if (item.m) { run.push(item.m); continue; }
        flush();
        if (item.away) { for (const v of item.away) lines.push(`${partOfDay(v.at)}，${diaryLine(v, dreamCall)}`); }
        else { lines.push(`${clock(item.r.at)}，${userCall}回来了，我赶紧跑到门口迎接。`); }
      }
      flush();
      if (!lines.length) lines.push('今天家里很安静，我自己在窝里待了一会儿。');
      return { day, lines, petName, demo: journal.demo === true };
    });
  }
  const awayText = ms => { const h = Math.max(1, Math.round(ms / HOUR)); return h > 48 ? `${Math.round(h / 24)} 天` : `${h} 小时`; };

  const withDemo = journal => journal; // 示例数据已删除

  // ---------- 页面 ----------
  const doc = root.document;
  const calls = () => ({ userCall: '妈妈', dreamCall: '爸爸', ...(root.SHEXPetLetters?.state?.().settings || {}) });
  const panel = () => doc?.querySelector('#xPetPanel');
  const sheet = () => doc?.querySelector('[data-pet-journal-sheet]');
  let current = null, card = null, open = false, tab = 'away', unlocking = false, notice = '', pageIndex = 0;
  // 展开状态只属于本次查看，不与付费记录混用，也不写入云存档。
  const expandedDays = new Set();
  const expansionKey = (ident, day) => `${keyFor(ident)}:${day}`;
  let contextKey = null, contextActive = true, scope = 0;
  const pendingUI = new Set();
  const contextFor = (ident, sp) => keyFor(ident, sp || 'dog');
  function resetView() {
    scope++;
    for (const timer of pendingUI) root.clearTimeout?.(timer);
    pendingUI.clear(); expandedDays.clear();
    current = null; card = null; open = false; renaming = false; unlocking = false; notice = ''; pageIndex = 0;
    const node = sheet(); if (node) { node.hidden = true; node.innerHTML = ''; }
  }
  // 宿主统一在切换账号、梦角、宠物时调用；不注册第二套切换监听。
  function setContext(identity, sp) {
    const next = contextFor(identity, sp);
    if (!contextActive || next !== contextKey) resetView();
    contextKey = next; contextActive = !!next; current = identity || null;
    if (next && dailyStore(identity)) read(identity, root.localStorage, sp || 'dog');
  }
  function leave() { resetView(); contextActive = false; contextKey = null; }
  function liveContext() {
    return contextFor(root.SHEXPetIdentity?.current?.(), species());
  }
  function sameScope(token) { return contextActive && token === scope && (!doc || liveContext() === contextKey); }
  function syncContext() {
    if (!contextActive) return false;
    const ident = root.SHEXPetIdentity?.current?.();
    const sp = species();
    if (contextFor(ident, sp) !== contextKey) setContext(ident, sp);
    return contextActive;
  }
  function laterUI(fn, delay) {
    const token = scope;
    const timer = root.setTimeout?.(() => { pendingUI.delete(timer); if (sameScope(token)) fn(); }, delay);
    if (timer != null) pendingUI.add(timer);
  }
  function petName() { return root.SHEXPetApp?.snapshot?.()?.petName || '小宠'; }
  function render() {
    const node = sheet(); if (!node) return;
    if (!syncContext()) { node.hidden = true; node.innerHTML = ''; return; }
    const growth=card?.growth;
    const hasGrowth=!!growth&&Number.isFinite(growth.experience)&&growth.experience>0;
    if(hasGrowth)node.dataset.petGrowthPopup='true';else delete node.dataset.petGrowthPopup;
    node.hidden = !(open || card); if (node.hidden) return;
    current = root.SHEXPetIdentity?.current?.() || null;
    const { userCall, dreamCall } = calls(), name = petName();
    if (renaming) {
      const ident = root.SHEXPetIdentity?.current?.(), journal = ident ? read(ident) : {};
      node.innerHTML = `<div class="pet-letters-head"><button type="button" data-pj="close" aria-label="返回">×</button><strong>门牌</strong></div>
        <div class="pet-letters-write"><p class="pet-letters-sub">给你们的家起个名字，留空就用默认的</p>
        <label class="pet-letters-field">门牌<input data-pj-home maxlength="16" value="${esc(journal.homeName || '')}" placeholder="${esc(`${name}和${dreamCall}${userCall}的家`)}"></label>
        <div class="pet-letters-row"><button type="button" data-pj="save-home">保存</button></div></div>`;
      return;
    }
    if (card?.celebrate) {
      node.innerHTML = `<div class="pet-letters-head"><strong>第 ${card.celebrate} 天</strong></div><div class="pet-letters-offer">
        <p class="pet-letters-who">今天是我们在一起的第 ${card.celebrate} 天！</p><p class="pet-letters-sub">谢谢${esc(userCall)}和${esc(dreamCall)}一直陪着我。—— ${esc(card.name)}</p>
        <div class="pet-letters-row"><button type="button" data-pj="close">好呀</button></div></div>`;
      return;
    }
    if (card) {
      if(hasGrowth){
        const leveledUp=Number.isInteger(growth.levelBefore)&&Number.isInteger(growth.levelAfter)&&growth.levelAfter>growth.levelBefore;
        const attributes=growthLines(growth).filter(line=>!line.startsWith('经验 ')&&!line.startsWith('等级 '));
        node.innerHTML=`<div class="pet-letters-head"><strong>代养小结</strong></div>
          <div class="pet-letters-offer" data-pet-growth-report><p class="pet-letters-who">你不在的时候，${esc(dreamCall)}照顾了${esc(name)}。</p>
          <p class="pet-growth-experience" data-pet-growth-experience>经验 +${esc(growth.experience)}</p>
          ${leveledUp?`<p class="pet-growth-level">升级了：Lv.${growth.levelBefore} → Lv.${growth.levelAfter}</p>`:''}
          ${attributes.length?`<p class="pet-letters-sub">${esc(attributes.join(' · '))}</p>`:''}
          <div class="pet-letters-row"><button type="button" data-pj="close">知道了</button></div></div>`;
        return;
      }
      node.innerHTML = `<div class="pet-letters-head"><strong>欢迎回家，${esc(userCall)}！</strong></div>
        <div class="pet-letters-offer"><p class="pet-letters-who">${esc(name)}在门口等你</p><p class="pet-letters-sub">你离开了 ${awayText(card.awayMs)}</p>
        ${card.visits.length ? `<div class="pet-letters-paper pet-journal-list">${card.visits.map(v => `<p><b>${clock(v.at)}</b> ${esc(visitText(v, dreamCall, name))}</p>`).join('')}</div>` : `<p class="pet-letters-sub">这段时间${esc(dreamCall)}没来过</p>`}
        <div class="pet-letters-row"><button type="button" data-pj="close">知道了</button></div></div>`;
      return;
    }
    const full = withDemo(current ? read(current) : { v: 1, visits: [], returns: [], days: {}, moments: [] });
    const store = current && dailyStore(current), remoteView = store?.view(current, species());
    const dates = [...new Set(['visits','returns','moments'].flatMap(kind => (full[kind] || []).map(row => bjDay(row.at))))].sort().reverse();
    const selected = new Set(dates.slice(store ? 0 : pageIndex * 20, store ? 20 : (pageIndex + 1) * 20));
    const journal = {...full, ...Object.fromEntries(['visits','returns','moments'].map(kind => [kind, (full[kind] || []).filter(row => selected.has(bjDay(row.at)))]))};
    const hasOlder = store ? remoteView?.hasMore : dates.length > (pageIndex + 1) * 20;
    const dayLabel = day => `${Number(day.slice(5, 7))}月${Number(day.slice(8))}日`;
    // 分类图标：你不在时 = TA 头像 + 爪子；一起的时光 = 我 + 爪子 + TA；小宠日记 = 爪子 + 小本子。头像沿用房间里的像素头像。
    const PAW = '<svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><ellipse cx="10" cy="13.4" rx="4.2" ry="3.4"/><ellipse cx="4.6" cy="9" rx="1.7" ry="2.1"/><ellipse cx="8" cy="5.4" rx="1.7" ry="2.2"/><ellipse cx="12" cy="5.4" rx="1.7" ry="2.2"/><ellipse cx="15.4" cy="9" rx="1.7" ry="2.1"/></svg>';
    const BOOK = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M4 3.5h9.5a2 2 0 0 1 2 2v11H6a2 2 0 0 1-2-2v-11Z"/><path d="M4 14.5a2 2 0 0 1 2-2h9.5M7.5 7h5"/></svg>';
    const face = who => `<span class="pet-letters-face">${doc.querySelector(`#xPetPanel [data-pet-person-avatar="${who}"]`)?.innerHTML || ''}</span>`;
    const paw = `<span class="pet-letters-paw">${PAW}</span>`, book = `<span class="pet-letters-book">${BOOK}</span>`;
    const tabs = [['away', '你不在时', face('dream') + paw], ['together', '一起的时光', face('me') + paw + face('dream')], ['diary', `${name}的日记`, paw + book]];
    const timeline = rows => { // rows: [{at, text}] → 按天分组、新的在上
      const groups = {}; for (const r of rows.slice().sort((a, b) => b.at - a.at)) (groups[bjDay(r.at)] ||= []).push(r);
      return Object.entries(groups).map(([day, list]) => `<div class="pet-letters-paper pet-journal-list"><p class="pet-letters-sub">${dayLabel(day)}</p>${list.slice().reverse().map(r => `<p><b>${clock(r.at)}</b> ${esc(r.text)}</p>`).join('')}</div>`).join('');
    };
    let body = '';
    if (tab === 'away') {
      body = journal.visits.length ? timeline(journal.visits.map(v => ({ at: v.at, text: visitText(v, dreamCall, name) })))
        : `<p class="pet-letters-empty">还没有记录。你离开一阵子再回来，就能看到${esc(dreamCall)}做了什么。</p>`;
    } else if (tab === 'together') {
      const rows = pairMoments(journal.moments || [], userCall, dreamCall).map(x => ({ at: x.at, text: momentText(x, name) })).filter(r => r.text);
      body = rows.length ? timeline(rows) : `<p class="pet-letters-empty">你们陪${esc(name)}做的事会记在这里。</p>`;
    } else {
      const pages = diary(journal, { petName: name, userCall, dreamCall });
      // 未展开不输出正文；购买记录永久保存，展开/收起只改变本次查看。
      const unlocked = new Set(journal.unlocked || []);
      body = pages.length ? pages.map(d => { const paid = unlocked.has(d.day), openDay = paid && expandedDays.has(expansionKey(current, d.day)); return `<div class="pet-letters-paper pet-journal-list pet-diary${openDay ? ' is-open' : ''}"><p class="pet-letters-sub">${esc(d.petName)}的日记 · ${dayLabel(d.day)}</p>
        ${openDay ? `<div class="pet-diary-body" id="pet-diary-${d.day}">${d.lines.map(line => `<p>${esc(line)}</p>`).join('')}</div>` : ''}
        <button type="button" class="pet-diary-more" data-pj="${openDay ? 'collapse' : 'unlock'}" data-day="${d.day}" aria-expanded="${openDay}" ${openDay ? `aria-controls="pet-diary-${d.day}"` : ''} ${unlocking ? 'disabled' : ''}>${openDay ? '收起' : paid ? '展开日记' : '1 X能量偷看'}</button></div>`; }).join('') + (notice ? `<p class="pet-letters-notice">${esc(notice)}</p>` : '')
        : `<p class="pet-letters-empty">日记还是空白的，陪它过几天就有啦</p>`;
    }
    node.innerHTML = `<div class="pet-letters-head"><button type="button" data-pj="close" aria-label="返回小宠房间">×</button><strong>家的记录</strong></div>
      <div class="pet-letters-tabs" role="tablist">${tabs.map(([key, label, icon]) => `<button type="button" role="tab" data-pj="tab" data-tab="${key}" aria-selected="${tab === key}" aria-label="${esc(label)}" title="${esc(label)}">${icon}</button>`).join('')}</div>
      <div class="pet-letters-list">${body}${journal.legacyAvailable ? '<p class="pet-letters-sub">旧版共有记录已保留，未注明小宠的内容不会分配到当前日记。</p>' : ''}</div>
      <div class="pet-letters-row">${pageIndex ? '<button type="button" data-pj="recent">最近记录</button>' : ''}${hasOlder ? `<button type="button" data-pj="older" ${remoteView?.loading ? 'disabled' : ''}>更早记录</button>` : ''}</div>
      ${remoteView?.loading ? '<p class="pet-letters-sub">正在读取记录…</p>' : ''}${remoteView?.error ? '<p class="pet-letters-notice">历史记录暂未同步，可稍后再试；本机照顾记录仍保留。</p>' : ''}`;
  }
  doc?.addEventListener('click', event => {
    if (!syncContext()) return;
    if (event.target.closest?.('[data-pet-visits-toggle]')) { expandedDays.clear(); notice = ''; open = true; card = null; render(); return; }
    const t = event.target.closest?.('[data-pj]'); if (!t || !sheet()?.contains(t)) return;
    if (t.dataset.pj === 'close') { resetView(); }
    if (t.dataset.pj === 'tab') { tab = t.dataset.tab; notice = ''; render(); }
    if (t.dataset.pj === 'unlock') unlockDay(t.dataset.day);
    if (t.dataset.pj === 'collapse') { expandedDays.delete(expansionKey(root.SHEXPetIdentity?.current?.(), t.dataset.day)); render(); }
    if (t.dataset.pj === 'older' || t.dataset.pj === 'recent') changePage(t.dataset.pj);
  });
  async function changePage(direction) {
    const ident = root.SHEXPetIdentity?.current?.(), sp = species(), token = scope, store = dailyStore(ident);
    if (store?.view(ident, sp)?.loading) return;
    try {
      if (store) await store[direction === 'older' ? 'more' : 'first'](ident, sp);
      if (!sameScope(token)) return;
      pageIndex = direction === 'older' ? pageIndex + 1 : 0;
      expandedDays.clear(); render();
    } catch (_) { if (sameScope(token)) { notice = '历史记录暂时没有读到，请稍后再试'; render(); } }
  }
  doc?.addEventListener('shex:pet-journal-updated', event => {
    const detail = event.detail;
    if (!contextActive || !detail || contextFor(detail.identity || detail, detail.species) !== contextKey) return;
    if (open || card) render();
  });

  // 展开某一天的日记：只在第一次展开时扣 1 点（扣费请求号按 梦角+小宠+日期 固定）。
  async function unlockDay(day) {
    const ident = root.SHEXPetIdentity?.current?.(); if (!ident?.userId || !ident?.dreamId || unlocking || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return;
    const sp = species(), saved = read(ident, root.localStorage, sp);
    if (!diary(saved).some(page => page.day === day)) return;
    if ((saved.unlocked || []).includes(day)) { expandedDays.add(expansionKey(ident, day)); render(); return; }
    const token = scope;
    unlocking = true; notice = ''; render();
    try {
      if (typeof root.SHEXAuth?.consumeEnergy !== 'function') throw new Error('请先登录');
      await root.SHEXAuth.consumeEnergy(1, 'x_pet_diary', `xpetdiary_${ident.dreamId}_${sp}_${day}`.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 200));
      const journal = read(ident, root.localStorage, sp); journal.unlocked = [...new Set([...(journal.unlocked || []), day])]; write(ident, journal, root.localStorage, sp);
      if (open && sameScope(token)) expandedDays.add(expansionKey(ident, day));
    } catch (error) { if (open && sameScope(token)) notice = /能量|ENERGY/i.test(`${error?.message || ''}${error?.code || ''}`) ? 'X能量不足，暂时打不开这一天' : (error?.message || '展开失败，请稍后再试'); }
    finally { if (sameScope(token)) { unlocking = false; render(); } }
  }
  // pet-app 在载入小宠存档时调用：补上离开期间的来访，返回新的小宠状态（没有来访则为 null）。
  function arrive({ identity, species, before, now, Actions, State, places = [] }) {
    if (!identity?.userId || !identity?.dreamId || !before) return null;
    const sp = species || 'dog';
    const journal = read(identity, root.localStorage, sp);
    for (const r of journal.returns) {
      if (r.species) continue;
      // 新补算已有独立回家记录时，其来访不能反推未知旧记录的物种。
      if (journal.returns.some(other => other.from === r.from && other.species)) continue;
      const evidence = new Set(journal.visits.filter(v => v.from === r.from && v.species).map(v => v.species));
      if (evidence.size === 1) r.species = [...evidence][0];
    }
    if (journal.returns.some(r => {
      if (r.from !== before.lastSavedAt) return false;
      // 旧记录没有物种时只接受明确证据，不能拿它拦截所有宠物。
      return r.species === sp;
    })) return null;
    const result = simulateAway({ before, now, seed: `${identity.userId}:${identity.dreamId}:${sp}:${before.lastSavedAt}`, Actions, State, places });
    if (result.awayMs < AWAY_MIN) return null;
    setContext(identity, sp);
    current = identity;
    const visits = result.visits.map(v => ({ ...v, species: sp, from: before.lastSavedAt }));
    journal.visits.push(...visits);
    journal.returns.push({ at: now, species: sp, from: before.lastSavedAt, awayMs: result.awayMs, visits: visits.length, growth:result.growth });
    write(identity, journal, root.localStorage, sp);
    card = { awayMs: result.awayMs, visits, growth:result.growth };
    laterUI(render, 600);
    return result.state;
  }
  // pet-app 每次产生照顾事件时调用：按天记下是谁、做了什么（日记用）。
  function record(identity, events, sp = species()) {
    if (!identity?.userId || !Array.isArray(events) || !events.length) return;
    current = identity;
    const journal = read(identity, root.localStorage, sp);
    for (const e of events) {
      if (!['user', 'dream'].includes(e.actor) || !['feed', 'pet', 'play', 'sleep', 'wake', ...SCENE_KEYS].includes(e.type)) continue;
      const t = e.timestamp || Date.now();
      bump(journal, t, e.actor, e.type);
      // 同一人连续做同一件事（20 分钟内）合并成一条，避免日记被刷屏。
      const last = journal.moments.at(-1);
      if (last && last.actor === e.actor && last.type === e.type && bjDay(last.at) === bjDay(t) && t - last.at >= 0 && t - last.at <= 20 * 60000) { last.count = (last.count || 1) + 1; last.at = t; }
      else journal.moments.push({ id: root.crypto?.randomUUID?.() || `m_${t}_${Math.random().toString(36).slice(2)}`, at: t, actor: e.actor, type: e.type, species: sp });
    }
    write(identity, journal, root.localStorage, sp);
  }
  function diaryFor(identity, sp = species()) { return diary(withDemo(read(identity, root.localStorage, sp)), { petName: petName(), ...calls() }); }
  // ---------- 门牌 + 在一起的第 N 天 ----------
  // 房间顶上挂一块小门牌：“小妮和爸爸妈妈的家”（点一下可以改名）+ “在一起的第 N 天”；第 7/30/100/365… 天冒一次小庆祝。
  const MILESTONES = [7, 30, 100, 200, 365, 520, 1000];
  function species() {
    try { const active = root.SHEXPetApp?.speciesKey?.(); if (active) return active; } catch (_) {}
    try { const saved = root.SHEXPetApp?.snapshot?.()?.species; if (saved) return saved; } catch (_) {}
    try { return root.SHEXPetOwnedStorage.createStorage(root.localStorage, root.SHEXPetState).getRoster(root.SHEXPetIdentity.current()).active || 'dog'; } catch (_) { return 'dog'; }
  }
  function daysTogether(journal, sp, now = Date.now()) {
    const since = journal.since?.[sp]; if (!since) return 1;
    return Math.floor((Date.parse(`${bjDay(now)}T00:00:00+08:00`) - Date.parse(`${bjDay(since)}T00:00:00+08:00`)) / 86400000) + 1;
  }
  let renaming = false;
  function plate() {
    if (!syncContext()) return;
    const room = panel()?.querySelector('.pet-room'), ident = root.SHEXPetIdentity?.current?.(), pet = root.SHEXPetApp?.snapshot?.();
    let node = room?.querySelector('[data-pet-home-plate]');
    if (!room || !ident?.userId || !ident?.dreamId || !pet?.petName) { if (node) node.hidden = true; return; }
    if (!node) { node = doc.createElement('button'); node.type = 'button'; node.className = 'pet-home-plate'; node.dataset.petHomePlate = ''; room.appendChild(node); }
    const journal = read(ident), sp = species(), { userCall, dreamCall } = calls();
    let changed = false;
    if (!journal.since?.[sp]) { journal.since = { ...(journal.since || {}), [sp]: Date.now() }; changed = true; }
    const n = daysTogether(journal, sp), home = journal.homeName || `${pet.petName}和${dreamCall}${userCall}的家`;
    const hit = MILESTONES.find(m => m === n), key = `${sp}:${n}`;
    if (hit && !(journal.celebrated || []).includes(key)) {
      journal.celebrated = [...(journal.celebrated || []), key].slice(-50); changed = true;
      laterUI(() => { card = { celebrate: n, name: pet.petName }; render(); }, 1200);
    }
    if (changed) write(ident, journal);
    node.hidden = false;
    node.setAttribute('aria-label', `${home}，在一起的第 ${n} 天，点一下改门牌`);
    node.innerHTML = `<b>${esc(home)}</b><small>在一起的第 ${n} 天</small>`;
  }
  doc?.addEventListener('click', event => {
    if (!syncContext()) return;
    if (event.target.closest?.('[data-pet-home-plate]')) { renaming = true; card = null; open = true; render(); }
    const t = event.target.closest?.('[data-pj="save-home"]');
    if (t) {
      const ident = root.SHEXPetIdentity?.current?.(), value = String(sheet()?.querySelector('[data-pj-home]')?.value || '').replace(/\p{Cc}/gu, '').trim().slice(0, 16);
      if (ident) { const journal = read(ident); journal.homeName = value; write(ident, journal); }
      renaming = false; open = false; render(); plate();
    }
  });
  if (doc) { root.setInterval?.(plate, 3000); root.setTimeout?.(plate, 800); }

  return { simulateAway, growthLines, diary, read, write, keyFor, arrive, record, diaryFor, visitCount, visitText, withDemo, daysTogether, setContext, leave };
}));
