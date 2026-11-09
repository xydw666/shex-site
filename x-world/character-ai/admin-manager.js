(function initCharacterAIAdminManager(global, factory) {
  const api = factory(global);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.SHEXCharacterAIAdminManager = api;
})(typeof window !== 'undefined' ? window : globalThis, function createCharacterAIAdminManager(global) {
  'use strict';

  const TABS = Object.freeze(['scene', 'plan', 'pending', 'memories']);
  const MEMORY_STATUSES = Object.freeze(['', 'active', 'core', 'forgotten', 'completed', 'superseded', 'corrected', 'rejected']);
  const MEMORY_TYPES = Object.freeze(['', 'profile_fact', 'preference', 'relationship_event', 'commitment', 'person', 'place', 'boundary', 'other']);
  const TRAVEL_MODES = Object.freeze(['', 'walking', 'car', 'subway', 'train', 'plane', 'elevator', 'ship', 'bike']);
  const SPATIAL_PHASES = Object.freeze(['stationary', 'departing', 'in_transit']);
  const state = {
    options: null,
    tab: 'scene',
    busy: false,
    interaction: null,
    pending: null,
    memoryPage: null,
    memoryCursor: '',
    memoryCursorStack: [],
    memoryFilters: { status: '', type: '' },
    memoryDetail: null
  };

  function text(value) { return String(value ?? ''); }
  function labelTime(value) {
    const timestamp = Number(value || 0);
    return timestamp ? new Date(timestamp).toLocaleString('zh-CN', { hour12: false }) : '无';
  }
  function operationId() {
    const random = global.crypto?.randomUUID?.().replace(/-/g, '')
      || `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    return `admin_${random}`;
  }
  function node(tag, className = '', content = '') {
    const element = global.document.createElement(tag);
    if (className) element.className = className;
    if (content !== '') element.textContent = text(content);
    return element;
  }
  function button(label, action, tone = '') {
    const element = node('button', `x-memory-admin-button${tone ? ` is-${tone}` : ''}`, label);
    element.type = 'button';
    element.dataset.adminAction = action;
    return element;
  }
  function clear(element) {
    if (!element) return;
    element.replaceChildren();
    element.onclick = null;
  }
  function fieldValue(name) { return text(global.document.querySelector(`[data-admin-field="${name}"]`)?.value).trim(); }
  function setBusy(value) {
    state.busy = value === true;
    const modal = global.document.querySelector('#xMemoryAdminMask');
    modal?.classList.toggle('is-busy', state.busy);
    if (state.busy) {
      modal?.querySelectorAll('button, input, textarea, select').forEach((control) => {
        control.dataset.adminDisabledBefore = control.disabled ? 'true' : 'false';
        control.disabled = true;
      });
    } else {
      modal?.querySelectorAll('[data-admin-disabled-before]').forEach((control) => {
        control.disabled = control.dataset.adminDisabledBefore === 'true';
        delete control.dataset.adminDisabledBefore;
      });
    }
  }
  function toast(message) { state.options?.showToast?.(text(message), 3600); }
  function errorMessage(error) {
    const code = text(error?.code);
    if (['SCENE_EDIT_CONFLICT', 'PLAN_EDIT_CONFLICT', 'MEMORY_EDIT_CONFLICT', 'MEMORY_HEAD_EDIT_CONFLICT'].includes(code)) {
      return `${error?.message || '数据已经变化'}，请点“重新加载”后再操作`;
    }
    return error?.message || '操作失败，请稍后重试';
  }
  async function request(action, data = {}) {
    const options = state.options || {};
    if (!options.isAdmin?.()) throw Object.assign(new Error('只有管理员可以使用此工具'), { code: 'ADMIN_ONLY' });
    const user = options.getUser?.();
    const app = await options.getApp?.();
    return options.api.adminManagerRequest({ app, user, dreamId: options.dreamId, action, data });
  }
  async function run(task) {
    if (state.busy) return null;
    setBusy(true);
    try { return await task(); }
    catch (error) { toast(errorMessage(error)); return null; }
    finally { setBusy(false); }
  }

  function ensureModal() {
    let mask = global.document.querySelector('#xMemoryAdminMask');
    if (mask) return mask;
    mask = node('div', 'x-memory-admin-mask');
    mask.id = 'xMemoryAdminMask';
    mask.innerHTML = `
      <section class="x-memory-admin-panel" role="dialog" aria-modal="true" aria-labelledby="xMemoryAdminTitle">
        <header class="x-memory-admin-head">
          <div><p>管理员工具</p><h3 id="xMemoryAdminTitle">记忆与场景管理</h3></div>
          <button type="button" data-admin-action="close" aria-label="关闭">×</button>
        </header>
        <nav class="x-memory-admin-tabs" aria-label="管理区域">
          <button type="button" data-admin-tab="scene">当前场景</button>
          <button type="button" data-admin-tab="plan">当前计划</button>
          <button type="button" data-admin-tab="pending">待整理事实</button>
          <button type="button" data-admin-tab="memories">长期记忆</button>
        </nav>
        <div class="x-memory-admin-status" role="status" aria-live="polite"></div>
        <main class="x-memory-admin-content"></main>
      </section>`;
    mask.addEventListener('click', (event) => {
      if (event.target === mask || event.target.closest?.('[data-admin-action="close"]')) return close();
      const tab = event.target.closest?.('[data-admin-tab]')?.dataset.adminTab;
      if (TABS.includes(tab)) void selectTab(tab);
    });
    global.document.body.appendChild(mask);
    return mask;
  }
  function content() { return ensureModal().querySelector('.x-memory-admin-content'); }
  function status(message = '') { ensureModal().querySelector('.x-memory-admin-status').textContent = text(message); }
  function activateTab() {
    ensureModal().querySelectorAll('[data-admin-tab]').forEach((item) => {
      const active = item.dataset.adminTab === state.tab;
      item.classList.toggle('is-active', active);
      item.setAttribute('aria-current', active ? 'page' : 'false');
    });
  }

  function formField(label, name, value = '', kind = 'input') {
    const wrapper = node('label', 'x-memory-admin-field');
    wrapper.appendChild(node('span', '', label));
    const input = kind === 'textarea' ? node('textarea') : node('input');
    input.dataset.adminField = name;
    input.value = text(value);
    wrapper.appendChild(input);
    return wrapper;
  }
  function selectField(label, name, value, choices) {
    const wrapper = node('label', 'x-memory-admin-field');
    wrapper.appendChild(node('span', '', label));
    const select = node('select');
    select.dataset.adminField = name;
    choices.forEach(([choice, caption]) => {
      const option = node('option', '', caption);
      option.value = choice;
      option.selected = choice === text(value);
      select.appendChild(option);
    });
    wrapper.appendChild(select);
    return wrapper;
  }
  function infoRow(label, value) {
    const row = node('div', 'x-memory-admin-info-row');
    row.append(node('span', '', label), node('strong', '', value || '无'));
    return row;
  }
  function emptyState(message) { return node('p', 'x-memory-admin-empty', message); }

  async function loadScene() {
    status('正在读取当前场景…');
    const payload = await run(() => request('adminGetInteractionState'));
    if (!payload) return;
    state.interaction = payload;
    renderScene();
    status(`场景业务数据读取${payload.resource?.databaseReadDocuments ?? 1}条；另有服务端鉴权和梦角归属校验`);
  }
  function renderScene() {
    const root = content(); clear(root);
    const payload = state.interaction || {};
    const scene = payload.sceneState || {};
    const spatial = scene.spatialState || {};
    const meta = payload.sceneMeta || {};
    const form = node('form', 'x-memory-admin-form');
    form.append(
      infoRow('系统派生地点', scene.location),
      formField('当前地点', 'currentPlace', spatial.currentPlace),
      selectField('移动方式', 'travelMode', spatial.travelMode, TRAVEL_MODES.map((value) => [value, value || '无'])),
      formField('目的地', 'destination', spatial.destination),
      selectField('当前阶段', 'phase', spatial.phase || 'stationary', SPATIAL_PHASES.map((value) => [value, ({ stationary: '静止', departing: '准备出发', in_transit: '移动中' })[value]])),
      formField('当前人物（每行一个）', 'participants', (scene.participants || []).join('\n'), 'textarea'),
      formField('人物位置', 'positions', scene.positions, 'textarea'),
      formField('正在发生', 'ongoing', scene.ongoing, 'textarea')
    );
    const advanced = global.document.createElement('details');
    advanced.className = 'x-memory-admin-advanced';
    advanced.appendChild(node('summary', '', '高级信息'));
    advanced.append(
      infoRow('Scene revision', meta.revision),
      infoRow('更新时间', labelTime(payload.updatedAt)),
      infoRow('来源 requestId', meta.sourceRequestId),
      infoRow('权威来源', meta.authoritySource),
      infoRow('目的地 planId', scene.spatialMeta?.destinationPlanId),
      infoRow('计划 revision', scene.spatialMeta?.destinationPlanRevision)
    );
    form.appendChild(advanced);
    const actions = node('div', 'x-memory-admin-actions');
    actions.append(button('保存场景', 'save-scene', 'primary'), button('重新加载', 'reload-scene'), button('重置错误场景', 'reset-scene', 'danger'));
    form.appendChild(actions);
    form.addEventListener('submit', (event) => event.preventDefault());
    form.addEventListener('click', (event) => {
      const action = event.target.closest?.('[data-admin-action]')?.dataset.adminAction;
      if (action === 'save-scene') void saveScene(false);
      if (action === 'reload-scene') void loadScene();
      if (action === 'reset-scene') void saveScene(true);
    });
    root.appendChild(form);
  }
  async function saveScene(reset) {
    if (reset && !global.confirm?.('只重置当前Scene，不会清除Active Plan。确定继续吗？')) return;
    const payload = state.interaction || {};
    const data = {
      operationId: operationId(),
      expectedSceneRevision: Number(payload.sceneMeta?.revision || 0)
    };
    const action = reset ? 'adminResetScene' : 'adminUpdateScene';
    if (!reset) data.patch = {
      spatialState: {
        currentPlace: fieldValue('currentPlace'),
        travelMode: fieldValue('travelMode'),
        destination: fieldValue('destination'),
        phase: fieldValue('phase')
      },
      participants: fieldValue('participants').split(/[\n,，]/u).map((item) => item.trim()).filter(Boolean),
      positions: fieldValue('positions'),
      ongoing: fieldValue('ongoing')
    };
    const result = await run(() => request(action, data));
    if (!result) return;
    state.interaction = result.interactionState;
    renderScene();
    toast(reset ? '当前场景已重置，Active Plan未改动' : result.changed ? '场景已保存' : '场景没有变化');
  }

  async function loadPlan() {
    status('正在读取当前计划…');
    const payload = await run(() => request('adminGetInteractionState'));
    if (!payload) return;
    state.interaction = payload;
    renderPlan();
    status('只读取了当前梦角的Interaction State，没有读取长期记忆');
  }
  function renderPlan() {
    const root = content(); clear(root);
    const plan = state.interaction?.activePlan;
    if (!plan) {
      root.append(emptyState('当前没有Active Plan。清理Scene不会自动清理计划；计划只能在这里单独操作。'), button('重新加载', 'reload-plan'));
    } else {
      const card = node('section', 'x-memory-admin-card');
      card.append(
        infoRow('内容', plan.summary), infoRow('目的地', plan.destination), infoRow('状态', plan.status),
        infoRow('planId', plan.planId), infoRow('revision', plan.revision), infoRow('过期时间', labelTime(plan.expiresAt)),
        infoRow('来源消息', (plan.sourceMessageIds || []).join('、'))
      );
      const actions = node('div', 'x-memory-admin-actions');
      actions.append(button('标记完成', 'complete-plan', 'primary'), button('取消/清理计划', 'cancel-plan', 'danger'), button('重新加载', 'reload-plan'));
      card.appendChild(actions); root.appendChild(card);
    }
    root.onclick = (event) => {
      const action = event.target.closest?.('[data-admin-action]')?.dataset.adminAction;
      if (action === 'reload-plan') void loadPlan();
      if (action === 'cancel-plan') void transitionPlan('cancel');
      if (action === 'complete-plan') void transitionPlan('complete');
    };
  }
  async function transitionPlan(planAction) {
    const plan = state.interaction?.activePlan;
    if (!plan || !global.confirm?.(`确定要${planAction === 'cancel' ? '取消' : '完成'}这个计划吗？`)) return;
    const result = await run(() => request('adminTransitionPlan', {
      operationId: operationId(), expectedPlanRevision: plan.revision, planAction
    }));
    if (!result) return;
    state.interaction = result.interactionState;
    renderPlan(); toast(planAction === 'cancel' ? '计划已取消' : '计划已完成');
  }

  async function loadPending() {
    status('正在读取待整理事实…');
    const payload = await run(() => request('adminGetPendingFacts'));
    if (!payload) return;
    state.pending = payload; renderPending();
    status(`当前${payload.pendingFacts?.length || 0}条；只读取Memory Head，没有读取正式Memory列表`);
  }
  function renderPending() {
    const root = content(); clear(root);
    const facts = state.pending?.pendingFacts || [];
    const toolbar = node('div', 'x-memory-admin-toolbar');
    toolbar.append(node('strong', '', `待整理事实 · Head v${state.pending?.headVersion || 0}`), button('重新加载', 'reload-pending'));
    root.appendChild(toolbar);
    if (!facts.length) root.appendChild(emptyState('当前没有待整理事实。'));
    facts.forEach((fact) => {
      const card = node('article', 'x-memory-admin-card');
      card.append(node('strong', '', fact.summary), infoRow('类型 / 倾向', `${fact.type || '无'} / ${fact.polarity || '无'}`),
        infoRow('factKey', fact.factKey), infoRow('来源消息', (fact.sourceMessageIds || []).join('、')), infoRow('规则', fact.ruleVersion),
        infoRow('创建时间', labelTime(fact.createdAt)));
      const remove = button('移出待整理区', 'remove-pending', 'danger'); remove.dataset.factId = fact.factId; card.appendChild(remove); root.appendChild(card);
    });
    root.onclick = (event) => {
      const target = event.target.closest?.('[data-admin-action]');
      if (target?.dataset.adminAction === 'reload-pending') void loadPending();
      if (target?.dataset.adminAction === 'remove-pending') void removePending(target.dataset.factId);
    };
  }
  async function removePending(factId) {
    if (!global.confirm?.('确定把这条候选移出待整理区吗？正式Memory不会被删除。')) return;
    const result = await run(() => request('adminRemovePendingFact', {
      operationId: operationId(), factId, expectedHeadVersion: state.pending?.headVersion
    }));
    if (!result) return;
    state.pending = result; renderPending(); toast('已移出待整理区');
  }

  function memoryFilters() {
    return { status: fieldValue('memoryStatus'), type: fieldValue('memoryType') };
  }
  async function loadMemories(resetCursor = false) {
    if (resetCursor) {
      state.memoryCursor = ''; state.memoryCursorStack = []; state.memoryDetail = null;
      state.memoryFilters = memoryFilters();
    }
    status('正在读取当前页长期记忆…');
    const filters = state.memoryFilters;
    const payload = await run(() => request('adminListMemories', {
      cursor: state.memoryCursor, limit: 20, status: filters.status, type: filters.type
    }));
    if (!payload) return;
    state.memoryPage = payload; renderMemories();
    status(`本页${payload.items?.length || 0}条；服务端硬上限50条；未做正文全文扫描`);
  }
  function renderMemories() {
    const root = content(); clear(root);
    const filter = node('div', 'x-memory-admin-filter');
    const currentStatus = state.memoryFilters.status || '';
    const currentType = state.memoryFilters.type || '';
    filter.append(
      selectField('状态', 'memoryStatus', currentStatus, MEMORY_STATUSES.map((value) => [value, value || '全部状态'])),
      selectField('类型', 'memoryType', currentType, MEMORY_TYPES.map((value) => [value, value || '全部类型'])),
      button('搜索', 'search-memories', 'primary'), button('重新加载', 'reload-memories')
    );
    root.appendChild(filter);
    const list = node('div', 'x-memory-admin-list');
    (state.memoryPage?.items || []).forEach((memory) => {
      const item = button('', 'open-memory');
      item.classList.add('x-memory-admin-list-item'); item.dataset.memoryId = memory.memoryId;
      item.append(node('strong', '', memory.content), node('small', '', `${memory.type} · ${memory.status}${memory.isCore ? ' · Core' : ''}${memory.userLocked ? ' · 已锁定' : ''}`));
      list.appendChild(item);
    });
    if (!state.memoryPage?.items?.length) list.appendChild(emptyState('当前筛选条件下没有记忆。'));
    root.appendChild(list);
    const paging = node('div', 'x-memory-admin-actions');
    const previous = button('上一页', 'previous-memories'); previous.disabled = !state.memoryCursorStack.length;
    const next = button('下一页', 'next-memories'); next.disabled = !state.memoryPage?.nextCursor;
    paging.append(previous, next); root.appendChild(paging);
    if (state.memoryDetail) root.appendChild(renderMemoryDetail(state.memoryDetail));
    root.onclick = (event) => {
      const target = event.target.closest?.('[data-admin-action]');
      const action = target?.dataset.adminAction;
      if (action === 'search-memories') void loadMemories(true);
      if (action === 'reload-memories') void loadMemories(false);
      if (action === 'open-memory') void loadMemoryDetail(target.dataset.memoryId);
      if (action === 'next-memories' && state.memoryPage?.nextCursor) {
        state.memoryCursorStack.push(state.memoryCursor); state.memoryCursor = state.memoryPage.nextCursor; void loadMemories(false);
      }
      if (action === 'previous-memories' && state.memoryCursorStack.length) {
        state.memoryCursor = state.memoryCursorStack.pop() || ''; void loadMemories(false);
      }
      if (action === 'save-memory-content') void correctMemory();
      if (action === 'save-memory-importance') void updateMemoryImportance();
      if (['forget', 'restore', 'quarantine', 'core_on', 'core_off'].includes(action)) void transitionMemory(action);
    };
  }
  async function loadMemoryDetail(memoryId) {
    const result = await run(() => request('adminGetMemory', { memoryId }));
    if (!result) return;
    state.memoryDetail = result.memory; renderMemories();
    // X103：详情（可编辑正文/类型/重要程度、忘记、设为Core）渲染在列表最下方，手机上点了看不到，像是“没有编辑入口”。
    global.document.querySelector('#xMemoryAdminMask .x-memory-admin-detail')?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
  }
  function renderMemoryDetail(memory) {
    const section = node('section', 'x-memory-admin-detail');
    section.append(node('h4', '', '记忆详情'), formField('正文', 'memoryContent', memory.content, 'textarea'),
      selectField('类型', 'memoryDetailType', memory.type, MEMORY_TYPES.filter(Boolean).map((value) => [value, value])),
      formField('重要程度（0-100）', 'memoryImportance', memory.importance));
    const actions = node('div', 'x-memory-admin-actions');
    actions.append(button('保存正文/类型', 'save-memory-content', 'primary'), button('只保存重要程度', 'save-memory-importance'));
    if (['active', 'core'].includes(memory.status)) actions.append(button('忘记', 'forget', 'danger'), button('隔离错误记忆', 'quarantine', 'danger'));
    if (memory.status === 'forgotten') actions.append(button('恢复', 'restore', 'primary'));
    if (memory.isCore) actions.append(button('取消Core', 'core_off'));
    else if (memory.status === 'active') actions.append(button('设为Core', 'core_on'));
    section.appendChild(actions);
    const advanced = global.document.createElement('details'); advanced.className = 'x-memory-admin-advanced';
    advanced.appendChild(node('summary', '', '来源与高级信息'));
    [
      ['memoryId', memory.memoryId], ['状态', memory.status], ['factKey', memory.factKey], ['subject', memory.subject],
      ['置信度', memory.confidence], ['Core / pinned', `${memory.isCore} / ${memory.isPinned}`], ['userLocked', memory.userLocked],
      ['sourceType', memory.sourceType], ['sourceSpeaker', memory.sourceSpeaker], ['provenance', memory.provenanceStatus],
      ['证据消息', (memory.evidenceMessageIds || []).join('、')], ['来源消息', (memory.sourceMessageIds || []).join('、')],
      ['关联记忆', memory.relatedMemoryId], ['发生时间', labelTime(memory.occurredAt)], ['到期时间', labelTime(memory.dueAt)],
      ['创建时间', labelTime(memory.createdAt)], ['更新时间', labelTime(memory.updatedAt)]
    ].forEach(([label, value]) => advanced.appendChild(infoRow(label, value)));
    section.appendChild(advanced); return section;
  }
  async function correctMemory() {
    const memory = state.memoryDetail; if (!memory) return;
    const result = await run(() => request('adminCorrectMemory', {
      operationId: operationId(), memoryId: memory.memoryId, expectedUpdatedAt: memory.updatedAt,
      content: fieldValue('memoryContent'), type: fieldValue('memoryDetailType')
    }));
    if (!result) return;
    state.memoryDetail = result.memory; await loadMemories(false); toast('已生成新的手工锁定记忆，旧记录保留为纠正历史');
  }
  async function updateMemoryImportance() {
    const memory = state.memoryDetail; if (!memory) return;
    const result = await run(() => request('adminUpdateMemoryFields', {
      operationId: operationId(), memoryId: memory.memoryId, expectedUpdatedAt: memory.updatedAt,
      importance: Number(fieldValue('memoryImportance'))
    }));
    if (!result) return;
    state.memoryDetail = result.memory; renderMemories(); toast('重要程度已保存并锁定');
  }
  async function transitionMemory(action) {
    const memory = state.memoryDetail; if (!memory) return;
    const labels = { forget: '忘记', restore: '恢复', quarantine: '隔离', core_on: '设为Core', core_off: '取消Core' };
    if (!global.confirm?.(`确定要${labels[action]}这条记忆吗？正式记录不会被物理删除。`)) return;
    const result = await run(() => request('adminTransitionMemory', {
      operationId: operationId(), memoryId: memory.memoryId, expectedUpdatedAt: memory.updatedAt, memoryAction: action
    }));
    if (!result) return;
    state.memoryDetail = result.memory; await loadMemories(false); toast(`${labels[action]}操作已完成`);
  }

  async function selectTab(tab) {
    if (!TABS.includes(tab) || state.busy) return;
    state.tab = tab; activateTab(); clear(content());
    if (tab === 'scene') await loadScene();
    if (tab === 'plan') await loadPlan();
    if (tab === 'pending') await loadPending();
    if (tab === 'memories') { state.memoryPage = { items: [], filters: { status: '', type: '' } }; renderMemories(); await loadMemories(true); }
  }
  function close() {
    const mask = global.document.querySelector('#xMemoryAdminMask');
    mask?.classList.remove('show'); global.document.body.classList.remove('x-memory-admin-open');
  }
  async function open(options = {}) {
    if (!options.isAdmin?.() || !options.dreamId || !options.api?.adminManagerRequest) {
      options.showToast?.('当前账号或梦角不能打开管理器'); return;
    }
    state.options = options; state.interaction = null; state.pending = null; state.memoryDetail = null;
    const mask = ensureModal(); mask.classList.add('show'); global.document.body.classList.add('x-memory-admin-open');
    await selectTab('scene');
  }

  return Object.freeze({ MEMORY_STATUSES, MEMORY_TYPES, SPATIAL_PHASES, TRAVEL_MODES, close, open });
});
