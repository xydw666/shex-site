// SHE.X 自定义 APP（第一阶段，仅管理员账号可见）。
// 创作者 / AI 写的 HTML 在 host.html 里的隔离 iframe 中运行：不能联网、不能跳转、读不到 SHE.X 的登录信息和本地数据。
// 数据只从 SHE.X 流向 APP（只读快照）；APP 唯一能写的是它自己的本机小存档。
(function initCustomApps(global) {
  'use strict';
  const MAX_CODE_BYTES = 300 * 1024, MAX_APPS = 20, MAX_ASSETS = 12, MAX_STORE_BYTES = 200 * 1024;
  const HOST_URL = './x-world/custom-app/host.html?v=20261030-001746-x103-front-20', HANDBOOK_URL = './x-world/custom-app/handbook.md?v=20261030-001746-x103-front-20';
  const isAdmin = () => Boolean(global.SHEXAuth?.isAdmin?.());
  const userId = () => String(global.SHEXAuth?.current?.()?.userId || '');
  // APP 按梦角分开：每个梦角有自己的一组 APP 和各自的小存档，互相看不到（和 X陪伴、约会一样）。
  const dreamId = () => String(global.SHEXStageAdvancedBeautifyContext?.currentDreamId?.() || '');
  const escapeHtml = value => String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const bytes = text => new Blob([String(text || '')]).size;
  const newId = () => `app_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  // ---------- 本机保存（IndexedDB，按账号分开） ----------
  let dbPromise = null;
  function db() {
    if (!dbPromise) dbPromise = new Promise((resolve, reject) => {
      const request = global.indexedDB.open('shex-custom-apps', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('apps', { keyPath: 'key' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return dbPromise;
  }
  async function tx(mode, run) {
    const database = await db();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction('apps', mode), request = run(transaction.objectStore('apps'));
      transaction.oncomplete = () => resolve(request?.result);
      transaction.onerror = () => reject(transaction.error);
    });
  }
  const keyOf = id => `${userId()}:${dreamId()}:${id}`;
  async function listApps() {
    const owner = userId(), dream = dreamId();
    if (!owner || !dream) return [];
    let all = await tx('readonly', store => store.getAll()) || [];
    // 分梦角之前建的 APP 没有记梦角：归到当前这个梦角名下（只做一次）。
    const legacy = all.filter(item => item.userId === owner && !item.dreamId);
    if (legacy.length) {
      await tx('readwrite', store => { legacy.forEach(item => { store.delete(item.key); store.put({ ...item, dreamId: dream, key: `${owner}:${dream}:${item.id}` }); }); });
      all = await tx('readonly', store => store.getAll()) || [];
    }
    return all.filter(item => item.userId === owner && item.dreamId === dream).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  }
  const getApp = id => tx('readonly', store => store.get(keyOf(id)));
  const putApp = app => tx('readwrite', store => store.put({ ...app, key: keyOf(app.id), userId: userId(), dreamId: dreamId(), updatedAt: Date.now() }));
  const removeApp = id => tx('readwrite', store => store.delete(keyOf(id)));

  // ---------- 图片：从 X世界相册选，转成写进 APP 的内嵌图片（APP 不能联网，所以不能直接给网址） ----------
  async function imageToDataUrl(url, maxSide = 1280) {
    const image = await new Promise((resolve, reject) => {
      const element = new Image(); element.crossOrigin = 'anonymous';
      element.onload = () => resolve(element); element.onerror = () => reject(new Error('图片读取失败')); element.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    try { return canvas.toDataURL('image/webp', 0.82); } catch (_) { throw new Error('这张图片暂时不能用于 APP（图片服务器不允许读取）'); }
  }
  const avatarCache = new Map();
  async function avatarData(url) {
    if (!url) return '';
    if (/^data:/i.test(url)) return url;
    if (!avatarCache.has(url)) avatarCache.set(url, imageToDataUrl(url, 256).catch(() => ''));
    return avatarCache.get(url);
  }

  // ---------- 只读数据快照 ----------
  async function snapshot() {
    const raw = global.SHEXCustomAppHost?.snapshot?.() || {};
    const character = raw.character && raw.character.name ? { name: raw.character.name, avatar: await avatarData(raw.character.avatar), status: raw.character.status || '' } : null;
    const now = new Date(), pad = value => String(value).padStart(2, '0');
    return {
      version: 1,
      user: { nickname: String(raw.user?.nickname || '') },
      world: raw.world || null,
      character,
      time: { date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`, current: `${pad(now.getHours())}:${pad(now.getMinutes())}`, weekday: '星期' + '日一二三四五六'[now.getDay()] },
      visibility: document.visibilityState === 'hidden' ? 'hidden' : 'visible'
    };
  }

  // ---------- 运行一个 APP ----------
  let running = null;
  function stopApp() {
    if (!running) return;
    global.removeEventListener('message', running.onMessage);
    document.removeEventListener('visibilitychange', running.push);
    global.clearInterval(running.timer); global.clearTimeout(running.saveTimer);
    if (running.dirty) void running.flush();
    running.frame.remove(); running = null;
  }
  function runApp(app, mount, { persist = true } = {}) {
    stopApp();
    const scope = `${userId()}|${dreamId()}`;
    const frame = document.createElement('iframe');
    frame.className = 'x-capp-frame'; frame.setAttribute('sandbox', 'allow-scripts'); frame.setAttribute('referrerpolicy', 'no-referrer');
    frame.setAttribute('title', app.name || '自定义 APP'); frame.src = HOST_URL;
    const store = { ...(app.storage || {}) };
    const state = { frame, appId: app.id, dirty: false, last: '', timer: 0, saveTimer: 0 };
    state.flush = async () => {
      state.dirty = false;
      if (!persist || scope !== `${userId()}|${dreamId()}`) return; // 中途换了账号或梦角就不再写，避免存到别的梦角名下
      const fresh = await getApp(app.id); if (fresh) await putApp({ ...fresh, storage: { ...store } });
    };
    const scheduleSave = () => { state.dirty = true; global.clearTimeout(state.saveTimer); state.saveTimer = global.setTimeout(() => void state.flush(), 800); };
    const storeSize = () => Object.keys(store).reduce((total, key) => total + key.length + store[key].length, 0);
    state.push = async () => {
      const data = await snapshot(), text = JSON.stringify(data);
      if (running !== state || text === state.last) return;
      state.last = text; frame.contentWindow?.postMessage({ type: 'shex-data', payload: { data } }, '*');
    };
    state.onMessage = async event => {
      if (event.source !== frame.contentWindow) return; // 只认这个 APP 窗口发来的消息
      const message = event.data || {};
      if (message.type === 'shex-host-ready') {
        const data = await snapshot(); state.last = JSON.stringify(data);
        frame.contentWindow.postMessage({ type: 'shex-app-init', code: String(app.code || ''), payload: { data, storage: { ...store }, assets: { ...(app.assets || {}) } } }, '*');
      } else if (message.type === 'shex-storage-set') {
        const key = String(message.key || '').slice(0, 80), value = String(message.value || '');
        if (!key || value.length > 50000 || storeSize() - (store[key]?.length || 0) + value.length > MAX_STORE_BYTES) return;
        store[key] = value; scheduleSave();
      } else if (message.type === 'shex-storage-remove') { delete store[String(message.key || '')]; scheduleSave(); }
    };
    global.addEventListener('message', state.onMessage);
    document.addEventListener('visibilitychange', state.push);
    state.timer = global.setInterval(state.push, 2000);
    running = state; mount.replaceChildren(frame);
  }

  // ---------- 界面 ----------
  let overlay = null, view = { page: 'list', apps: [], draft: null, notice: '' };
  const toast = text => { view.notice = text; const node = overlay?.querySelector('[data-capp-notice]'); if (node) { node.textContent = text; node.hidden = !text; } };
  function close() { stopApp(); overlay?.remove(); overlay = null; }

  // ---------- X世界 APP 列表里的图标：每个自定义 APP 一个，排在“自定义APP”管理入口前面 ----------
  let tileApps = [], tileSignature = '';
  async function reloadTiles() {
    try { tileApps = isAdmin() && userId() ? await listApps() : []; } catch (_) { tileApps = []; }
    tileSignature = userId() + '|' + dreamId() + '|' + tileApps.map(app => `${app.id}:${app.name}:${app.icon}`).join('|');
    syncTiles();
  }
  function syncTiles() {
    const show = isAdmin();
    document.querySelectorAll('#showCustomApps').forEach(entry => {
      if (entry.hidden === show) entry.hidden = !show;
      const page = entry.parentElement; if (!page) return;
      const wanted = show ? tileSignature : '';
      if (page.dataset.cappTiles === wanted) return;
      page.querySelectorAll('[data-custom-app-tile]').forEach(node => node.remove());
      if (show) tileApps.forEach(app => {
        const tile = document.createElement('button');
        tile.type = 'button'; tile.className = 'x-world-action-tile'; tile.dataset.customAppTile = app.id;
        tile.innerHTML = `<span class="x-world-action-icon" aria-hidden="true"><span class="x-capp-tile-glyph">${escapeHtml(app.icon || '✦')}</span></span><span>${escapeHtml(app.name || '未命名')}</span>`;
        page.insertBefore(tile, entry);
      });
      page.dataset.cappTiles = wanted;
    });
  }
  async function openDirect(id) {
    if (!isAdmin() || !userId()) return;
    const app = await getApp(id); if (!app) return reloadTiles();
    mountOverlay();
    view = { page: 'run', apps: [], draft: app, notice: '', direct: true, preview: false };
    draw();
  }
  function shell(title, body, actions = '') {
    return `<header class="x-capp-head"><button type="button" data-capp="back" aria-label="返回">‹</button><h2>${escapeHtml(title)}</h2><div class="x-capp-head-actions">${actions}</div></header>
      <p class="x-capp-notice" data-capp-notice role="status" ${view.notice ? '' : 'hidden'}>${escapeHtml(view.notice)}</p>${body}`;
  }
  function draw() {
    if (!overlay) return;
    overlay.classList.toggle('is-run', view.page === 'run');
    if (view.page === 'run') {
      overlay.innerHTML = `<header class="x-capp-head is-run"><button type="button" data-capp="back" aria-label="返回">‹</button><h2>${escapeHtml(view.draft.name || '自定义 APP')}</h2></header><div class="x-capp-stage" data-capp-stage></div>`;
      runApp(view.draft, overlay.querySelector('[data-capp-stage]'), { persist: !view.preview });
      return;
    }
    stopApp();
    if (view.page === 'handbook') {
      overlay.innerHTML = shell('创作手册', `<div class="x-capp-body"><p class="x-capp-tip">把这份手册和你的想法一起交给 AI，让它直接写出一个 HTML 文件，再回到这里粘贴或导入。</p><pre class="x-capp-handbook" data-capp-handbook>${escapeHtml(view.handbook || '正在读取手册…')}</pre></div>`, '<button type="button" data-capp="copy-handbook">复制手册</button>');
      return;
    }
    if (view.page === 'edit') {
      const draft = view.draft, assets = Object.keys(draft.assets || {});
      overlay.innerHTML = shell(draft.isNew ? '新建 APP' : '编辑 APP', `<div class="x-capp-body">
        <div class="x-capp-row"><label>图标<input data-capp-field="icon" maxlength="2" value="${escapeHtml(draft.icon || '')}" placeholder="✦"></label><label class="is-grow">名字<input data-capp-field="name" maxlength="12" value="${escapeHtml(draft.name || '')}" placeholder="例如：关系档案"></label></div>
        <div class="x-capp-row is-between"><span class="x-capp-label">APP 代码（一个完整的 HTML 文件）</span><span><button type="button" data-capp="import">导入 .html</button> <button type="button" data-capp="open-handbook">创作手册</button></span></div>
        <textarea class="x-capp-code" data-capp-field="code" spellcheck="false" placeholder="把 AI 写好的 HTML 粘贴到这里">${escapeHtml(draft.code || '')}</textarea>
        <p class="x-capp-size" data-capp-size></p>
        <div class="x-capp-row is-between"><span class="x-capp-label">图片素材（${assets.length} / ${MAX_ASSETS}）</span><button type="button" data-capp="add-asset">从相册添加</button></div>
        <div class="x-capp-assets">${assets.length ? assets.map(name => `<figure><img src="${escapeHtml(draft.assets[name])}" alt=""><input class="x-capp-asset-name" data-capp-asset-name="${escapeHtml(name)}" value="${escapeHtml(name)}" maxlength="16" aria-label="素材名"><button type="button" data-capp="remove-asset" data-name="${escapeHtml(name)}" aria-label="移除 ${escapeHtml(name)}">×</button></figure>`).join('') : '<p class="x-capp-tip">代码里用 SHEX.asset("素材名") 取图。没有图片可以不加。</p>'}</div>
        ${assets.length ? '<p class="x-capp-tip">图片下面的名字可以改，要和代码里 SHEX.asset("名字") 写的一致。添加或改名后记得点右上角“保存”。</p>' : ''}
        <input type="file" accept=".html,.htm,text/html" data-capp-file hidden>
        ${draft.isNew ? '' : '<div class="x-capp-row is-between"><button type="button" class="is-danger" data-capp="delete">删除这个 APP</button><button type="button" data-capp="clear-storage">清空它的小存档</button></div>'}
      </div>`, '<button type="button" data-capp="preview">预览</button><button type="button" class="is-primary" data-capp="save">保存</button>');
      updateSize();
      return;
    }
    overlay.innerHTML = shell('自定义 APP', `<div class="x-capp-body">
      <p class="x-capp-tip">在这里新建和管理你自己的 APP。保存后，它的图标会直接出现在 X世界的 APP 列表里。APP 运行在隔离空间里：可以读取当前世界和角色的公开信息用来展示，但不能修改 X世界。APP 按梦角分开，这里只显示当前梦角的 APP。目前只保存在这台设备上。</p>
      <div class="x-capp-grid">${view.apps.map(app => `<div class="x-capp-tile"><button type="button" data-capp="edit" data-id="${escapeHtml(app.id)}"><span class="x-capp-icon">${escapeHtml(app.icon || '✦')}</span><span>${escapeHtml(app.name || '未命名')}</span></button><button type="button" class="x-capp-edit" data-capp="edit" data-id="${escapeHtml(app.id)}" aria-label="编辑 ${escapeHtml(app.name || '')}">✎</button></div>`).join('')}
        <div class="x-capp-tile"><button type="button" data-capp="new"><span class="x-capp-icon is-new">＋</span><span>新建 APP</span></button></div></div>
    </div>`, '<button type="button" data-capp="open-handbook">创作手册</button>');
  }
  function updateSize() {
    const node = overlay?.querySelector('[data-capp-size]'); if (!node || !view.draft) return;
    const size = bytes(view.draft.code);
    node.textContent = `${(size / 1024).toFixed(1)} KB / 300 KB`; node.classList.toggle('is-over', size > MAX_CODE_BYTES);
  }
  function readDraft() {
    overlay?.querySelectorAll('[data-capp-field]').forEach(field => { view.draft[field.dataset.cappField] = field.value; });
    return view.draft;
  }
  function validate(draft) {
    if (!String(draft.name || '').trim()) return '请先给 APP 起个名字';
    if (!String(draft.code || '').trim()) return '请先粘贴或导入 APP 代码';
    if (bytes(draft.code) > MAX_CODE_BYTES) return 'APP 代码超过 300 KB，请精简后再保存';
    return '';
  }
  async function refresh() { view.apps = await listApps(); }
  async function act(action, target) {
    if (action === 'back') {
      if (view.direct) return close();
      if (view.page === 'run' && view.preview) { view.page = 'edit'; view.preview = false; }
      else if (view.page === 'handbook' && view.draft && view.returnTo === 'edit') view.page = 'edit';
      else if (view.page === 'list') return close();
      else { view.page = 'list'; view.draft = null; view.notice = ''; await refresh(); }
      return draw();
    }
    if (action === 'new') {
      if (!dreamId()) return toast('请先在 X世界选择一个梦角');
      if (view.apps.length >= MAX_APPS) return toast(`最多保存 ${MAX_APPS} 个 APP`);
      view.draft = { id: newId(), isNew: true, name: '', icon: '✦', code: '', assets: {}, storage: {}, createdAt: Date.now() }; view.page = 'edit'; view.notice = ''; return draw();
    }
    if (action === 'edit' || action === 'open') {
      const app = await getApp(target.dataset.id); if (!app) return toast('这个 APP 不见了，请刷新后再试');
      view.draft = { ...app, assets: { ...(app.assets || {}) } }; view.preview = false; view.notice = ''; view.page = action === 'open' ? 'run' : 'edit'; return draw();
    }
    if (action === 'open-handbook') {
      if (view.page === 'edit') readDraft();
      view.returnTo = view.page; view.page = 'handbook'; draw();
      if (!view.handbook) {
        try { view.handbook = (await (await fetch(HANDBOOK_URL)).text()).split('\n## 附：')[0].trim(); } catch (_) { view.handbook = '手册读取失败，请稍后再试。'; }
        const node = overlay?.querySelector('[data-capp-handbook]'); if (node) node.textContent = view.handbook;
      }
      return;
    }
    if (action === 'copy-handbook') {
      try { await navigator.clipboard.writeText(view.handbook || ''); toast('手册已复制，可以直接粘贴给 AI'); } catch (_) { toast('复制失败，请长按手册内容手动复制'); }
      return;
    }
    if (action === 'import') return overlay.querySelector('[data-capp-file]')?.click();
    if (action === 'add-asset') {
      readDraft();
      if (Object.keys(view.draft.assets).length >= MAX_ASSETS) return toast(`最多添加 ${MAX_ASSETS} 张图片`);
      if (typeof global.SHEXCustomAppHost?.pickAlbumImage !== 'function') return toast('相册暂时不可用');
      const url = await global.SHEXCustomAppHost.pickAlbumImage(); if (!url) return;
      try {
        const dataUrl = await imageToDataUrl(url);
        let name = `图片${Object.keys(view.draft.assets).length + 1}`; while (view.draft.assets[name]) name += '_';
        view.draft.assets[name] = dataUrl; view.notice = `已添加，代码里用 SHEX.asset("${name}") 取这张图`;
      } catch (error) { view.notice = error.message || '图片添加失败'; }
      return draw();
    }
    if (action === 'remove-asset') { readDraft(); delete view.draft.assets[target.dataset.name]; return draw(); }
    if (action === 'preview') {
      const draft = readDraft(), problem = validate({ ...draft, name: draft.name || '预览' }); if (problem) return toast(problem);
      view.preview = true; view.page = 'run'; return draw();
    }
    if (action === 'save') {
      const draft = readDraft(), problem = validate(draft); if (problem) return toast(problem);
      const { isNew, ...record } = draft; await putApp({ ...record, name: String(record.name).trim(), icon: String(record.icon || '✦').trim() || '✦' });
      view.draft.isNew = false; view.notice = '已保存，图标已放到 X世界的 APP 列表里'; await refresh(); void reloadTiles(); return draw();
    }
    if (action === 'clear-storage') {
      const app = await getApp(view.draft.id); if (app) await putApp({ ...app, storage: {} });
      view.draft.storage = {}; return toast('小存档已清空');
    }
    if (action === 'delete') {
      if (target.dataset.armed !== '1') { target.dataset.armed = '1'; target.textContent = '再点一次确认删除（无法找回）'; return; }
      await removeApp(view.draft.id); view.draft = null; view.page = 'list'; view.notice = '已删除'; await refresh(); void reloadTiles(); return draw();
    }
  }
  function mountOverlay() {
    close();
    overlay = document.createElement('section'); overlay.className = 'x-capp-overlay'; overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-label', '自定义 APP');
    overlay.addEventListener('click', event => {
      const target = event.target.closest?.('[data-capp]'); if (!target || !overlay.contains(target)) return;
      void act(target.dataset.capp, target).catch(error => toast(error?.message || '操作失败，请重试'));
    });
    overlay.addEventListener('input', event => { if (event.target.matches?.('[data-capp-field="code"]')) { view.draft.code = event.target.value; updateSize(); } });
    overlay.addEventListener('change', async event => {
      const input = event.target;
      if (input.matches?.('[data-capp-asset-name]')) { // 改素材名：代码里 SHEX.asset("名字") 用的就是这个名字
        const from = input.dataset.cappAssetName, to = String(input.value || '').trim();
        readDraft();
        if (!to || to === from || !view.draft.assets[from]) { input.value = from; return; }
        if (view.draft.assets[to]) { input.value = from; return toast(`已经有一张叫“${to}”的图片了`); }
        view.draft.assets = Object.fromEntries(Object.entries(view.draft.assets).map(([name, value]) => [name === from ? to : name, value]));
        view.notice = `已改名，代码里用 SHEX.asset("${to}") 取这张图`; return draw();
      } if (!input.matches?.('[data-capp-file]') || !input.files?.[0]) return;
      const file = input.files[0]; input.value = '';
      if (file.size > MAX_CODE_BYTES) return toast('这个文件超过 300 KB');
      readDraft(); view.draft.code = await file.text(); view.notice = `已导入 ${file.name}`; draw();
    });
    document.body.appendChild(overlay);
  }
  async function open() {
    if (!isAdmin() || !userId()) return;
    mountOverlay();
    view = { page: 'list', apps: [], draft: null, notice: '' };
    try { await refresh(); } catch (_) { view.notice = '本机存储不可用，无法保存 APP'; }
    draw();
  }

  // X世界 APP 列表里的入口：只有管理员账号看得到。
  document.addEventListener('click', event => {
    const tile = event.target.closest?.('[data-custom-app-tile]');
    if (tile) { event.preventDefault(); return void openDirect(tile.dataset.customAppTile); }
    if (event.target.closest?.('#showCustomApps')) { event.preventDefault(); void open(); }
  });
  let tileOwner = null;
  global.setInterval(() => {
    const owner = isAdmin() ? `${userId()}|${dreamId()}` : '';
    if (owner !== tileOwner) { tileOwner = owner; void reloadTiles(); } else syncTiles(); // 账号或梦角变了重新读；X世界首页被重画后把图标补回去
  }, 1500);
  global.SHEXCustomApps = Object.freeze({ open, close });
})(window);
