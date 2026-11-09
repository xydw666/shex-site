// X小宠信件页：新信只显示“谁 → 谁”，收下 / 丢弃都不生成正文；信件栏里第一次点开才生成（AI 3 点 / 字卡 1 点）。
// 数据全部在云端（shexXLetters 的 petLetter* 接口，单独集合），本页面不在本机保存信件。
(function (root) {
  'use strict';
  const doc = root.document;
  if (!doc) return;
  const TABS = [['all', '全部'], ['me', '我和小宠'], ['ta', 'TA和小宠']];
  const initialState = () => ({ open: false, view: 'list', tab: 'all', offers: [], letters: [], nextCursor: null, reading: null, draft: '', busy: false, notice: '', settings: { userCall: '妈妈', dreamCall: '爸爸' } });
  const state = initialState();
  let generation = 0, scopeKey = '', active = true, pendingWrite = null, lastScope = '';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const api = () => root.SHEXXLettersAPI;
  const panel = () => doc.querySelector('#xPetPanel');
  const sheet = () => doc.querySelector('[data-pet-letters-sheet]');
  const COST = 3; // 小宠信件全部 AI 生成，首次查看 3 点。
  const dateText = time => { const d = new Date(Number(time) || 0); return `${d.getMonth() + 1}月${d.getDate()}日`; };
  // 失败时说清原因，并带上错误码，方便定位（之前一律显示“暂时没打开”，看不出卡在哪）。
  const friendly = error => {
    const code = String(error?.code || ''), text = `${code}${error?.message || ''}`;
    if (/ENERGY/i.test(text) || /能量/.test(text)) return 'X能量不足，暂时打不开这封信';
    if (/SESSION/i.test(code)) return '请先登录';
    if (/PET_NOT_ADOPTED/.test(code)) return '先领养一只小宠吧';
    if (/UNKNOWN_ACTION/.test(code)) return '信件功能还没上线：需要部署最新的 shexXLetters 云函数（UNKNOWN_ACTION）';
    if (/COLLECTION_NOT_EXIST|collection.*not.*exist/i.test(text)) return '云端还没建信件集合 shex_x_pet_letters（DATABASE_COLLECTION_NOT_EXIST）';
    if (/需要更新页面/.test(text)) return '信件功能需要刷新页面后再试';
    if (/PET_LETTER_GENERATION_FAILED|AI_|X_LETTER_/.test(code)) return `正文生成失败，已扣的点记在这封信上，重试不再扣（${code}）`;
    return `信件操作失败，请稍后再试${code ? `（${code}）` : ''}`;
  };

  function context() {
    const identity = root.SHEXPetIdentity?.current?.() || {};
    const pet = root.SHEXPetApp?.snapshot?.();
    if (!identity.userId || !identity.dreamId || !pet?.petName) return null;
    let species = root.SHEXPetApp?.speciesKey?.() || '';
    if (!species) try { species = root.SHEXPetOwnedStorage.createStorage(root.localStorage, root.SHEXPetState).getRoster(identity).active || 'dog'; } catch (_) { species = 'dog'; }
    return { dreamId: identity.dreamId, dreamName: identity.dreamName || 'TA', petName: pet.petName, petSpecies: species };
  }
  function clearScope(key = '') {
    generation++; scopeKey = key; lastScope = ''; pendingWrite = null;
    Object.assign(state, initialState());
    const node = sheet(); if (node) { node.hidden = true; node.innerHTML = ''; }
    const dot = doc.querySelector('[data-pet-letters-dot]'); if (dot) dot.hidden = true;
  }
  function captureScope() {
    const ctx = context(), userId = root.SHEXPetIdentity?.current?.()?.userId;
    const key = ctx && userId ? JSON.stringify([userId, ctx.dreamId, ctx.petSpecies]) : '';
    if (key !== scopeKey) clearScope(key);
    return { generation, key, ctx };
  }
  function current(scope) {
    if (!active) return false;
    const live = captureScope();
    return !!live.key && scope.generation === generation && scope.key === live.key;
  }
  // 房间在身份、梦角、物种更新后立即调用；不能等三秒红点轮询才清除旧资料。
  function setContext() { active = true; captureScope(); }
  function leave() { active = false; clearScope(); }
  // 分类图标：沿用房间里已有的像素头像（我 / TA），中间是小宠的小爪子。
  const PAW = '<svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><ellipse cx="10" cy="13.4" rx="4.2" ry="3.4"/><ellipse cx="4.6" cy="9" rx="1.7" ry="2.1"/><ellipse cx="8" cy="5.4" rx="1.7" ry="2.2"/><ellipse cx="12" cy="5.4" rx="1.7" ry="2.2"/><ellipse cx="15.4" cy="9" rx="1.7" ry="2.1"/></svg>';
  const portrait = who => doc.querySelector(`#xPetPanel [data-pet-person-avatar="${who}"]`)?.innerHTML || '';
  const face = who => `<span class="pet-letters-face">${portrait(who)}</span>`;
  const paw = () => `<span class="pet-letters-paw">${PAW}</span>`;
  const BOOK = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M4 3.5h9.5a2 2 0 0 1 2 2v11H6a2 2 0 0 1-2-2v-11Z"/><path d="M4 14.5a2 2 0 0 1 2-2h9.5M7.5 7h5"/></svg>';
  const tabIcon = key => key === 'diary' ? `<span class="pet-letters-book">${BOOK}</span>` : key === 'all' ? face('me') + paw() + face('dream') : key === 'me' ? face('me') + paw() : face('dream') + paw();
  function inTab(letter) {
    if (state.tab === 'me') return ['pet_to_user', 'user_to_pet'].includes(letter.direction);
    if (state.tab === 'ta') return ['pet_to_dream', 'dream_to_pet'].includes(letter.direction);
    return true;
  }
  const belongsToPet = (letter, scope) => !!letter && (letter.petSpecies || 'dog') === scope.ctx.petSpecies;
  function render() {
    if (active) captureScope();
    const dot = doc.querySelector('[data-pet-letters-dot]'); if (dot) dot.hidden = !active || !state.offers.length;
    const node = sheet(); if (!node) return;
    node.hidden = !active || !state.open;
    if (node.hidden) { node.innerHTML = ''; return; }
    const head = `<div class="pet-letters-head"><button type="button" data-pl="close" aria-label="返回小宠房间">×</button><strong>${esc(context()?.petName || '小宠')}的信件</strong>
      <span class="pet-letters-mode">收取信件 ${COST} 点 X能量</span>
      <button type="button" data-pl="settings" class="pet-letters-top">设置</button>
      <button type="button" data-pl="offers" class="pet-letters-top">新信${state.offers.length ? '<i class="pet-letters-dot"></i>' : ''}</button>
      <button type="button" data-pl="write" class="pet-letters-top">写信</button></div>`;
    let body = '';
    if (state.view === 'offer') {
      const offer = state.offers[0];
      body = offer ? `<div class="pet-letters-offer"><p class="pet-letters-who">${esc(offer.fromName)} → ${esc(offer.toName)}</p><p class="pet-letters-sub">${dateText(offer.createdAt)} · 有一封新信</p>
        <div class="pet-letters-row"><button type="button" data-pl="keep" ${state.busy ? 'disabled' : ''}>收下</button><button type="button" data-pl="discard" ${state.busy ? 'disabled' : ''}>丢弃</button></div>
        <p class="pet-letters-hint">收下后放进信件栏，第一次打开时才会写出正文。</p></div>`
        : '<p class="pet-letters-empty">今天的新信已经处理完啦</p>';
    } else if (state.view === 'settings') {
      body = `<div class="pet-letters-write"><p class="pet-letters-who">小宠的称呼</p><p class="pet-letters-sub">只影响之后新打开的信</p>
        <label class="pet-letters-field">它叫我<input data-pl-call="userCall" maxlength="8" value="${esc(state.settings.userCall)}"></label>
        <label class="pet-letters-field">它叫${esc(context()?.dreamName || 'TA')}<input data-pl-call="dreamCall" maxlength="8" value="${esc(state.settings.dreamCall)}"></label>
        <div class="pet-letters-row"><button type="button" data-pl="save-settings" ${state.busy ? 'disabled' : ''}>保存</button><button type="button" data-pl="back">返回</button></div></div>`;
    } else if (state.view === 'write') {
      body = `<div class="pet-letters-write"><p class="pet-letters-who">我 → ${esc(context()?.petName || '小宠')}</p>
        <textarea data-pl-text maxlength="1200" placeholder="想对它说点什么…">${esc(state.draft || '')}</textarea>
        <div class="pet-letters-row"><button type="button" data-pl="send" ${state.busy ? 'disabled' : ''}>寄出</button><button type="button" data-pl="back">取消</button></div></div>`;
    } else if (state.view === 'read' && state.reading) {
      const r = state.reading;
      body = `<article class="pet-letters-read"><p class="pet-letters-who">${esc(r.fromName)} → ${esc(r.toName)}</p><p class="pet-letters-sub">${dateText(r.createdAt)}</p>
        <div class="pet-letters-paper">${(r.blocks || []).filter(b => b.type === 'text').map(b => `<p>${esc(b.text)}</p>`).join('')}</div>
        <div class="pet-letters-row"><button type="button" data-pl="back">返回信件栏</button></div></article>`;
    } else {
      const rows = state.tab === 'diary' ? [] : state.letters.filter(inTab);
      // 小宠日记：小宠第一人称的每日记录（模板拼句，不扣点），按天倒序。
      const ident = root.SHEXPetIdentity?.current?.(), diary = state.tab === 'diary' && ident ? (root.SHEXPetJournal?.diaryFor?.(ident, context()?.petSpecies) || []) : null;
      body = `<div class="pet-letters-tabs" role="tablist">${TABS.map(([key, label]) => `<button type="button" role="tab" data-pl="tab" data-tab="${key}" aria-selected="${state.tab === key}" aria-label="${label}" title="${label}">${tabIcon(key)}</button>`).join('')}</div>
        <div class="pet-letters-list">${diary ? (diary.length ? diary.map(d => `<div class="pet-letters-paper pet-journal-list"><p class="pet-letters-sub">${Number(d.day.slice(5, 7))}月${Number(d.day.slice(8))}日 · ${esc(d.petName)}的日记</p>${d.lines.map(line => `<p>${esc(line)}</p>`).join('')}</div>`).join('') : '<p class="pet-letters-empty">日记还是空白的，陪它过几天就有啦</p>') : rows.length ? rows.map(l => `<button type="button" class="pet-letters-card" data-pl="read" data-id="${esc(l.letterId)}" ${state.busy ? 'disabled' : ''}>
          <b>${esc(l.fromName)} → ${esc(l.toName)}</b><small>${dateText(l.createdAt)}</small><span>${l.opened ? (esc(l.preview || '') + ((l.preview || '').length >= 40 ? '…' : '') || '已查看，点开阅读') : '未查看'}</span></button>`).join('')
          : '<p class="pet-letters-empty">信件栏还空着</p>'}</div>${!diary && state.nextCursor ? `<div class="pet-letters-row"><button type="button" data-pl="more" ${state.busy ? 'disabled' : ''}>加载更多</button></div>` : ''}`;
    }
    node.innerHTML = head + body + `<p class="pet-letters-notice" role="status" aria-live="polite">${esc(state.notice)}</p>`;
  }
  async function run(work) {
    const scope = captureScope();
    if (!active || !scope.key || state.busy) return;
    state.busy = true; state.notice = ''; render();
    try { await work(scope); } catch (error) { if (current(scope)) state.notice = friendly(error); }
    finally { if (current(scope)) { state.busy = false; render(); } }
  }
  async function call(action, input) {
    const client = api(); if (!client?.[action]) throw new Error('信件功能需要更新页面');
    return client[action](input);
  }
  async function refresh(scope, append = false) {
    if (!current(scope)) return false;
    const cursor = append ? state.nextCursor : null;
    if (append && !cursor) return false;
    if (!append) state.nextCursor = null;
    const result = await call('petLetterInbox', { ...scope.ctx, ...(cursor ? { cursor } : {}) });
    if (!current(scope)) return false;
    const merge = (existing, incoming) => Array.from(new Map([...existing, ...(incoming || [])].map(item => [item.letterId, item])).values());
    const offers = (result.offers || []).filter(letter => belongsToPet(letter, scope));
    const letters = (result.letters || []).filter(letter => belongsToPet(letter, scope));
    state.offers = append ? merge(state.offers, offers) : offers;
    state.letters = append ? merge(state.letters, letters) : letters;
    state.nextCursor = result.nextCursor || null;
    if (result.settings) state.settings = result.settings;
    return true;
  }
  const actions = {
    close: () => { generation++; state.open = false; state.view = 'list'; state.reading = null; state.busy = false; state.notice = ''; render(); },
    offers: () => { state.view = 'offer'; render(); },
    write: () => { state.view = 'write'; render(); },
    settings: () => { state.view = 'settings'; render(); },
    'save-settings': () => {
      const read = key => String(sheet()?.querySelector(`[data-pl-call="${key}"]`)?.value || '').trim();
      const next = { userCall: read('userCall') || '妈妈', dreamCall: read('dreamCall') || '爸爸' };
      return run(async scope => { const result = await call('petLetterSaveSettings', { ...scope.ctx, ...next }); if (!current(scope)) return; state.settings = result.settings || next; state.view = 'list'; state.notice = '称呼已保存'; });
    },
    back: () => { state.view = 'list'; render(); },
    tab: target => { state.tab = target.dataset.tab; render(); },
    more: () => run(scope => refresh(scope, true)),
    keep: () => decide('keep'),
    discard: () => decide('discard'),
    send: () => {
      // 先取走输入内容再进入忙碌状态：run() 会重画页面，之前在重画后才读输入框，读到的永远是空的，信根本没寄出去。
      const text = String(sheet()?.querySelector('[data-pl-text]')?.value || state.draft || '').trim();
      if (!text) { state.notice = '先写点什么吧'; render(); return; }
      if (state.busy) return;
      state.draft = text;
      return run(async scope => {
        // 连接中断不代表没有寄出：同一份正文重试必须沿用原编号，避免重复存信。
        if (!pendingWrite || pendingWrite.text !== text) pendingWrite = { text, requestId: `pet-write-${Date.now()}-${Math.random().toString(36).slice(2, 10)}` };
        const request = pendingWrite;
        await call('petLetterWrite', { ...scope.ctx, ...request });
        if (!current(scope)) return;
        if (pendingWrite === request) pendingWrite = null;
        const edited = String(state.draft).trim() !== request.text;
        if (!edited) { state.draft = ''; state.view = 'list'; state.tab = 'me'; }
        if (!await refresh(scope)) return;
        state.notice = edited ? '寄出啦，新写的草稿已经保留' : '寄出啦，它可能会给你回信';
      });
    },
    read: target => run(async scope => {
      const letter = state.letters.find(l => l.letterId === target.dataset.id);
      if (!letter) return;
      if (!letter.opened) state.notice = `正在展开这封信（收取信件 ${COST} 点 X能量）…`, render();
      const result = await call('petLetterOpen', { ...scope.ctx, letterId: letter.letterId, petContext: root.SHEXPetApp?.letterContext?.() || null });
      if (!current(scope)) return;
      if (result.status === 'generating') { state.notice = '信还在写，稍后再点开看看'; return; }
      if (!belongsToPet(result.letter, scope)) throw Object.assign(new Error('Pet letter does not belong to this pet'), {code:'PET_LETTER_NOT_FOUND'});
      state.reading = result.letter; state.view = 'read'; state.notice = '';
      if (!letter.opened) await refresh(scope);
    })
  };
  function decide(decision) {
    return run(async scope => {
      const offer = state.offers[0]; if (!offer) return;
      await call('petLetterDecide', { ...scope.ctx, letterId: offer.letterId, decision });
      if (!current(scope) || !await refresh(scope)) return;
      state.notice = decision === 'keep' ? '已收下，放进信件栏了' : '已丢弃';
      if (!state.offers.length) state.view = 'list';
    });
  }
  // 输入时随手记下草稿，页面重画（红点刷新等）也不会把正在写的字清掉。
  doc.addEventListener('input', event => {
    if (!active || !event.target?.matches?.('[data-pl-text]')) return;
    captureScope(); state.draft = event.target.value;
    if (pendingWrite && pendingWrite.text !== String(state.draft).trim()) pendingWrite = null;
  });
  doc.addEventListener('click', event => {
    if (!active) return;
    captureScope();
    const toggle = event.target.closest?.('[data-pet-letters-toggle]');
    if (toggle) { state.open = true; state.view = 'list'; render(); run(refresh); return; }
    const target = event.target.closest?.('[data-pl]');
    if (target && sheet()?.contains(target)) actions[target.dataset.pl]?.(target);
  });
  // 进入房间 / 换梦角时刷新一次红点（只拉列表，不生成正文、不扣点）。
  function syncDot() {
    if (!active || !panel() || panel().hidden) return;
    const scope = captureScope();
    if (!scope.key || scope.key === lastScope || state.busy) return;
    lastScope = scope.key; run(refresh);
  }
  // 三个入口始终由房间内定位样式布局，红点仍按原有身份变化刷新。
  root.setInterval?.(syncDot, 3000);
  root.SHEXPetLetters = Object.freeze({ setContext, leave, refresh: () => run(refresh), state: () => { if (active) captureScope(); return { ...state }; } });
}(typeof window !== 'undefined' ? window : globalThis));
