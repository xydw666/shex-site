(function initCharacterAIMemberMemory(global, factory) {
  const api = factory(global);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.SHEXCharacterAIMemberMemory = api;
})(typeof window !== 'undefined' ? window : globalThis, function createCharacterAIMemberMemory(global) {
  'use strict';

  // X103 会员版长期记忆：只展示「TA 已经记住的事」。可以改正文、可以让 TA 忘掉某一条；
  // 不展示场景、计划、待整理事实、类型、重要度、置信度、来源、证据、关键词等内部结构。
  const CONTENT_MAX = 200;
  const MASK_ID = 'xMemberMemoryMask';
  const state = { options: null, busy: false, items: [], editingId: '', forgettingId: '' };

  const STYLE_ID = 'xMemberMemoryStyle';
  // 记忆清单：一张细边框的浅紫列表，正文为主，操作是右侧的轻量文字；移动端优先。
  const STYLE = `
.x-member-memory-mask .x-memory-admin-panel { width: min(560px, 100%); padding: 20px 18px 14px; grid-template-rows: auto auto auto minmax(0, 1fr); }
.x-member-memory-mask .x-memory-admin-head h3 { font-size: 20px; }
.x-member-memory-intro { margin: 10px 0 0; }
.x-member-memory-intro p { margin: 0; color: #6f6480; font-size: 13px; line-height: 1.65; }
.x-member-memory-status { min-height: 0; margin: 12px 2px 0; padding-bottom: 6px; color: #a08a76; font-size: 11px; letter-spacing: .02em; }
.x-member-memory-mask.is-busy .x-member-memory-status { opacity: .55; }
.x-member-memory-status:empty { margin-top: 14px; padding-bottom: 0; }
.x-member-memory-content { padding: 0 0 6px; }
.x-member-memory-list { margin: 0; padding: 0; list-style: none; border: 1px solid rgba(185,142,101,.16); border-radius: 16px; background: rgba(255,255,255,.55); overflow: hidden; }
.x-member-memory-item { display: grid; grid-template-columns: 6px minmax(0, 1fr); column-gap: 10px; row-gap: 0; padding: 10px 10px 4px 13px; }
.x-member-memory-item + .x-member-memory-item { border-top: 1px solid rgba(185,142,101,.11); }
.x-member-memory-item.is-editing, .x-member-memory-item.is-forgetting { background: rgba(185,120,74,.06); }
.x-member-memory-item.is-editing { padding-top: 12px; }
.x-member-memory-item.is-editing .x-member-memory-actions, .x-member-memory-item.is-forgetting .x-member-memory-actions { margin-top: 4px; min-height: 28px; }
.x-member-memory-dot { width: 5px; height: 5px; margin-top: 9px; border-radius: 50%; background: rgba(185,120,74,.32); }
.x-member-memory-item.is-core .x-member-memory-dot { background: #b9784a; box-shadow: 0 0 0 3px rgba(185,120,74,.14); }
.x-member-memory-body { min-width: 0; }
.x-member-memory-text { margin: 0; color: #352f43; font-size: 14px; font-weight: 400; line-height: 1.65; overflow-wrap: anywhere; }
.x-member-memory-actions { grid-column: 2; display: flex; align-items: center; justify-content: flex-end; gap: 0; min-height: 24px; margin-top: -2px; }
.x-member-memory-core { margin-right: auto; color: #b9784a; font-size: 11px; letter-spacing: .08em; }
.x-member-memory-ask { margin-right: auto; color: #a44758; font-size: 12px; }
.x-member-memory-link { border: 0; border-radius: 8px; padding: 4px 7px; color: #a08a76; background: transparent; font-size: 12px; line-height: 1.4; }
.x-member-memory-link:active { background: rgba(185,120,74,.12); }
.x-member-memory-link.is-primary { color: #9a5f36; font-weight: 600; }
.x-member-memory-link.is-danger { color: #a44758; font-weight: 600; }
.x-member-memory-link:disabled { opacity: .4; }
.x-member-memory-input { display: block; box-sizing: border-box; width: 100%; min-height: 62px; border: 1px solid rgba(185,120,74,.32); border-radius: 12px; padding: 8px 10px; color: #352f43; background: rgba(255,255,255,.9); font: inherit; font-size: 14px; line-height: 1.6; resize: vertical; outline: none; }
.x-member-memory-input:focus { border-color: #b9784a; box-shadow: 0 0 0 3px rgba(185,120,74,.14); }
.x-member-memory-empty { border: 1px dashed rgba(185,142,101,.22); border-radius: 16px; padding: 26px 16px; color: #a08a76; font-size: 13px; line-height: 1.7; text-align: center; }
@media (hover: hover) { .x-member-memory-link:hover { color: #9a5f36; background: rgba(185,120,74,.1); } .x-member-memory-link.is-danger:hover { color: #a44758; background: rgba(177,74,91,.08); } }
@media (min-width: 560px) {
  .x-member-memory-item { grid-template-columns: 6px minmax(0, 1fr) auto; align-items: start; padding: 10px 10px 10px 14px; }
  .x-member-memory-actions { grid-column: 3; min-height: 0; padding-top: 1px; }
  .x-member-memory-item.is-editing .x-member-memory-actions, .x-member-memory-item.is-forgetting .x-member-memory-actions { grid-column: 2 / 4; }
  .x-member-memory-core { margin-right: 6px; }
}
body.x-dark-mode .x-member-memory-intro p, body.x-night-mode .x-member-memory-intro p { color: #e8d2ae; }
body.x-dark-mode .x-member-memory-list, body.x-night-mode .x-member-memory-list { border-color: rgba(255,255,255,.12); background: rgba(255,255,255,.04); }
body.x-dark-mode .x-member-memory-item + .x-member-memory-item, body.x-night-mode .x-member-memory-item + .x-member-memory-item { border-top-color: rgba(255,255,255,.08); }
body.x-dark-mode .x-member-memory-text, body.x-night-mode .x-member-memory-text { color: #fff9ef; }
body.x-dark-mode .x-member-memory-input, body.x-night-mode .x-member-memory-input { color: #fff9ef; border-color: rgba(255,255,255,.18); background: rgba(255,255,255,.06); }
body.x-dark-mode .x-member-memory-core, body.x-night-mode .x-member-memory-core, body.x-dark-mode .x-member-memory-link.is-primary, body.x-night-mode .x-member-memory-link.is-primary { color: #e8c894; }
body.x-dark-mode .x-member-memory-empty, body.x-night-mode .x-member-memory-empty { border-color: rgba(255,255,255,.14); }
`;
  function ensureStyle() {
    if (global.document.getElementById(STYLE_ID)) return;
    const style = global.document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = STYLE;
    global.document.head.appendChild(style);
  }

  function text(value) { return String(value ?? ''); }
  function unicodeLength(value) { return Array.from(text(value)).length; }
  function operationId() {
    const random = global.crypto?.randomUUID?.().replace(/-/g, '')
      || `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    return `member_${random}`;
  }
  function node(tag, className = '', content = '') {
    const element = global.document.createElement(tag);
    if (className) element.className = className;
    if (content !== '') element.textContent = text(content);
    return element;
  }
  function mask() { return global.document.getElementById(MASK_ID); }
  function content() { return mask()?.querySelector('[data-member-memory-content]') || null; }
  function setStatus(message) {
    const element = mask()?.querySelector('[data-member-memory-status]');
    if (element) element.textContent = text(message);
  }
  function setBusy(value) {
    state.busy = value === true;
    const modal = mask();
    modal?.classList.toggle('is-busy', state.busy);
    modal?.querySelectorAll('[data-member-memory-content] button, [data-member-memory-content] textarea')
      .forEach((control) => { control.disabled = state.busy; });
  }

  // 列表只保留页面要用的四个字段，服务端多给的任何字段都不会进入页面。
  function normalizeItems(value) {
    const seen = new Set();
    return (Array.isArray(value) ? value : []).map((item) => ({
      memoryId: text(item?.memoryId).trim(),
      content: text(item?.content).trim(),
      isCore: item?.isCore === true,
      updatedAt: Math.max(0, Number(item?.updatedAt || 0))
    })).filter((item) => item.memoryId && item.content && !seen.has(item.memoryId) && seen.add(item.memoryId));
  }

  function validateContent(value, previous = '') {
    const next = text(value).trim();
    if (!next) return { ok: false, message: '内容不能为空' };
    if (unicodeLength(next) > CONTENT_MAX) return { ok: false, message: `最多 ${CONTENT_MAX} 字` };
    if (next === text(previous).trim()) return { ok: false, message: '内容没有变化' };
    return { ok: true, content: next };
  }

  async function request(action, data = {}) {
    const options = state.options || {};
    if (options.canUse && options.canUse() !== true) throw Object.assign(new Error('长期记忆是会员权益，开通会员后可用'), { code: 'MEMBERSHIP_REQUIRED' });
    const app = await options.getApp();
    return options.api.memberMemoryRequest({ app, user: options.getUser(), dreamId: options.dreamId, action, data });
  }

  async function run(task, failureMessage) {
    if (state.busy) return null;
    setBusy(true);
    try {
      return await task();
    } catch (error) {
      setStatus(text(error?.message) || failureMessage);
      return null;
    } finally {
      setBusy(false);
    }
  }

  function link(label, action, tone = '') {
    const element = node('button', `x-member-memory-link${tone ? ` is-${tone}` : ''}`, label);
    element.type = 'button';
    element.dataset.memberMemoryAction = action;
    return element;
  }

  function render() {
    const host = content();
    if (!host) return;
    host.replaceChildren();
    if (!state.items.length) {
      host.appendChild(node('div', 'x-member-memory-empty', 'TA 还没有整理出长期记忆。多聊一会儿，重要的事会慢慢被记下来。'));
      return;
    }
    const list = node('ul', 'x-member-memory-list');
    state.items.forEach((item) => {
      const row = node('li', `x-member-memory-item${item.isCore ? ' is-core' : ''}`);
      row.dataset.memberMemoryId = item.memoryId;
      const body = node('div', 'x-member-memory-body');
      const actions = node('div', 'x-member-memory-actions');
      if (state.editingId === item.memoryId) {
        row.classList.add('is-editing');
        const input = node('textarea', 'x-member-memory-input');
        input.value = item.content;
        input.rows = 2;
        input.maxLength = CONTENT_MAX * 2;
        input.setAttribute('aria-label', `修改这条记忆，最多 ${CONTENT_MAX} 字`);
        input.dataset.memberMemoryInput = item.memoryId;
        body.appendChild(input);
        actions.append(link('保存', 'save', 'primary'), link('取消', 'cancel'));
      } else if (state.forgettingId === item.memoryId) {
        row.classList.add('is-forgetting');
        body.appendChild(node('p', 'x-member-memory-text', item.content));
        actions.append(node('span', 'x-member-memory-ask', '让 TA 忘掉这条？'), link('忘掉', 'forget-confirm', 'danger'), link('取消', 'cancel'));
      } else {
        body.appendChild(node('p', 'x-member-memory-text', item.content));
        if (item.isCore) actions.appendChild(node('span', 'x-member-memory-core', '常记'));
        actions.append(link('修改', 'edit'), link('忘掉', 'forget'));
      }
      row.append(node('span', 'x-member-memory-dot'), body, actions);
      list.appendChild(row);
    });
    host.appendChild(list);
    if (state.busy) setBusy(true);
  }

  async function load() {
    setStatus('正在读取…');
    const payload = await run(() => request('memberListMemories'), '读取失败，请稍后重试');
    if (!payload) { render(); return; }
    state.items = normalizeItems(payload.items);
    state.editingId = '';
    state.forgettingId = '';
    setStatus('');
    render();
  }

  async function save(memoryId) {
    const item = state.items.find((entry) => entry.memoryId === memoryId);
    const input = mask()?.querySelector('[data-member-memory-input]');
    if (!item || !input) return;
    const checked = validateContent(input.value, item.content);
    if (!checked.ok) { setStatus(checked.message); return; }
    const payload = await run(() => request('memberEditMemory', {
      memoryId, content: checked.content, expectedUpdatedAt: item.updatedAt, operationId: operationId()
    }), '保存失败，请稍后重试');
    if (!payload) return;
    const next = normalizeItems([payload.memory])[0];
    if (next) state.items = state.items.map((entry) => (entry.memoryId === memoryId ? next : entry));
    state.editingId = '';
    setStatus('已保存，TA 之后会按修改后的内容来记');
    state.options?.showToast?.('已保存');
    render();
  }

  async function forget(memoryId) {
    const item = state.items.find((entry) => entry.memoryId === memoryId);
    if (!item) return;
    const payload = await run(() => request('memberForgetMemory', {
      memoryId, expectedUpdatedAt: item.updatedAt, operationId: operationId()
    }), '操作失败，请稍后重试');
    if (!payload) return;
    state.items = state.items.filter((entry) => entry.memoryId !== memoryId);
    state.forgettingId = '';
    setStatus('TA 已经忘掉这条了');
    render();
  }

  function close() {
    const modal = mask();
    modal?.classList.remove('show');
    global.document.body?.classList.remove('x-memory-admin-open');
    state.options = null;
    state.items = [];
    state.editingId = '';
    state.forgettingId = '';
  }

  function ensureModal() {
    let modal = mask();
    if (modal) return modal;
    ensureStyle();
    modal = node('div', 'x-memory-admin-mask x-member-memory-mask');
    modal.id = MASK_ID;
    modal.innerHTML = `
      <section class="x-memory-admin-panel" role="dialog" aria-modal="true" aria-labelledby="xMemberMemoryTitle">
        <header class="x-memory-admin-head">
          <div><p>长期记忆</p><h3 id="xMemberMemoryTitle">TA 已经记住的事</h3></div>
          <button type="button" data-member-memory-close aria-label="关闭">×</button>
        </header>
        <div class="x-member-memory-intro">
          <p>聊过的内容会在相处中慢慢整理成长期记忆，不一定立刻出现。</p>
          <p>对 TA 说“记住这个”“别忘了”，可能会更快被整理进来。</p>
        </div>
        <div class="x-member-memory-status" data-member-memory-status aria-live="polite"></div>
        <div class="x-memory-admin-content x-member-memory-content" data-member-memory-content></div>
      </section>`;
    modal.addEventListener('click', (event) => {
      if (event.target === modal || event.target.closest?.('[data-member-memory-close]')) { if (!state.busy) close(); return; }
      const control = event.target.closest?.('[data-member-memory-action]');
      if (!control || state.busy) return;
      const memoryId = control.closest('[data-member-memory-id]')?.dataset.memberMemoryId || '';
      const action = control.dataset.memberMemoryAction;
      if (action === 'edit') { state.editingId = memoryId; state.forgettingId = ''; setStatus(''); render(); mask()?.querySelector('[data-member-memory-input]')?.focus(); }
      if (action === 'forget') { state.forgettingId = memoryId; state.editingId = ''; setStatus(''); render(); }
      if (action === 'cancel') { state.editingId = ''; state.forgettingId = ''; setStatus(''); render(); }
      if (action === 'save') void save(memoryId);
      if (action === 'forget-confirm') void forget(memoryId);
    });
    global.document.body.appendChild(modal);
    return modal;
  }

  async function open(options = {}) {
    if (!options.api?.memberMemoryRequest || typeof options.getApp !== 'function' || typeof options.getUser !== 'function' || !options.dreamId) return false;
    if (options.canUse && options.canUse() !== true) { options.showToast?.('长期记忆是会员权益，开通会员后可用'); return false; }
    state.options = options;
    state.items = [];
    state.editingId = '';
    state.forgettingId = '';
    const modal = ensureModal();
    modal.classList.add('show');
    global.document.body.classList.add('x-memory-admin-open');
    render();
    await load();
    return true;
  }

  return Object.freeze({ CONTENT_MAX, close, normalizeItems, open, validateContent });
});
