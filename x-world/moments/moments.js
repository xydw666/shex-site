// SHE.X X世界 · 朋友圈（独立前端小 APP，向所有登录用户开放）。
// 不改主程序：自己往 X世界 APP 网格补入口按钮、document 级事件委托、setInterval 补按钮、自己 append 全屏 overlay。
// 后端合同见 docs/moments/朋友圈-接口合同-v1.md。
(function initSHEXMoments(global) {
  'use strict';
  const doc = global.document;
  const momentsSource = doc.currentScript && doc.currentScript.src;
  let datingController = null, datingModule = null;
  async function dating() {
    if (!global.SHEXMomentsDating) {
      if (!datingModule) datingModule = new Promise((resolve, reject) => {
        const script = doc.createElement('script'); script.src = new URL('./dating-media.js', momentsSource).href;
        const css = doc.createElement('link'); css.rel = 'stylesheet'; css.href = new URL('./dating-media.css', momentsSource).href; doc.head.appendChild(css);
        script.onload = resolve; script.onerror = () => { datingModule = null; script.remove(); reject(mkErr('MEDIA_UNAVAILABLE', '约会相册暂时无法打开')); }; doc.head.appendChild(script);
      });
      await datingModule;
    }
    if (!datingController) datingController = global.SHEXMomentsDating.createController({ call, currentUser: () => session().userId, isLive: () => !!root });
    return datingController;
  }
  function mountDating() {
    if (!listEl || !state.posts.some(p => p.datingMedia && p.status === 'published')) return;
    const host = listEl, g = gen;
    void dating().then(controller => { if (g === gen && host === listEl) controller.mount(host, state.posts); }).catch(() => {});
  }
  function datingMarkup(p) {
    if (!p.datingMedia || p.status !== 'published') return '';
    if (global.SHEXMomentsDating) return global.SHEXMomentsDating.markup(p);
    return `<div class="xmd-attachment" data-mom-dating="${esc(p.postId)}"><div class="xmd-photo-placeholder" role="status">正在读取照片…</div></div>`;
  }
  const ENTRY_HTML = '<button class="x-world-action-tile" id="showMoments" data-moments-entry type="button"><span class="x-world-action-badge" data-moments-badge hidden aria-label="有新动态"></span><span class="x-world-action-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m14.31 8 5.74 9.94"/><path d="M9.69 8h11.48"/><path d="m7.38 12 5.74-9.94"/><path d="M9.69 16 3.95 6.06"/><path d="M14.31 16H2.83"/><path d="m16.62 12-5.74 9.94"/></svg></span><span>朋友圈</span></button>';
  const ICON = {
    back: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
    camera: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l1.6-2.2h6.8L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.6"/></svg>',
    more: '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>',
    dots: '<svg viewBox="0 0 16 8" width="16" height="8" fill="currentColor" aria-hidden="true"><circle cx="4" cy="4" r="1.6"/><circle cx="12" cy="4" r="1.6"/></svg>',
    heart: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-9.2-9.3C1.6 7.8 3.7 4.5 7 4.5c2 0 3.5 1.2 5 3 1.5-1.8 3-3 5-3 3.3 0 5.4 3.3 4.2 6.7-1.7 4.7-9.2 9.3-9.2 9.3z"/></svg>',
    bubble: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h16v11H10l-4 3.5V16H4z"/></svg>',
    plus: '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>'
  };
  const COLORS = ['#8fa3c7', '#c79f8f', '#8fc7a8', '#d8a08a', '#c9a67a', '#d6c47a'];

  // ---------- 小工具 ----------
  const escapeHtml = value => String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const esc = escapeHtml;
  const session = () => global.SHEXAuth?.current?.() || {};
  const hasAccess = () => Boolean(session().userId);
  const len = text => Array.from(String(text || '')).length;
  const rid = () => { try { if (global.crypto?.randomUUID) return global.crypto.randomUUID(); } catch (_) { /* 退回随机串 */ } return `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`; };
  const hash = text => { let h = 0; for (const ch of String(text || '')) h = (h * 31 + ch.codePointAt(0)) >>> 0; return h; };
  const toMs = value => (typeof value === 'number' ? value : (Date.parse(value) || 0));
  const safeUrl = url => (/^(https?:\/\/|data:image\/|blob:|\.{0,2}\/[^/])/i.test(String(url || '').trim()) ? String(url).trim() : '');
  const mkErr = (code, message) => { const e = new Error(message || '操作失败，请重试'); e.code = code || 'ERROR'; return e; };
  const errText = e => (e && (e.code === 'SESSION_EXPIRED' || e.code === 'AUTH_REQUIRED') ? '登录状态失效，请重新登录' : (e && e.message) || '操作失败，请重试');

  // ---------- 后端 ----------
  async function defaultApi(action, payload) {
    const client = global.SHEXCloudBaseClient, auth = session();
    if (!client?.run) throw mkErr('NETWORK', '网络暂时不可用，请稍后重试');
    const res = await client.run(({ app }) => app.callFunction({ name: 'shexMoments', data: { action, userId: auth.userId, sessionToken: auth.sessionToken, ...payload } }), { retryAuthOnce: false });
    return res && res.result ? res.result : res;
  }
  let api = defaultApi;
  async function call(action, payload) {
    const r = await api(action, payload || {});
    if (!r || r.ok === false) throw mkErr(r && r.code, r && r.message);
    return r;
  }

  // ---------- 入口按钮 + 红点 ----------
  let unread = 0, lastStatusAt = 0, statusBusy = false, statusFlight = null, preparedCatchup = null;
  function applyBadge() { doc.querySelectorAll('[data-moments-badge]').forEach(b => { b.hidden = !(unread > 0); }); }
  function syncEntry() {
    const home = doc.getElementById('xWorldHome'); if (!home) return;
    const page = home.querySelector('[data-world-app-page="1"]') || Array.from(home.querySelectorAll('.x-world-app-page')).pop();
    if (!page) return;
    const existing = Array.from(doc.querySelectorAll('[data-moments-entry]'));
    if (existing.length === 1 && home.contains(existing[0])) return;
    existing.forEach(n => n.remove());
    const holder = doc.createElement('div'); holder.innerHTML = ENTRY_HTML;
    page.appendChild(holder.firstElementChild); applyBadge();
  }
  async function pollStatus() {
    if (!hasAccess() || root || statusBusy || catchupFlight) return;
    const entry = doc.querySelector('[data-moments-entry]');
    if (!entry || !entry.getClientRects().length) return;
    const now = Date.now(); if (now - lastStatusAt < 120000) return;
    lastStatusAt = now; statusBusy = true;
    const owner = String(session().userId || '');
    try {
      statusFlight = call('moments.status', { backgroundCatchup: true, ...(preparedCatchup ? {reuseCatchupPlan:preparedCatchup} : {}) });
      const r = await statusFlight;
      if (owner === String(session().userId || '') && hasAccess()) preparedCatchup = r.catchupPlan || null;
      if (owner !== String(session().userId || '') || !hasAccess() || root) return;
      unread = Math.max(0, Number(r.unread) || 0); applyBadge();
    } catch (_) { /* 红点失败不打扰 */ } finally { statusBusy = false; statusFlight = null; }
  }

  // ---------- 状态 ----------
  let root = null, shell = null, scrollEl = null, wrapEl = null, coverEl = null, listEl = null, footEl = null, navEl = null, spinEl = null, cbarEl = null, cinputEl = null, csendEl = null;
  let gen = 0, toastTimer = 0, popEl = null, popFor = '', cbar = null, sending = false;
  const pages = [];
  let state = null;
  const freshState = () => ({ me: { nickname: '', avatar: '' }, participants: [], relations: [], settings: {}, prices: {}, skew: 0, posts: [], removedPosts: new Set(), nextCursor: null, cover: '', coverBusy: false, loaded: false, loading: true, error: false, loadingMore: false, refreshing: false, expanded: new Set(), notice: { count: 0, latest: null }, nt: null });
  const nowMs = () => Date.now() + (state ? state.skew : 0);

  // ---------- 展示辅助 ----------
  function formatTime(value) {
    const ms = toMs(value), now = nowMs(), d = now - ms;
    if (d < 60000) return '刚刚';
    if (d < 3600000) return `${Math.floor(d / 60000)}分钟前`;
    const dt = new Date(ms), nw = new Date(now), day = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diff = Math.round((day(nw) - day(dt)) / 86400000);
    if (diff <= 0) return `${Math.floor(d / 3600000)}小时前`;
    if (diff === 1) return '昨天';
    return `${dt.getFullYear() === nw.getFullYear() ? '' : `${dt.getFullYear()}年`}${dt.getMonth() + 1}月${dt.getDate()}日`;
  }
  function avatarHtml(info, cls) {
    const name = info.name || '?', letter = esc(Array.from(name)[0] || '?'), bg = COLORS[hash(name) % COLORS.length], url = safeUrl(info.avatar);
    // 梦角头像取不到时，由主程序用本机这位梦角的头像兜底（见 hydrateDreamAvatars）。
    const dreamAttr = info.dreamId ? ` data-mom-dream-av="${esc(info.dreamId)}"` : '';
    if (url) return `<span class="x-mom-av ${cls || ''}" style="background:${bg}"${dreamAttr}><img class="x-mom-img" src="${esc(url)}" alt="" data-mom-letter="${letter}"></span>`;
    return `<span class="x-mom-av ${cls || ''}" style="background:${bg}"${dreamAttr}>${letter}</span>`;
  }
  function actorInfo(actor, post) {
    if (actor && actor.type === 'user') return { name: state.me.nickname || '我', avatar: state.me.avatar, self: true };
    const p = state.participants.find(x => x.dreamId === (actor && actor.dreamId));
    if (p) return { name: p.name, avatar: p.avatar, dreamId: p.dreamId };
    if (post && post.authorName && post.author && actor && post.author.dreamId === actor.dreamId) return { name: post.authorName, avatar: '' };
    return { name: '已删除的梦角', avatar: '' };
  }
  const dreamName = id => { const p = state.participants.find(x => x.dreamId === id); return p ? p.name : '已删除的梦角'; };
  const modeLabel = p => (p.mode === 'ai' ? 'AI' : '字卡');
  function priceText(p) {
    const pr = state.prices || {}, post = p.mode === 'ai' ? pr.aiPost : pr.cardPost, cm = p.mode === 'ai' ? pr.aiComment : pr.cardComment;
    if (post == null) return '';
    return post === cm || cm == null ? `每条动态/评论 ${post} 点 X能量` : `动态 ${post} 点 · 评论 ${cm} 点 X能量`;
  }

  // ---------- 渲染：封面 / 动态 ----------
  function renderCover() {
    if (!coverEl) return;
    const me = { name: state.me.nickname || '我', avatar: state.me.avatar }, sig = String(state.me.signature || '').trim();
    coverEl.innerHTML = `<div class="x-mom-cover-top${sig ? ' has-sig' : ''}"><div class="x-mom-cover-bg" data-mom-act="cover" role="button" aria-label="更换封面"></div><div class="x-mom-me"><button type="button" class="x-mom-me-name" data-mom-act="nick">${esc(me.name)}</button><button type="button" class="x-mom-me-avbtn" data-mom-act="avatar" aria-label="更换头像">${avatarHtml(me, 'x-mom-me-av')}</button></div>${state.coverBusy ? '<div class="x-mom-cover-spin" role="status" aria-label="封面上传中"><i></i></div>' : ''}</div>${sig ? `<div class="x-mom-sig"><span class="x-mom-sig-t">${esc(sig)}</span></div>` : ''}${noticePill()}`;
    const cu = safeUrl(state.cover);
    if (cu) coverEl.querySelector('.x-mom-cover-bg').style.setProperty('--x-mom-cover', `url(${JSON.stringify(cu)})`);
  }
  function noticePill() {
    const n = state.notice; if (!n || !(n.count > 0)) return '';
    const a = n.latest ? actorInfo(n.latest) : { name: '?', avatar: '' };
    return `<div class="x-mom-npill-wrap"><button type="button" class="x-mom-npill" data-mom-act="notice-open">${avatarHtml(a, 'x-mom-npill-av')}<span>${esc(n.count)}条新消息</span></button></div>`;
  }
  function renderInter(post) {
    const likes = post.likes || [], comments = post.comments || [];
    if (!likes.length && !comments.length) return '';
    const names = likes.map(l => `<span class="x-mom-nm">${esc(actorInfo(l.actor, post).name)}</span>`).join('，');
    const rows = comments.map(c => {
      const who = actorInfo(c.actor, post).name, to = c.replyTo ? ` 回复 <span class="x-mom-nm">${esc(actorInfo(c.replyTo, post).name)}</span>` : '';
      return `<div class="x-mom-cm" data-mom-act="cm" data-mom-pid="${esc(post.postId)}" data-mom-cid="${esc(c.interactionId)}"><span class="x-mom-nm">${esc(who)}</span>${to}：${esc(c.text)}</div>`;
    }).join('');
    return `<div class="x-mom-inter"><i class="x-mom-tri"></i>${likes.length ? `<div class="x-mom-likes"><span class="x-mom-heart">${ICON.heart}</span><span class="x-mom-likes-names">${names}</span></div>` : ''}${likes.length && comments.length ? '<div class="x-mom-hr"></div>' : ''}${comments.length ? `<div class="x-mom-cms">${rows}</div>` : ''}</div>`;
  }
  function renderPost(p) {
    const id = esc(p.postId), inter = renderInter(p);
    if (p.status === 'author_deleted') {
      return `<article class="x-mom-post is-gone" data-mom-post="${id}"><span class="x-mom-av x-mom-av-gone" aria-hidden="true"></span><div class="x-mom-main"><div class="x-mom-gone-text">原动态已删除</div>${inter}</div></article>`;
    }
    const a = actorInfo(p.author, p), mine = p.author && p.author.type === 'user', open = state.expanded.has(p.postId);
    return `<article class="x-mom-post" data-mom-post="${id}">${avatarHtml(a)}<div class="x-mom-main">
      <div class="x-mom-name">${esc(a.name)}</div>
      ${p.text ? `<div class="x-mom-text${open ? ' is-open' : ''}">${esc(p.text)}</div>
      <button type="button" class="x-mom-more" data-mom-act="expand" data-mom-id="${id}" ${open ? '' : 'hidden'}>${open ? '收起' : '全文'}</button>` : ''}
      ${renderPics(p)}${datingMarkup(p)}
      <div class="x-mom-meta"><span class="x-mom-time">${esc(formatTime(p.createdAt))}</span>${mine ? `<button type="button" class="x-mom-del" data-mom-act="del-post" data-mom-id="${id}">删除</button>` : ''}<button type="button" class="x-mom-dots" data-mom-act="dots" data-mom-id="${id}" aria-label="更多操作">${ICON.dots}</button></div>
      ${inter}</div></article>`;
  }
  function measureClamp(scope) {
    (scope || listEl).querySelectorAll('.x-mom-text').forEach(t => {
      const btn = t.nextElementSibling; if (!btn || !btn.classList.contains('x-mom-more')) return;
      btn.hidden = t.classList.contains('is-open') ? false : t.scrollHeight <= t.clientHeight + 1;
    });
  }
  function renderList() {
    if (!listEl) return;
    closePop();
    listEl.innerHTML = state.posts.map(renderPost).join('');
    measureClamp(); renderFoot(); mountDating();
  }
  function replacePost(id) {
    const p = state.posts.find(x => x.postId === id), el = Array.from(listEl.children).find(n => n.dataset.momPost === id);
    if (!el) return;
    if (!p) { el.remove(); renderFoot(); return; }
    closePop(); el.outerHTML = renderPost(p);
    const fresh = Array.from(listEl.children).find(n => n.dataset.momPost === id); if (fresh) measureClamp(fresh);
    mountDating();
  }
  function renderFoot() {
    if (!footEl) return;
    let html = '';
    if (state.error && !state.loaded) html = '<button type="button" class="x-mom-retry" data-mom-act="retry">加载失败，点击重试</button>';
    else if (!state.loaded || state.loadingMore) html = '<span class="x-mom-loading"><i></i>加载中…</span>';
    else if (!state.posts.length) html = '还没有动态，点右上角相机发布第一条';
    else if (!state.nextCursor) html = '—— 没有更多了 ——';
    footEl.innerHTML = html;
  }

  // ---------- 浮层小件：toast / 菜单 / 弹窗 / 底部菜单 ----------
  function toast(text) {
    if (!shell) return;
    let t = shell.querySelector('.x-mom-toast');
    if (!t) { t = doc.createElement('div'); t.className = 'x-mom-toast'; t.setAttribute('role', 'status'); shell.appendChild(t); }
    t.textContent = text; t.classList.add('is-show');
    global.clearTimeout(toastTimer); toastTimer = global.setTimeout(() => t.classList.remove('is-show'), 2500);
  }
  const fail = e => toast(errText(e));
  function closePop() { if (popEl) { popEl.remove(); popEl = null; popFor = ''; } }
  function openPop(btn, post) {
    if (popEl && popFor === post.postId) return closePop();
    closePop();
    popEl = doc.createElement('div'); popEl.className = 'x-mom-pop'; popFor = post.postId;
    popEl.innerHTML = `<button type="button" data-mom-act="like" data-mom-id="${esc(post.postId)}">${ICON.heart}<span>${post.likedByMe ? '取消' : '赞'}</span></button><i></i><button type="button" data-mom-act="comment" data-mom-id="${esc(post.postId)}">${ICON.bubble}<span>评论</span></button>`;
    shell.appendChild(popEl);
    const r = btn.getBoundingClientRect(), s = shell.getBoundingClientRect();
    popEl.style.top = `${r.top - s.top + r.height / 2 - 18}px`; popEl.style.right = `${s.right - r.left + 6}px`;
  }
  function dialog(o) {
    return new Promise(resolve => {
      const mask = doc.createElement('div'); mask.className = 'x-mom-mask is-center';
      mask.innerHTML = `<div class="x-mom-dlg" role="dialog" aria-modal="true"><h3>${esc(o.title)}</h3>${o.message ? `<p class="x-mom-dlg-msg">${esc(o.message)}</p>` : ''}${o.html || ''}${o.input ? `<input class="x-mom-dlg-in" type="text" maxlength="${o.input.maxlength || 100}" value="${esc(o.input.value || '')}" placeholder="${esc(o.input.placeholder || '')}">` : ''}<div class="x-mom-dlg-btns"><button type="button" data-mom-d="cancel">${esc(o.cancelText || '取消')}</button><button type="button" class="x-mom-ok${o.danger ? ' is-danger' : ''}" data-mom-d="ok">${esc(o.confirmText || '确定')}</button></div></div>`;
      shell.appendChild(mask);
      const okBtn = mask.querySelector('[data-mom-d="ok"]'), cancelBtn = mask.querySelector('[data-mom-d="cancel"]'), field = mask.querySelector('.x-mom-dlg-in');
      let busy = false;
      const done = v => { mask.remove(); resolve(v); };
      const sync = () => { if (o.canConfirm) okBtn.disabled = !o.canConfirm(mask); };
      sync(); mask.addEventListener('change', sync); mask.addEventListener('input', sync);
      if (field) global.setTimeout(() => { try { field.focus(); field.select(); } catch (_) { /* 忽略 */ } }, 30);
      const run = async kind => {
        if (busy) return;
        const handler = kind === 'ok' ? o.onConfirm : o.onCancel, value = kind === 'ok' ? (field ? field.value : (o.getValue ? o.getValue(mask) : true)) : null;
        if (!handler) return done(kind === 'ok' ? value : null);
        busy = true; okBtn.disabled = true; cancelBtn.disabled = true;
        try { await handler(kind === 'ok' && o.getValue && !field ? o.getValue(mask) : value); done(kind === 'ok' ? true : null); } catch (e) { busy = false; cancelBtn.disabled = false; sync(); if (!o.canConfirm) okBtn.disabled = false; fail(e); }
      };
      mask.addEventListener('click', e => {
        const b = e.target.closest('[data-mom-d]');
        if (b) return void run(b.dataset.momD);
        if (e.target === mask && !o.sticky) done(null);
      });
      if (field) field.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); void run('ok'); } });
    });
  }
  function sheet(items) {
    return new Promise(resolve => {
      const mask = doc.createElement('div'); mask.className = 'x-mom-mask is-bottom';
      mask.innerHTML = `<div class="x-mom-sheet" role="dialog" aria-modal="true">${items.map((it, i) => `<button type="button" class="${it.danger ? 'is-danger' : ''}" data-mom-s="${i}">${esc(it.text)}</button>`).join('')}<div class="x-mom-sheet-gap"></div><button type="button" class="x-mom-sheet-cancel" data-mom-s="-1">取消</button></div>`;
      shell.appendChild(mask);
      requestAnimationFrame(() => mask.classList.add('is-in'));
      const done = v => { mask.remove(); resolve(v); };
      mask.addEventListener('click', e => {
        const b = e.target.closest('[data-mom-s]');
        if (b) { const i = Number(b.dataset.momS); return done(i >= 0 ? items[i].value : null); }
        if (e.target === mask) done(null);
      });
    });
  }

  // ---------- 子页面栈 ----------
  function pushPage(name, head, body, cls) {
    const el = doc.createElement('section'); el.className = `x-mom-page ${cls || ''}`; el.dataset.momPage = name;
    el.innerHTML = `<header class="x-mom-phead">${head}</header><div class="x-mom-pbody">${body}</div>`;
    shell.appendChild(el); pages.push(el);
    requestAnimationFrame(() => el.classList.add('is-in'));
    return el;
  }
  function popPage() { const el = pages.pop(); if (el) { disposeImgs(el); el.remove(); } }
  const pageEl = name => pages.find(p => p.dataset.momPage === name);
  const backHead = title => `<button type="button" class="x-mom-pback" data-mom-act="page-back" aria-label="返回">${ICON.back}</button><h2>${esc(title)}</h2><span class="x-mom-pgap"></span>`;
  const sw = (on, act, id) => `<button type="button" class="x-mom-sw${on ? ' is-on' : ''}" role="switch" aria-checked="${on ? 'true' : 'false'}" data-mom-act="${act}" data-mom-id="${esc(id)}"><i></i></button>`;

  // ---------- 数据加载 ----------
  const postTime = p => toMs(p.createdAt);
  const postOrder = (a, b) => postTime(b) - postTime(a) || (String(a.postId) < String(b.postId) ? 1 : String(a.postId) > String(b.postId) ? -1 : 0);
  function mergeFirstPage(posts, next) {
    const ids = new Set(posts.map(p => p.postId)), minT = posts.length ? Math.min(...posts.map(postTime)) : Infinity;
    const rest = state.posts.filter(p => !ids.has(p.postId) && postTime(p) < minT);
    state.posts = posts.concat(rest).sort(postOrder);
    if (!rest.length) state.nextCursor = next || null;
  }
  // Generated interactions are additive. A slower snapshot must not remove another dream's newer reply.
  function mergeGeneratedPost(current, incoming) {
    if (!current || incoming.status !== 'published') return incoming;
    if (current.status !== 'published') return current;
    const merge = key => {
      const rows = new Map((current[key] || []).map(item => [item.interactionId, item]));
      for (const item of incoming[key] || []) {
        // Preserve this page's user edits (including an optimistic unlike); generation only adds dream actions.
        if (item.actor?.type !== 'user') rows.set(item.interactionId, item);
      }
      return [...rows.values()].sort((a,b) => toMs(a.createdAt) - toMs(b.createdAt) || String(a.interactionId).localeCompare(String(b.interactionId)));
    };
    return { ...incoming, ...current, likes:merge('likes'), comments:merge('comments') };
  }
  async function loadFirst(mode) { // mode: 'replace' | 'merge'
    const g = gen, owner = String(session().userId || '');
    if (datingController) datingController.invalidate();
    const r = await call('moments.feed', {});
    if (g !== gen || !root || owner !== String(session().userId || '')) return;
    if (mode === 'merge') mergeFirstPage(r.posts || [], r.nextCursor); else { state.posts = r.posts || []; state.nextCursor = r.nextCursor || null; }
    state.loaded = true; state.error = false;
    renderList();
  }
  async function loadMore() {
    if (!state.nextCursor || state.loadingMore || !state.loaded) return;
    const g = gen; state.loadingMore = true; renderFoot();
    try {
      const r = await call('moments.feed', { cursor: state.nextCursor });
      if (g !== gen) return;
      const ids = new Set(state.posts.map(p => p.postId));
      state.posts = state.posts.concat((r.posts || []).filter(p => !ids.has(p.postId))).sort(postOrder); state.nextCursor = r.nextCursor || null;
      state.loadingMore = false; renderList();
      checkMore();
    } catch (e) { if (g === gen) { state.loadingMore = false; renderFoot(); fail(e); } }
  }
  function checkMore() { if (scrollEl && state.nextCursor && scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight < 320) void loadMore(); }
  function createCatchupRunner({ tick, refresh, isLive, status, setTimer, clearTimer, plan, now = () => Date.now() }) {
    let flight = null, stopped = false, timer = null, release = null;
    const live = () => !stopped && isLive();
    const pause = (ms = 2000) => new Promise(resolve => {
      release = resolve;
      timer = setTimer(() => { timer = null; release = null; resolve(); }, Math.max(2000, Math.min(60000, ms)));
    });
    async function runPlan() {
      const queue = plan.jobs.map(job => ({ ...job, readyAt: (Number(plan.preparedAt) || now()) + Math.max(0, Number(job.retryAfterMs) || 0) }));
      const active = new Set(), pending = new Set();
      const budget = Math.min(20, Number.isInteger(plan.requestBudget) ? Math.max(0, plan.requestBudget) : 20);
      let count = 0, failures = 0, failed = false;
      status(queue.length ? '正在补齐动态…' : '');
      async function execute(job) {
        try {
          const result = job.result || await tick(job);
          // Settle the work ledger even after close; only DOM insertion is cancelled.
          if (result.retryAfterMs > 0) {
            const descriptor = plan.jobs.find(item => item.jobId === job.jobId);
            if (descriptor) descriptor.retryAfterMs = now() + result.retryAfterMs - (Number(plan.preparedAt) || now());
          } else plan.jobs = plan.jobs.filter(item => item.jobId !== job.jobId);
          if (!live()) return;
          if (result.posts?.length || result.produced > 0) {
            job.result = result;
            await refresh(result);
            delete job.result;
          }
          if (!live()) return;
          failures = 0;
          if (result.retryAfterMs > 0) { job.readyAt = now() + result.retryAfterMs; queue.unshift(job); }
        } catch (_) {
          if (!live()) return;
          failures += 1;
          if (failures >= 3) { failed = true; return; }
          job.readyAt = now() + 2000; queue.unshift(job);
        }
      }
      while (live() && (queue.length || pending.size)) {
        while (!failed && count < budget && pending.size < Math.min(2, 3 - failures)) {
          const index = queue.findIndex(job => job.readyAt <= now() && !active.has(job.dreamId));
          if (index < 0) break;
          const job = queue.splice(index, 1)[0];
          active.add(job.dreamId); count += 1;
          plan.requestBudget = budget - count;
          const work = execute(job).finally(() => { active.delete(job.dreamId); pending.delete(work); });
          pending.add(work);
        }
        if (pending.size) { await Promise.race([...pending]); continue; }
        if (failed || count >= budget) break;
        if (queue.length) {
          status('动态正在处理中，稍后自动重试…');
          await pause(Math.min(...queue.map(job => job.readyAt)) - now());
        }
      }
      // A page close does not cancel already-dispatched RPCs. Wait for all of them before handing over.
      await Promise.allSettled([...pending]);
      if (live()) status(failed ? '动态暂未补齐，稍后下拉重试' : queue.length || plan.truncated ? '还有动态待补齐，可稍后下拉继续' : '');
    }
    async function run() {
      if (!live()) return;
      if (plan && Array.isArray(plan.jobs)) return runPlan();
      status('正在补齐动态…');
      let failures = 0, refreshPending = null;
      for (let count = 0; count < 20 && live(); count += 1) {
        try {
          if (refreshPending) { await refresh(refreshPending); refreshPending = null; }
          if (!live()) return;
          const result = await tick();
          if (!live()) return;
          if (result.posts?.length || result.produced > 0) {
            refreshPending = result;
            await refresh(result);
            refreshPending = null;
          }
          if (!live()) return;
          failures = 0;
          if (!result.more) {
            if (result.retryAfterMs > 0) {
              status('动态正在处理中，稍后自动重试…');
              await pause(result.retryAfterMs);
              continue;
            }
            status(''); return;
          }
          status('正在补齐动态…');
        } catch (_) {
          if (!live()) return;
          failures += 1;
          if (failures >= 3) { status('动态暂未补齐，稍后下拉重试'); return; }
          status('连接暂时不稳定，稍后自动重试…');
          await pause();
        }
      }
      if (live()) status('还有动态待补齐，可稍后下拉继续');
    }
    return {
      start() {
        if (!flight) flight = Promise.resolve().then(run).finally(() => { flight = null; });
        return flight;
      },
      stop() {
        stopped = true;
        if (timer !== null) clearTimer(timer);
        timer = null;
        if (release) release();
        release = null;
      }
    };
  }
  let catchupRunner = null;
  let catchupFlight = null;
  async function bgTick(g) {
    if (g !== gen || !root) return;
    if (!catchupRunner && catchupFlight) { await catchupFlight; if (g !== gen || !root) return; }
    if (state.catchupPlan && nowMs() >= state.catchupPlan.validUntil) {
      if (catchupRunner) catchupRunner.stop();
      catchupRunner = null; state.catchupPlan = null;
      if (catchupFlight) { await catchupFlight; if (g !== gen || !root) return; }
    }
    if (!catchupRunner) {
      const owner = String(session().userId || '');
      const isLive = () => g === gen && !!root && owner === String(session().userId || '');
      catchupRunner = createCatchupRunner({
        plan: state.catchupPlan,
        now: nowMs,
        tick: job => call('moments.tick', { openingCatchup: true, ...(job ? {plannedJobId:job.jobId} : {}) }),
        refresh: async result => {
          if (!isLive()) return;
          if (Array.isArray(result.posts) && result.posts.length) {
            const rows = new Map(state.posts.map(post => [post.postId, post]));
            result.posts.forEach(post => {
              if (!state.removedPosts?.has(post.postId)) rows.set(post.postId, mergeGeneratedPost(rows.get(post.postId), post));
            });
            state.posts = [...rows.values()].sort(postOrder);
            renderList();
          }
          if (isLive()) saveSnapshot();
        },
        isLive,
        status: text => {
          if (!isLive()) return;
          const hint = root.querySelector('[data-mom-catchup]');
          hint.textContent = text; hint.hidden = !text;
        },
        setTimer: (fn, ms) => global.setTimeout(fn, ms), clearTimer: id => global.clearTimeout(id)
      });
    }
    const flight = catchupRunner.start();
    catchupFlight = flight;
    try { return await flight; } finally { if (catchupFlight === flight) catchupFlight = null; }
  }
  // 下拉刷新：先立即重拉列表，梦角的新动态在后台生成，好了再自动合并进来（不再等 AI）。
  async function manualRefresh() {
    const g = gen;
    // Reuse the original refresh request as home+feed+plan; never add a separate plan/poll request.
    if (catchupRunner) catchupRunner.stop();
    catchupRunner = null; preparedCatchup = null;
    if (g === gen) await start(false);
  }
  // ---------- 本机快照：打开时先秒显上次的内容，再后台刷新（只存本账号第一页，不含大图数据） ----------
  const CACHE_MAX_AGE = 7 * 86400000, IMAGE_URL_MAX_AGE = 90 * 60000; // 图片临时地址 2 小时有效，超过 90 分钟不复用
  const cacheKey = () => `shex_moments_snapshot_v1:${session().userId || ''}`;
  const lean = url => (/^data:/i.test(String(url || '')) ? '' : url);
  function saveSnapshot() {
    try {
      if (!session().userId) return;
      const snap = { savedAt: Date.now(), me: { ...state.me, avatar: lean(state.me.avatar) }, cover: lean(state.cover),
        participants: state.participants.map(p => ({ ...p, avatar: lean(p.avatar) })), relations: state.relations, settings: state.settings, prices: state.prices,
        posts: state.posts.slice(0, 10), nextCursor: state.posts.length > 10 ? null : state.nextCursor };
      global.localStorage.setItem(cacheKey(), JSON.stringify(snap));
    } catch (_) { /* 存不下就不存 */ }
  }
  function loadSnapshot() {
    try {
      const snap = JSON.parse(global.localStorage.getItem(cacheKey()) || 'null');
      if (!snap || !Array.isArray(snap.posts) || Date.now() - Number(snap.savedAt) > CACHE_MAX_AGE) return false;
      const stale = Date.now() - Number(snap.savedAt) > IMAGE_URL_MAX_AGE;
      const strip = post => (stale ? { ...post, images: (post.images || []).map(img => ({ ...img, url: '' })) } : post);
      state.me = snap.me || state.me; state.cover = stale ? '' : (snap.cover || ''); state.participants = snap.participants || [];
      state.relations = snap.relations || []; state.settings = snap.settings || {}; state.prices = snap.prices || {};
      state.posts = snap.posts.map(strip); state.nextCursor = null; state.loaded = true; state.fromSnapshot = true;
      renderCover(); renderList();
      return true;
    } catch (_) { return false; }
  }

  async function start(restoreSnapshot = true) {
    const g = gen;
    const cached = restoreSnapshot ? loadSnapshot() : state.loaded;
    state.loading = !cached; state.error = false; renderFoot();
    let gotFeed = false;
    try {
      // Already-dispatched home status may contain a paid task. Hand it over rather than starting a third model call.
      if (statusFlight) { try { await statusFlight; } catch (_) {} }
      if (catchupFlight) { try { await catchupFlight; } catch (_) {} }
      if (g !== gen || !root) return;
      const h = await call('moments.home', { prepareCatchup: true, ...(preparedCatchup ? {reuseCatchupPlan:preparedCatchup} : {}) });
      if (g !== gen) return;
      state.catchupPlan = h.catchupPlan || null;
      preparedCatchup = null;
      state.me = h.me || state.me; state.participants = h.participants || []; state.relations = h.relations || []; state.settings = h.settings || {}; state.prices = h.prices || {}; state.cover = h.cover || '';
      state.serverNow = Number(h.serverNow) || Date.now(); state.skew = state.serverNow - Date.now();
      state.notice = h.notice && h.notice.count > 0 ? { count: Number(h.notice.count), latest: h.notice.latest || null } : { count: 0, latest: null };
      unread = 0; applyBadge(); renderCover();
      if (h.feed) { gotFeed = true; state.posts = h.feed.posts || []; state.nextCursor = h.feed.nextCursor || null; state.loaded = true; state.error = false; state.loading = false; state.fromSnapshot = false; renderList(); }
    } catch (e) { if (g === gen) { state.loading = false; if (!cached) state.error = true; renderFoot(); fail(e); } return; }
    // 旧版云函数的 home 不带动态：再单独拉一次（兼容先上前端、后部署云函数的情况）。
    if (!gotFeed) { try { await loadFirst('replace'); } catch (e) { if (g === gen) { state.error = true; renderFoot(); fail(e); } return; } }
    if (g !== gen) return;
    state.fromSnapshot = false; saveSnapshot();
    maybePrompt(); void bgTick(g);
  }

  // ---------- 开启提示 ----------
  function maybePrompt() {
    const list = state.participants;
    if (!list.length || list.some(p => p.autoPost) || !(Number(state.settings.promptDismissedUntil || 0) < state.serverNow)) return;
    const cands = list.filter(p => !p.blocked); if (!cands.length) return;
    const rows = cands.map(p => `<label class="x-mom-chk">${avatarHtml({ name: p.name, avatar: p.avatar, dreamId: p.dreamId }, 'x-mom-chk-av')}<span class="x-mom-chk-name">${esc(p.name)}</span><span class="x-mom-tag${p.mode === 'ai' ? '' : ' is-card'}">${modeLabel(p)}</span><input type="checkbox" value="${esc(p.dreamId)}"><i class="x-mom-box"></i></label>`).join('');
    const html = `<p class="x-mom-dlg-msg is-left">AI 模式每条动态/评论 2 点 X能量，字卡模式每条 1 点；点赞不扣点；余额不足时自动跳过，不会打扰你。</p><div class="x-mom-chks">${rows}</div>`;
    const picked = m => Array.from(m.querySelectorAll('input[type=checkbox]:checked')).map(i => i.value);
    void dialog({
      title: '让梦角也来发朋友圈？', html: html + '<p class="x-mom-muted">约会照片动态也会收到评论，按原评论费用计</p>', confirmText: '开启所选', cancelText: '暂不开启', sticky: true,
      canConfirm: m => picked(m).length > 0, getValue: picked,
      onConfirm: async ids => { const autoPost = {}; ids.forEach(id => { autoPost[id] = true; }); await saveSettings({ autoPost }); renderList(); renderSettingsPage(); toast('已开启，梦角会不定时来发圈'); },
      onCancel: async () => { await saveSettings({ promptDismissedUntil: state.serverNow + 7 * 86400000 }); }
    });
  }
  async function saveSettings(payload) {
    const r = await call('moments.settings.save', payload);
    if (payload.autoPost || payload.blocked) {
      preparedCatchup = null; state.catchupPlan = null;
      if (catchupRunner) catchupRunner.stop();
      catchupRunner = null;
    }
    if (r.settings) state.settings = r.settings;
    if (r.participants) state.participants = r.participants;
    if (r.me) state.me = r.me;
    if (r.cover !== undefined) state.cover = r.cover || '';
    renderCover();
    return r;
  }

  // ---------- 点赞 / 评论 / 删除 ----------
  function setMyLike(p, liked) {
    p.likes = (p.likes || []).filter(l => !(l.actor && l.actor.type === 'user'));
    if (liked) p.likes.push({ interactionId: `tmp-${rid()}`, actor: { type: 'user' }, createdAt: nowMs() });
    p.likedByMe = liked;
  }
  async function toggleLike(id) {
    const p = state.posts.find(x => x.postId === id); if (!p) return;
    const was = Boolean(p.likedByMe), prev = p.likes;
    setMyLike(p, !was); replacePost(id);
    try {
      const r = await call('moments.like.toggle', { postId: id });
      if (Array.isArray(r.likes)) { p.likes = r.likes; p.likedByMe = Boolean(r.liked); } else if (Boolean(r.liked) !== p.likedByMe) setMyLike(p, Boolean(r.liked));
      replacePost(id);
    } catch (e) { p.likes = prev; p.likedByMe = was; replacePost(id); fail(e); }
  }
  function openBar(post, replyTo) {
    cbar = { postId: post.postId, replyId: replyTo ? replyTo.interactionId : '', requestId: rid(), lastText: '' };
    cinputEl.value = ''; cinputEl.placeholder = replyTo ? `回复 ${actorInfo(replyTo.actor, post).name}：` : '评论';
    csendEl.disabled = true; cbarEl.classList.add('is-open');
    global.setTimeout(() => { try { cinputEl.focus(); } catch (_) { /* 忽略 */ } }, 30);
  }
  function closeBar() { cbar = null; if (cbarEl) { cbarEl.classList.remove('is-open'); cinputEl.blur(); } }
  async function sendComment() {
    if (!cbar || sending) return;
    const text = cinputEl.value.trim(); if (!text) return;
    if (len(text) > 300) return toast('评论最多 300 字');
    if (text !== cbar.lastText) { cbar.requestId = rid(); cbar.lastText = text; } // 同一内容失败重试复用同一个 requestId
    const c = cbar, g = gen; sending = true; csendEl.disabled = true;
    try {
      const payload = { requestId: c.requestId, postId: c.postId, text };
      if (c.replyId) payload.replyToInteractionId = c.replyId;
      const r = await call('moments.comment.create', payload);
      if (g !== gen) return;
      const p = state.posts.find(x => x.postId === c.postId);
      if (p && r.comment) { p.comments = (p.comments || []).concat([r.comment]); replacePost(p.postId); }
      if (cbar === c) closeBar();
    } catch (e) { fail(e); } finally { sending = false; if (csendEl) csendEl.disabled = !cinputEl.value.trim(); }
  }
  async function onComment(pid, cid) {
    const p = state.posts.find(x => x.postId === pid), c = p && (p.comments || []).find(x => x.interactionId === cid); if (!c) return;
    if (c.actor && c.actor.type === 'user') {
      if ((await sheet([{ text: '删除', danger: true, value: 'del' }])) !== 'del') return;
      try {
        await call('moments.comment.delete', { interactionId: cid });
        p.comments = p.comments.filter(x => x.interactionId !== cid);
        if (p.status === 'author_deleted' && !p.comments.length) state.posts = state.posts.filter(x => x.postId !== pid);
        replacePost(pid);
      } catch (e) { fail(e); }
    } else openBar(p, c);
  }
  async function deletePost(id) {
    const ok = await dialog({ title: '删除这条动态？', message: '删除后无法恢复。', confirmText: '删除', danger: true });
    if (!ok) return;
    try { await call('moments.post.delete', { postId: id }); state.removedPosts.add(id); state.posts = state.posts.filter(p => p.postId !== id); state.expanded.delete(id); renderList(); } catch (e) { fail(e); }
  }
  async function editNickname() {
    const v = await dialog({
      title: '修改昵称', input: { value: state.me.nickname || '', maxlength: 40, placeholder: '1-20 个字' }, confirmText: '保存',
      onConfirm: async value => {
        const nick = String(value || '').trim();
        if (!nick || len(nick) > 20) throw mkErr('INVALID_INPUT', '昵称需要 1-20 个字');
        await saveSettings({ nickname: nick }); renderList();
      }
    });
    return v;
  }

  // 点自己的头像：更换“全局默认头像”（由主程序 SHEXGlobalAvatar 负责上传、保存、同步，朋友圈不直接写账号数据）。
  let avatarBusy = false;
  async function changeAvatar() {
    const bridge = global.SHEXGlobalAvatar;
    if (!bridge || typeof bridge.set !== 'function') return toast('当前版本暂不支持在这里修改头像');
    if (avatarBusy) return undefined;
    const v = await sheet([{ text: '更换头像（同时修改全局默认头像）', value: 'pick' }]);
    if (v !== 'pick') return undefined;
    const input = doc.createElement('input');
    input.type = 'file'; input.accept = 'image/*'; input.style.display = 'none';
    doc.body.appendChild(input);
    input.addEventListener('change', async () => {
      const file = input.files && input.files[0];
      input.remove();
      if (!file) return;
      avatarBusy = true; toast('正在更换头像…');
      try {
        await bridge.set(file);
        try { state.me = { ...state.me, avatar: URL.createObjectURL(file) }; } catch (_) { /* 预览失败不影响保存 */ }
        renderCover(); renderList();
        toast('头像已更新，跟随全局默认头像的地方会一起变');
      } catch (error) {
        toast(error?.message || '头像更换失败，请稍后重试');
      } finally { avatarBusy = false; }
    }, { once: true });
    input.click();
    return undefined;
  }

  // ---------- 图片：压缩 / 上传 / 登记 ----------
  const MAX_IMGS = 9;
  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => resolve({ img, url });
      img.onerror = () => { URL.revokeObjectURL(url); reject(mkErr('IMAGE_DECODE', '图片无法读取，请换一张')); };
      img.src = url;
    });
  }
  async function compressImage(file) { // 长边 ≤1600，JPEG 0.85；GIF 原样
    const { img, url } = await loadImage(file);
    try {
      const w0 = img.naturalWidth, h0 = img.naturalHeight;
      if (!w0 || !h0) throw mkErr('IMAGE_DECODE', '图片无法读取，请换一张');
      if (/gif/i.test(file.type)) return { blob: file, width: w0, height: h0 };
      const k = Math.min(1, 1600 / Math.max(w0, h0)), w = Math.max(1, Math.round(w0 * k)), h = Math.max(1, Math.round(h0 * k));
      const c = doc.createElement('canvas'); c.width = w; c.height = h;
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(img, 0, 0, w, h);
      const blob = await new Promise(resolve => c.toBlob(resolve, 'image/jpeg', 0.85));
      if (!blob) throw mkErr('IMAGE_DECODE', '图片处理失败，请换一张');
      return { blob, width: w, height: h };
    } finally { URL.revokeObjectURL(url); }
  }
  // 三步各自缓存结果：重试只做没完成的步骤，且 requestId 固定
  async function processImage(item) {
    if (!item.blob) { const c = await compressImage(item.file); item.blob = c.blob; item.width = c.width; item.height = c.height; }
    if (!item.fileID) {
      const store = global.SHEXCloudStorage;
      if (!store || typeof store.uploadFile !== 'function') throw mkErr('NETWORK', '上传暂不可用');
      const r = await store.uploadFile(item.blob, 'moments', { allowLocalFallback: false, resolveTempUrl: false });
      const id = (r && (r.fileID || r.fileId)) || (typeof r === 'string' ? r : '');
      if (!id) throw mkErr('UPLOAD_FAILED', '上传失败，请重试');
      item.fileID = id;
    }
    if (!item.imageId) {
      const r = await call('moments.image.register', { requestId: item.reqId, fileID: item.fileID, width: item.width, height: item.height });
      if (!r.image || !r.image.imageId) throw mkErr('ERROR', '图片登记失败，请重试');
      item.imageId = r.image.imageId;
    }
    return item.imageId;
  }
  function pickFiles(multiple, cb) {
    const input = doc.createElement('input');
    input.type = 'file'; input.accept = 'image/*'; input.multiple = Boolean(multiple); input.style.display = 'none';
    doc.body.appendChild(input);
    input.addEventListener('change', () => { const list = Array.from(input.files || []); input.remove(); if (list.length) cb(list); }, { once: true });
    input.addEventListener('cancel', () => input.remove(), { once: true });
    input.click();
  }

  // ---------- 动态里的图片 / 大图浏览 ----------
  const postImages = p => (Array.isArray(p && p.images) ? p.images : []).filter(im => im && safeUrl(im.url));
  function renderPics(p) {
    const imgs = postImages(p); if (!imgs.length) return '';
    const id = esc(p.postId);
    const cell = (im, i, style) => `<button type="button" class="x-mom-pic" data-mom-act="view" data-mom-id="${id}" data-mom-i="${i}"${style ? ` style="${style}"` : ''} aria-label="查看图片 ${i + 1}"><img class="x-mom-pimg" src="${esc(safeUrl(im.url))}" alt="" loading="lazy" draggable="false"></button>`;
    if (imgs.length === 1) {
      const im = imgs[0], w = Number(im.width), h = Number(im.height);
      let bw = 150, bh = 150;
      if (w > 0 && h > 0) { const k = 180 / Math.max(w, h); bw = Math.max(40, Math.round(w * k)); bh = Math.max(40, Math.round(h * k)); }
      return `<div class="x-mom-pics is-one">${cell(im, 0, `width:${bw}px;height:${bh}px`)}</div>`;
    }
    return `<div class="x-mom-pics ${imgs.length === 4 ? 'is-four' : 'is-grid'}">${imgs.map((im, i) => cell(im, i)).join('')}</div>`;
  }
  let viewer = null;
  function onViewerKey(e) {
    if (!viewer) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeViewer(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); viewerGo(-1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); viewerGo(1); }
  }
  function viewerShow(drag) {
    if (!viewer) return;
    const track = viewer.el.querySelector('.x-mom-vtrack');
    track.style.transition = drag ? 'none' : '';
    track.style.transform = `translateX(calc(${-viewer.i * 100}% + ${drag || 0}px))`;
    viewer.el.querySelector('.x-mom-vcount').textContent = viewer.n > 1 ? `${viewer.i + 1}/${viewer.n}` : '';
    const prev = viewer.el.querySelector('.is-prev'), next = viewer.el.querySelector('.is-next');
    if (prev) prev.hidden = viewer.i <= 0; if (next) next.hidden = viewer.i >= viewer.n - 1;
  }
  function viewerGo(d) { if (!viewer) return; viewer.i = Math.max(0, Math.min(viewer.n - 1, viewer.i + d)); viewerShow(0); }
  function closeViewer() {
    if (!viewer) return;
    viewer.el.remove(); viewer = null; doc.removeEventListener('keydown', onViewerKey, true);
  }
  function openViewer(pid, index) {
    const p = state.posts.find(x => x.postId === pid), imgs = p ? postImages(p) : []; if (!imgs.length) return;
    closeViewer();
    const el = doc.createElement('div'); el.className = 'x-mom-viewer'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', '查看图片');
    el.innerHTML = `<div class="x-mom-vtrack">${imgs.map(im => `<div class="x-mom-vslide"><img class="x-mom-vimg" src="${esc(safeUrl(im.url))}" alt="" draggable="false"></div>`).join('')}</div>${imgs.length > 1 ? '<button type="button" class="x-mom-varr is-prev" data-mom-act="v-prev" aria-label="上一张">‹</button><button type="button" class="x-mom-varr is-next" data-mom-act="v-next" aria-label="下一张">›</button>' : ''}<div class="x-mom-vcount"></div>`;
    shell.appendChild(el);
    viewer = { el, n: imgs.length, i: Math.max(0, Math.min(imgs.length - 1, Number(index) || 0)) };
    let x0 = 0, y0 = 0, dx = 0, track = false, moved = false;
    el.addEventListener('touchstart', e => { if (e.touches.length !== 1) { track = false; return; } x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; dx = 0; track = true; moved = false; }, { passive: true });
    el.addEventListener('touchmove', e => {
      if (!track) return;
      const mx = e.touches[0].clientX - x0, my = e.touches[0].clientY - y0;
      if (!moved && Math.abs(mx) < 8 && Math.abs(my) < 8) return;
      moved = true; dx = mx;
      if ((viewer.i === 0 && dx > 0) || (viewer.i === viewer.n - 1 && dx < 0)) dx *= 0.3;
      viewerShow(dx);
    }, { passive: true });
    const endTouch = () => {
      if (!track) return; track = false;
      const w = el.clientWidth || 300;
      if (Math.abs(dx) > Math.min(60, w / 5)) viewerGo(dx < 0 ? 1 : -1); else viewerShow(0);
      if (moved) { el._swiped = true; global.setTimeout(() => { el._swiped = false; }, 350); }
      dx = 0;
    };
    el.addEventListener('touchend', endTouch); el.addEventListener('touchcancel', endTouch);
    el.addEventListener('click', e => {
      if (e.target.closest('[data-mom-act]') || el._swiped) return;
      closeViewer();
    });
    doc.addEventListener('keydown', onViewerKey, true);
    viewerShow(0);
  }

  // ---------- 封面 ----------
  async function setCover(file) {
    if (state.coverBusy) return;
    const g = gen; state.coverBusy = true; renderCover();
    try {
      const imageId = await processImage({ file, reqId: rid() });
      await saveSettings({ coverImageId: imageId });
    } catch (e) { if (g === gen) fail(e); } finally { if (g === gen && state) { state.coverBusy = false; renderCover(); } }
  }
  async function resetCover() {
    if (state.coverBusy) return;
    const g = gen; state.coverBusy = true; renderCover();
    try { await saveSettings({ coverImageId: null }); } catch (e) { if (g === gen) fail(e); } finally { if (g === gen && state) { state.coverBusy = false; renderCover(); } }
  }
  async function onCoverTap() {
    if (state.coverBusy) return;
    if (!state.cover) return pickFiles(false, list => void setCover(list[0]));
    const v = await sheet([{ text: '换一张封面', value: 'change' }, { text: '恢复默认封面', value: 'reset' }]);
    if (v === 'change') pickFiles(false, list => void setCover(list[0]));
    else if (v === 'reset') void resetCover();
    return undefined;
  }

  // ---------- 个人签名 ----------
  async function editSignature() {
    await dialog({
      title: '个人签名', input: { value: state.me.signature || '', maxlength: 30, placeholder: '写点什么吧（最多 30 字，留空则清除）' }, confirmText: '保存',
      onConfirm: async value => {
        const sig = String(value || '').trim();
        if (len(sig) > 30) throw mkErr('INVALID_INPUT', '签名最多 30 字');
        await saveSettings({ signature: sig }); renderSettingsPage();
      }
    });
  }

  // ---------- 发布页 ----------
  function openCompose() {
    void dating().catch(() => {});
    const el = pushPage('compose', '<button type="button" class="x-mom-ptext" data-mom-act="page-back">取消</button><span class="x-mom-pgrow"></span><button type="button" class="x-mom-publish" data-mom-act="publish" disabled>发表</button>',
      '<textarea class="x-mom-compose" data-mom-in="compose" maxlength="2000" placeholder="这一刻的想法..." aria-label="动态内容"></textarea><div class="x-mom-count" data-mom-count></div><div class="x-mom-imgs" data-mom-grid></div><input type="file" accept="image/*" multiple hidden data-mom-in="files">', 'is-compose');
    el._req = { id: rid(), key: '' }; el._imgs = []; el._datingRef = null;
    const choices = doc.createElement('div'); choices.className = 'xmd-compose-actions'; choices.innerHTML = '<button type="button" class="xmd-button" data-mom-act="dating-add">从约会相册选择</button>';
    el.querySelector('[data-mom-grid]').before(choices);
    const selected = doc.createElement('div'); selected.setAttribute('data-mom-dating-selection', ''); choices.after(selected);
    renderImgs(el);
    global.setTimeout(() => { try { el.querySelector('textarea').focus(); } catch (_) { /* 忽略 */ } }, 280);
  }
  function renderImgs(el) {
    const grid = el.querySelector('[data-mom-grid]'); if (!grid) return;
    const cells = el._imgs.map(it => {
      const k = esc(it.key);
      return `<div class="x-mom-imgcell is-pic${it.state === 'uploading' ? ' is-up' : ''}${it.state === 'failed' ? ' is-bad' : ''}"><img src="${esc(it.preview)}" alt="" draggable="false">${it.state === 'uploading' ? '<span class="x-mom-ispin" role="status" aria-label="上传中"><i></i></span>' : ''}${it.state === 'failed' ? `<button type="button" class="x-mom-ibad" data-mom-act="img-retry" data-mom-k="${k}" aria-label="上传失败，点按重试"><b>!</b></button>` : ''}<button type="button" class="x-mom-idel" data-mom-act="img-del" data-mom-k="${k}" aria-label="删除图片">×</button></div>`;
    }).join('');
    grid.innerHTML = cells + (el._imgs.length < MAX_IMGS ? `<button type="button" class="x-mom-imgcell is-add" data-mom-act="img-add" aria-label="添加图片">${ICON.plus}</button>` : '');
    updatePublish(el);
  }
  function updatePublish(el) {
    const btn = el.querySelector('[data-mom-act="publish"]'); if (!btn || btn.dataset.busy) return;
    const hasText = Boolean(el.querySelector('textarea').value.trim()), imgs = el._imgs || [];
    btn.disabled = imgs.some(i => i.state !== 'ok') || !(hasText || imgs.length > 0 || el._datingRef);
  }
  async function runImg(el, it) {
    it.state = 'uploading'; it.err = null; renderImgs(el);
    try { await processImage(it); if (it.dead) return; it.state = 'ok'; } catch (e) { if (it.dead) return; it.state = 'failed'; it.err = e; toast('上传失败，点按重试'); }
    if (pages.includes(el)) renderImgs(el);
  }
  function addImgs(el, files) {
    if (el._datingRef) { toast('请先移除已选的约会内容，再添加手机照片'); return; }
    const list = files.filter(f => !f.type || /^image\//i.test(f.type)); if (!list.length) return;
    const room = MAX_IMGS - el._imgs.length;
    if (list.length > room) toast('最多 9 张');
    const added = list.slice(0, room).map(f => ({ key: rid(), file: f, preview: URL.createObjectURL(f), state: 'uploading', reqId: rid() }));
    if (!added.length) return;
    el._imgs.push(...added); renderImgs(el);
    added.forEach(it => { void runImg(el, it); });
  }
  function disposeImgs(el) { (el._imgs || []).forEach(it => { it.dead = true; try { URL.revokeObjectURL(it.preview); } catch (_) { /* 忽略 */ } }); }
  async function publish(el) {
    const ta = el.querySelector('textarea'), btn = el.querySelector('[data-mom-act="publish"]'), text = ta.value.trim();
    const imgs = el._imgs || [], ids = imgs.filter(i => i.state === 'ok').map(i => i.imageId);
    if (btn.dataset.busy || imgs.some(i => i.state !== 'ok') || !(text || ids.length || el._datingRef)) return;
    const key = `${text}|${ids.join(',')}|${JSON.stringify(el._datingRef)}`;
    if (key !== el._req.key) { el._req = { id: rid(), key }; }
    btn.dataset.busy = '1'; btn.disabled = true;
    try {
      const payload = { requestId: el._req.id, text }; if (ids.length) payload.imageIds = ids;
      if (el._datingRef) payload.datingRef = { ...el._datingRef };
      const r = await call('moments.post.create', payload);
      if (r.post) { state.posts = [r.post].concat(state.posts.filter(p => p.postId !== r.post.postId)); }
      if (pages.includes(el)) { pages.splice(pages.indexOf(el), 1); disposeImgs(el); el.remove(); }
      renderList(); scrollEl.scrollTo ? scrollEl.scrollTo({ top: 0 }) : (scrollEl.scrollTop = 0);
    } catch (e) { fail(e); delete btn.dataset.busy; updatePublish(el); }
  }

  async function pickDating(el) {
    if ((el._imgs || []).length) { toast('请先移除手机照片，再选择约会内容'); return; }
    try {
      const controller = await dating(); if (!el.isConnected) return;
      await controller.openPicker({ participants: state.participants, onSelect: ref => {
        if (!el.isConnected) return; el._datingRef = ref;
        const person = state.participants.find(p => p.dreamId === ref.sourceDreamId);
        el.querySelector('[data-mom-dating-selection]').innerHTML = `<div class="xmd-compose-preview"><button type="button" class="xmd-button" data-mom-act="dating-remove">移除</button><strong>${ref.kind === 'photo' ? '约会照片' : '约会成品'}</strong><p>${esc(person && person.name || 'TA')}的约会相册 · 已选择</p></div>`;
        updatePublish(el);
      } });
    } catch (e) { if (el.isConnected) fail(e); }
  }

  // ---------- 设置页 ----------
  let foldOpen = {};
  function settingsBody() {
    const ps = state.participants;
    const dreamRows = (flag, act) => ps.map(p => `<div class="x-mom-row">${avatarHtml({ name: p.name, avatar: p.avatar, dreamId: p.dreamId }, 'x-mom-row-av')}<div class="x-mom-row-main"><div class="x-mom-row-t">${esc(p.name)}<span class="x-mom-tag${p.mode === 'ai' ? '' : ' is-card'}">${modeLabel(p)}</span></div>${act === 'sw-auto' ? `<div class="x-mom-row-s">${esc(priceText(p))}</div>` : ''}</div>${sw(Boolean(p[flag]), act, p.dreamId)}</div>`).join('');
    const empty = '<div class="x-mom-row is-empty">还没有梦角</div>';
    const rels = state.relations.map(r => `<div class="x-mom-row is-tap" data-mom-act="rel-edit" data-mom-id="${esc(r.relationId)}"><div class="x-mom-row-main"><div class="x-mom-row-t">${esc(dreamName(r.a))} ⇄ ${esc(dreamName(r.b))}${r.label ? ` · ${esc(r.label)}` : ''}</div><div class="x-mom-row-s">点击编辑</div></div>${sw(Boolean(r.enabled), 'sw-rel', r.relationId)}</div>`).join('');
    const sig = String(state.me.signature || '').trim();
    const sigGroup = `<div class="x-mom-sec-t">个人签名</div><div class="x-mom-group"><button type="button" class="x-mom-row is-tap" data-mom-act="sig-edit"><div class="x-mom-row-main"><div class="x-mom-row-t x-mom-sig-row">${sig ? esc(sig) : '<span class="x-mom-muted">未填写</span>'}</div></div><span class="x-mom-chev">›</span></button></div>`;
    const fold = (key, title, sum, inner, note) => {
      const open = Boolean(foldOpen[key]);
      return `<div class="x-mom-group x-mom-fold"><button type="button" class="x-mom-row is-tap x-mom-foldhead" data-mom-act="sec-toggle" data-mom-id="${key}" aria-expanded="${open ? 'true' : 'false'}"><div class="x-mom-row-main"><div class="x-mom-row-t">${title}<span class="x-mom-fold-s"> · ${esc(sum)}</span></div></div><span class="x-mom-fchev${open ? ' is-up' : ''}" aria-hidden="true">›</span></button>${open ? inner : ''}</div>${open ? note : ''}`;
    };
    const addBtn = '<button type="button" class="x-mom-row is-tap is-add" data-mom-act="rel-add"><span class="x-mom-add-t">添加互动关系</span><span class="x-mom-chev">›</span></button>';
    return `${sigGroup}
      ${fold('auto', '梦角主动发圈', `已开启 ${ps.filter(p => p.autoPost).length}/${ps.length}`, ps.length ? dreamRows('autoPost', 'sw-auto') : empty, '<p class="x-mom-note">开启后，该梦角会不定时发朋友圈，并评论、回复、点赞你的动态。约会照片动态也会收到评论，按原评论费用计</p>')}
      ${fold('rel', '梦角互动关系', `已设置 ${state.relations.length} 组`, rels + addBtn, '<p class="x-mom-note">授权只代表允许互动，不代表一定互动；字卡模式的梦角不会评论其他梦角。</p>')}
      ${fold('block', '屏蔽梦角', `已屏蔽 ${ps.filter(p => p.blocked).length} 个`, ps.length ? dreamRows('blocked', 'sw-block') : empty, '<p class="x-mom-note">被屏蔽的梦角看不到你屏蔽期间发的动态，也不会参与互动。</p>')}`;
  }
  function renderSettingsPage() {
    const el = pageEl('settings'); if (!el) return;
    const body = el.querySelector('.x-mom-pbody'), top = body.scrollTop;
    body.innerHTML = settingsBody(); body.scrollTop = top;
  }
  function openSettings() { foldOpen = {}; pushPage('settings', backHead('朋友圈设置'), settingsBody(), 'is-settings'); }
  async function toggleDream(flag, id) {
    const p = state.participants.find(x => x.dreamId === id); if (!p) return;
    const was = Boolean(p[flag]); p[flag] = !was; renderSettingsPage();
    try { await saveSettings({ [flag === 'autoPost' ? 'autoPost' : 'blocked']: { [id]: !was } }); renderSettingsPage(); } catch (e) { const q = state.participants.find(x => x.dreamId === id); if (q) q[flag] = was; renderSettingsPage(); fail(e); }
  }
  async function toggleRelation(id) {
    const r = state.relations.find(x => x.relationId === id); if (!r) return;
    const was = Boolean(r.enabled); r.enabled = !was; renderSettingsPage();
    try {
      const res = await call('moments.relation.save', { relationId: id, a: r.a, b: r.b, label: r.label, enabled: !was });
      if (res.relation) Object.assign(r, res.relation); renderSettingsPage();
    } catch (e) { r.enabled = was; renderSettingsPage(); fail(e); }
  }
  function openRelationEdit(id) {
    const ps = state.participants, rel = id ? state.relations.find(x => x.relationId === id) : null;
    if (!rel && ps.length < 2) return toast('至少需要两个梦角才能添加互动关系');
    const a = rel ? rel.a : ps[0].dreamId, b = rel ? rel.b : ps[1].dreamId, label = rel ? rel.label : '', enabled = rel ? rel.enabled : true;
    const opts = sel => ps.map(p => `<option value="${esc(p.dreamId)}"${p.dreamId === sel ? ' selected' : ''}>${esc(p.name)}（${modeLabel(p)}）</option>`).join('') + (rel && !ps.some(p => p.dreamId === sel) ? `<option value="${esc(sel)}" selected>已删除的梦角</option>` : '');
    const head = `<button type="button" class="x-mom-pback" data-mom-act="page-back" aria-label="返回">${ICON.back}</button><h2>${rel ? '编辑互动关系' : '添加互动关系'}</h2><button type="button" class="x-mom-publish" data-mom-act="rel-save">保存</button>`;
    const body = `<div class="x-mom-group"><label class="x-mom-field"><span>梦角 A</span><select data-mom-in="rel-a">${opts(a)}</select></label><label class="x-mom-field"><span>梦角 B</span><select data-mom-in="rel-b">${opts(b)}</select></label>
      <label class="x-mom-field"><span>关系标签</span><input type="text" data-mom-in="rel-label" maxlength="10" placeholder="最多 10 个字" value="${esc(label)}"></label>
      <div class="x-mom-chips">${['朋友', '同事', '宿敌', '旧识'].map(t => `<button type="button" class="x-mom-chip" data-mom-act="chip" data-mom-id="${esc(t)}">${t}</button>`).join('')}</div>
      <div class="x-mom-row"><div class="x-mom-row-main"><div class="x-mom-row-t">允许互动</div></div>${sw(enabled, 'sw-local', 'enabled')}</div></div>
      <p class="x-mom-note">授权只代表允许互动，不代表一定互动；字卡模式的梦角不会评论其他梦角。</p>
      ${rel ? '<div class="x-mom-group"><button type="button" class="x-mom-row is-tap x-mom-danger-row" data-mom-act="rel-del">删除这条关系</button></div>' : ''}`;
    const el = pushPage('rel', head, body, 'is-rel'); el._rid = rel ? rel.relationId : '';
  }
  async function saveRelation(el) {
    const a = el.querySelector('[data-mom-in="rel-a"]').value, b = el.querySelector('[data-mom-in="rel-b"]').value, label = el.querySelector('[data-mom-in="rel-label"]').value.trim();
    const enabled = el.querySelector('[data-mom-act="sw-local"]').classList.contains('is-on');
    if (a === b) return toast('请选择两个不同的梦角');
    if (len(label) > 10) return toast('关系标签最多 10 个字');
    const btn = el.querySelector('[data-mom-act="rel-save"]'); btn.disabled = true;
    try {
      const payload = { a, b, label, enabled }; if (el._rid) payload.relationId = el._rid;
      const r = await call('moments.relation.save', payload), rel = r.relation || Object.assign({ relationId: el._rid || rid(), updatedAt: Date.now() }, payload);
      const i = state.relations.findIndex(x => x.relationId === rel.relationId);
      if (i >= 0) state.relations[i] = rel; else state.relations.push(rel);
      if (pages.includes(el)) popPage(); renderSettingsPage();
    } catch (e) { btn.disabled = false; fail(e); }
  }
  async function deleteRelation(el) {
    const ok = await dialog({ title: '删除互动关系？', message: '删除后这两位梦角将不再按此关系互动。', confirmText: '删除', danger: true }); if (!ok) return;
    try { await call('moments.relation.delete', { relationId: el._rid }); state.relations = state.relations.filter(x => x.relationId !== el._rid); if (pages.includes(el)) popPage(); renderSettingsPage(); } catch (e) { fail(e); }
  }

  // ---------- 互动消息 ----------
  function noticeRow(n, i) {
    const a = actorInfo(n.actor), post = n.post || {}, img = safeUrl(post.image);
    const mid = n.kind === 'like' ? `<span class="x-mom-nlike">${ICON.heart}</span>` : `<div class="x-mom-ntext">${n.isReply ? '<span class="x-mom-nreply">回复了你：</span>' : ''}${esc(n.text)}</div>`;
    const thumb = img ? `<span class="x-mom-nthumb"><img src="${esc(img)}" alt="" loading="lazy" draggable="false"></span>` : `<span class="x-mom-nthumb is-text">${esc(Array.from(String(post.text || '')).slice(0, 30).join(''))}</span>`;
    return `<button type="button" class="x-mom-nrow" data-mom-act="notice-go" data-mom-i="${i}">${avatarHtml(a, 'x-mom-nav-av')}<span class="x-mom-nmain"><span class="x-mom-nname">${esc(a.name)}</span>${mid}<span class="x-mom-ntime">${esc(formatTime(n.createdAt))}</span></span>${thumb}</button>`;
  }
  function renderNotices() {
    const el = pageEl('notices'); if (!el || !state.nt) return;
    const nt = state.nt, body = el.querySelector('.x-mom-pbody');
    let foot = '';
    if (nt.error && !nt.items.length) foot = '<button type="button" class="x-mom-retry" data-mom-act="notice-retry">加载失败，点击重试</button>';
    else if (nt.loading) foot = '<span class="x-mom-loading"><i></i>加载中…</span>';
    else if (nt.error) foot = '<button type="button" class="x-mom-retry" data-mom-act="notice-retry">加载失败，点击重试</button>';
    else if (!nt.items.length) foot = '<div class="x-mom-nempty">暂无互动消息</div>';
    body.innerHTML = `${nt.items.map(noticeRow).join('')}<div class="x-mom-foot">${foot}</div>`;
  }
  async function loadNotices(first) {
    const nt = state.nt, g = gen; if (!nt || nt.loading || (!first && !nt.next)) return;
    nt.loading = true; nt.error = false; renderNotices();
    try {
      const r = await call('moments.notices', first ? { markRead: true } : { cursor: nt.next });
      if (g !== gen || state.nt !== nt) return;
      const ids = new Set(nt.items.map(x => x.interactionId));
      nt.items = nt.items.concat((r.items || []).filter(x => !ids.has(x.interactionId))); nt.next = r.nextCursor || null; nt.loaded = true;
      if (first) { state.notice = { count: 0, latest: null }; renderCover(); }
    } catch (e) { if (g !== gen || state.nt !== nt) return; nt.error = true; if (nt.items.length) fail(e); }
    nt.loading = false; renderNotices();
    const body = pageEl('notices') && pageEl('notices').querySelector('.x-mom-pbody');
    if (body && nt.next && body.scrollHeight - body.scrollTop - body.clientHeight < 200) void loadNotices(false);
  }
  function openNotices() {
    if (pageEl('notices')) return;
    state.nt = { items: [], next: null, loading: false, loaded: false, error: false };
    const el = pushPage('notices', backHead('全部互动消息'), '', 'is-notices');
    el.querySelector('.x-mom-pbody').addEventListener('scroll', ev => {
      const b = ev.target; if (state.nt && state.nt.next && b.scrollHeight - b.scrollTop - b.clientHeight < 200) void loadNotices(false);
    }, { passive: true });
    void loadNotices(true);
  }
  function gotoPost(i) {
    const n = state.nt && state.nt.items[i]; if (!n) return;
    const pid = n.post && n.post.postId, el = pageEl('notices');
    if (el) { pages.splice(pages.indexOf(el), 1); el.remove(); }
    state.nt = null;
    const target = pid && Array.from(listEl.children).find(x => x.dataset.momPost === pid);
    if (!target) return toast('这条动态较早，下拉加载后可见');
    const top = target.getBoundingClientRect().top - scrollEl.getBoundingClientRect().top + scrollEl.scrollTop - 60;
    scrollEl.scrollTo({ top: Math.max(0, top) });
    target.classList.remove('is-hl'); void target.offsetWidth; target.classList.add('is-hl');
    global.setTimeout(() => target.classList.remove('is-hl'), 2000);
    return undefined;
  }

  // ---------- 事件 ----------
  async function onClick(e) {
    const t = e.target.closest('[data-mom-act]'); if (!t || !shell.contains(t)) return;
    const act = t.dataset.momAct, id = t.dataset.momId, page = t.closest('.x-mom-page');
    switch (act) {
      case 'back': return close();
      case 'camera': return openCompose();
      case 'more': { const v = await sheet([{ text: '消息列表', value: 'notices' }, { text: '朋友圈设置', value: 'settings' }]); if (v === 'settings') openSettings(); else if (v === 'notices') openNotices(); return undefined; }
      case 'notice-open': return openNotices();
      case 'notice-go': return gotoPost(Number(t.dataset.momI));
      case 'notice-retry': return void loadNotices(!state.nt.items.length);
      case 'nick': return void editNickname();
      case 'avatar': return void changeAvatar();
      case 'cover': return void onCoverTap();
      case 'sec-toggle': foldOpen[id] = !foldOpen[id]; return renderSettingsPage();
      case 'sig-edit': return void editSignature();
      case 'view': return openViewer(id, t.dataset.momI);
      case 'v-prev': return viewerGo(-1);
      case 'v-next': return viewerGo(1);
      case 'img-add': { const f = page.querySelector('[data-mom-in="files"]'); return f ? f.click() : undefined; }
      case 'img-del': { const it = page._imgs.find(x => x.key === t.dataset.momK); if (!it) return undefined; it.dead = true; try { URL.revokeObjectURL(it.preview); } catch (_) { /* 忽略 */ } page._imgs = page._imgs.filter(x => x !== it); return renderImgs(page); }
      case 'img-retry': { const it = page._imgs.find(x => x.key === t.dataset.momK); return it && it.state === 'failed' ? void runImg(page, it) : undefined; }
      case 'retry': state.error = false; return void start();
      case 'expand': if (state.expanded.has(id)) state.expanded.delete(id); else state.expanded.add(id); return replacePost(id);
      case 'del-post': return void deletePost(id);
      case 'dots': { const p = state.posts.find(x => x.postId === id); return p ? openPop(t, p) : undefined; }
      case 'like': closePop(); return void toggleLike(id);
      case 'comment': { closePop(); const p = state.posts.find(x => x.postId === id); return p ? openBar(p) : undefined; }
      case 'cm': return void onComment(t.dataset.momPid, t.dataset.momCid);
      case 'send': return void sendComment();
      case 'page-back': return popPage();
      case 'publish': return void publish(page);
      case 'dating-add': return void pickDating(page);
      case 'dating-remove': page._datingRef = null; page.querySelector('[data-mom-dating-selection]').textContent = ''; return updatePublish(page);
      case 'sw-auto': return void toggleDream('autoPost', id);
      case 'sw-block': return void toggleDream('blocked', id);
      case 'sw-rel': return void toggleRelation(id);
      case 'sw-local': t.classList.toggle('is-on'); return t.setAttribute('aria-checked', t.classList.contains('is-on') ? 'true' : 'false');
      case 'rel-add': return openRelationEdit('');
      case 'rel-edit': return openRelationEdit(id);
      case 'rel-save': return void saveRelation(page);
      case 'rel-del': return void deleteRelation(page);
      case 'chip': { const input = page.querySelector('[data-mom-in="rel-label"]'); input.value = id; return undefined; }
      default: return undefined;
    }
  }
  function onInput(e) {
    const t = e.target, kind = t.dataset && t.dataset.momIn;
    if (kind === 'compose') {
      const page = t.closest('.x-mom-page'), n = len(t.value);
      updatePublish(page);
      page.querySelector('[data-mom-count]').textContent = n >= 1800 ? `${n} / 2000` : '';
    } else if (kind === 'cmt') csendEl.disabled = !t.value.trim() || sending;
  }
  function onChange(e) {
    const t = e.target;
    if (t && t.dataset && t.dataset.momIn === 'files') { const page = t.closest('.x-mom-page'), list = Array.from(t.files || []); t.value = ''; if (page && page._imgs) addImgs(page, list); }
  }
  function onPointerDown(e) {
    if (popEl && !e.target.closest('.x-mom-pop') && !(e.target.closest('[data-mom-act="dots"]') && e.target.closest('[data-mom-act="dots"]').dataset.momId === popFor)) closePop();
    if (cbar && !e.target.closest('.x-mom-cbar') && !e.target.closest('.x-mom-pop') && !e.target.closest('.x-mom-mask') && !e.target.closest('[data-mom-act="cm"]')) closeBar();
  }
  function onScroll() {
    navEl.classList.toggle('is-solid', scrollEl.scrollTop > 300 - 56);
    checkMore();
  }
  function setupPull() {
    let startY = 0, pulling = false, dy = 0;
    const setPull = (px, anim) => {
      wrapEl.classList.toggle('is-anim', Boolean(anim)); spinEl.classList.toggle('is-anim', Boolean(anim));
      wrapEl.style.transform = px ? `translateY(${px}px)` : '';
      spinEl.style.opacity = String(Math.min(1, px / 36)); spinEl.style.transform = `translateY(${px - 30}px) rotate(${px * 6}deg)`;
    };
    const begin = y => { if (state.refreshing || scrollEl.scrollTop > 0) return; startY = y; pulling = true; dy = 0; };
    const move = (y, ev) => {
      if (!pulling) return;
      const d = y - startY;
      if (d <= 0 || scrollEl.scrollTop > 0) { if (dy > 0) setPull(0); dy = 0; return; }
      if (ev.cancelable) ev.preventDefault();
      dy = d; setPull(Math.min(90, d * 0.5));
    };
    const end = async () => {
      if (!pulling) return; pulling = false;
      if (dy * 0.5 < 56) { dy = 0; return setPull(0, true); }
      dy = 0; state.refreshing = true; setPull(52, true); spinEl.classList.add('is-spin');
      const g = gen;
      await manualRefresh();
      if (g !== gen || !state || !spinEl) return;
      state.refreshing = false; spinEl.classList.remove('is-spin'); if (spinEl) setPull(0, true);
    };
    scrollEl.addEventListener('touchstart', e => begin(e.touches[0].clientY), { passive: true });
    scrollEl.addEventListener('touchmove', e => move(e.touches[0].clientY, e), { passive: false });
    scrollEl.addEventListener('touchend', end); scrollEl.addEventListener('touchcancel', end);
    scrollEl.addEventListener('mousedown', e => { if (e.button === 0) begin(e.clientY); });
    const mm = e => move(e.clientY, e), mu = () => void end();
    doc.addEventListener('mousemove', mm); doc.addEventListener('mouseup', mu);
    root._cleanup = () => { doc.removeEventListener('mousemove', mm); doc.removeEventListener('mouseup', mu); };
  }
  function onViewport() { const vv = global.visualViewport; if (!vv || !shell) return; shell.style.setProperty('--x-mom-kb', `${Math.max(0, global.innerHeight - vv.height - vv.offsetTop)}px`); }

  // ---------- 打开 / 关闭 ----------
  function build() {
    root = doc.createElement('section'); root.className = 'x-mom-overlay'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', '朋友圈');
    root.innerHTML = `<div class="x-mom-shell">
      <div class="x-mom-scroll"><div class="x-mom-wrap"><div class="x-mom-coverbox"></div><div class="x-mom-catchup" data-mom-catchup role="status" aria-live="polite" hidden></div><div class="x-mom-list"></div><div class="x-mom-foot"></div></div></div>
      <div class="x-mom-spin" aria-hidden="true"><i></i></div>
      <header class="x-mom-nav"><button type="button" class="x-mom-nbtn" data-mom-act="back" aria-label="返回">${ICON.back}</button><h2>朋友圈</h2><div class="x-mom-nright"><button type="button" class="x-mom-nbtn" data-mom-act="camera" aria-label="发布">${ICON.camera}</button><button type="button" class="x-mom-nbtn" data-mom-act="more" aria-label="更多">${ICON.more}</button></div></header>
      <div class="x-mom-cbar"><input class="x-mom-cinput" data-mom-in="cmt" type="text" maxlength="300" placeholder="评论" enterkeyhint="send" aria-label="评论内容"><button type="button" class="x-mom-send" data-mom-act="send" disabled>发送</button></div>
    </div>`;
    shell = root.querySelector('.x-mom-shell'); scrollEl = root.querySelector('.x-mom-scroll'); wrapEl = root.querySelector('.x-mom-wrap');
    coverEl = root.querySelector('.x-mom-coverbox'); listEl = root.querySelector('.x-mom-list'); footEl = root.querySelector('.x-mom-foot');
    navEl = root.querySelector('.x-mom-nav'); spinEl = root.querySelector('.x-mom-spin'); cbarEl = root.querySelector('.x-mom-cbar');
    cinputEl = root.querySelector('.x-mom-cinput'); csendEl = root.querySelector('.x-mom-send');
    root.addEventListener('click', ev => { void onClick(ev); });
    root.addEventListener('input', onInput);
    root.addEventListener('change', onChange);
    root.addEventListener('pointerdown', onPointerDown, true);
    root.addEventListener('error', ev => { const img = ev.target; if (img && img.tagName === 'IMG' && img.classList.contains('x-mom-img')) { const par = img.parentNode; par.textContent = img.dataset.momLetter || '?'; } else if (img && img.tagName === 'IMG' && img.classList.contains('x-mom-pimg')) { img.parentNode.classList.add('is-bad'); img.remove(); } else if (img && img.tagName === 'IMG' && img.classList.contains('x-mom-vimg')) { const par = img.parentNode; par.innerHTML = '<span class="x-mom-vfail">图片加载失败</span>'; } }, true);
    const hydrateDreamAvatars = () => {
      const bridge = global.SHEXDreamAvatar;
      if (!bridge || typeof bridge.apply !== 'function') return;
      root.querySelectorAll('[data-mom-dream-av]:not([data-mom-av-tried])').forEach(span => {
        if (span.querySelector('img')) return;
        span.setAttribute('data-mom-av-tried', '1');
        const img = doc.createElement('img'); img.className = 'x-mom-img'; img.alt = ''; img.dataset.momLetter = span.textContent || '?';
        try { if (bridge.apply(img, span.getAttribute('data-mom-dream-av'))) { span.textContent = ''; span.appendChild(img); } } catch (_) { /* 兜底失败保留首字 */ }
      });
    };
    new MutationObserver(hydrateDreamAvatars).observe(root, { childList: true, subtree: true });
    cinputEl.addEventListener('keydown', ev => { if (ev.key === 'Enter' && !ev.isComposing) { ev.preventDefault(); void sendComment(); } });
    scrollEl.addEventListener('scroll', onScroll, { passive: true });
    doc.body.appendChild(root);
    setupPull();
    if (global.visualViewport) global.visualViewport.addEventListener('resize', onViewport);
  }
  function close() {
    if (!root) return;
    gen += 1;
    if (catchupRunner) catchupRunner.stop();
    catchupRunner = null;
    if (state?.catchupPlan?.userId === String(session().userId || '')) preparedCatchup = state.catchupPlan;
    if (datingController) { datingController.dispose(); datingController = null; }
    closeViewer(); pages.forEach(disposeImgs);
    if (global.visualViewport) global.visualViewport.removeEventListener('resize', onViewport);
    if (root._cleanup) root._cleanup();
    global.clearTimeout(toastTimer);
    root.remove(); root = shell = scrollEl = wrapEl = coverEl = listEl = footEl = navEl = spinEl = cbarEl = cinputEl = csendEl = null;
    popEl = null; popFor = ''; cbar = null; sending = false; pages.length = 0; state = null;
    syncEntry();
  }
  function open() {
    if (root || !hasAccess()) return;
    gen += 1; state = freshState(); build(); renderCover(); renderFoot();
    void start();
  }

  // 入口：document 级委托 + 定时补按钮
  doc.addEventListener('click', e => {
    if (e.target.closest && e.target.closest('[data-moments-entry]')) { e.preventDefault(); open(); }
  });
  doc.addEventListener('shex:auth-change', () => { close(); preparedCatchup = null; unread = 0; lastStatusAt = 0; applyBadge(); syncEntry(); });
  doc.addEventListener('visibilitychange', () => {
    if (doc.visibilityState === 'visible' && root && state && state.loaded && !state.fromSnapshot) void bgTick(gen);
  });
  global.setInterval(() => { syncEntry(); void pollStatus(); }, 1500);
  syncEntry();

  global.SHEXMoments = Object.freeze({
    open, close,
    _setApiForTest(fn) { api = typeof fn === 'function' ? fn : defaultApi; lastStatusAt = 0; }
  });
})(window);
