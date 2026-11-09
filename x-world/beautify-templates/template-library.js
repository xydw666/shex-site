(function initBeautifyTemplateLibrary(global) {
  'use strict';

  const FUNCTION_NAME = 'shexBeautifyTemplate';
  const PAGE_SIZE = 20;
  const CACHE_TTL_MS = 60 * 1000;
  const pageCache = new Map();
  const detailCache = new Map();
  const previewUrlCache = new Map();
  let instanceSequence = 0;

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[character]));
  }

  function hostLabel(host) {
    return host === 'host_stage' ? 'X世界' : 'X传讯';
  }

  function isThemeTemplate(template) {
    return template?.templateKind === 'chat_theme_tokens';
  }

  function previewFileId(template) {
    const ref = template?.previewAssetRef;
    return String(ref?.fileId || ref?.fileID || '').trim();
  }

  function cacheGet(cache, key) {
    const entry = cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.at > CACHE_TTL_MS) {
      cache.delete(key);
      return null;
    }
    return entry.value;
  }

  function cacheSet(cache, key, value) {
    cache.set(key, { at: Date.now(), value });
    if (cache.size > 80) cache.delete(cache.keys().next().value);
    return value;
  }

  async function cloudRun(operation) {
    const bridge = global.SHEXCloudBaseClient;
    if (!bridge?.getClient || !bridge?.run) throw new Error('云服务暂时不可用，请刷新页面后重试。');
    await bridge.getClient();
    return bridge.run(operation, { retryAuthOnce: true });
  }

  async function callTemplateAction(action, payload = {}) {
    const user = global.SHEXAuth?.current?.();
    if (!user?.userId || !user?.sessionToken) throw new Error('请先登录后查看模板。');
    let response;
    try {
      response = await cloudRun((api) => api.app.callFunction({
        name: FUNCTION_NAME,
        data: { action, ...payload, userId: user.userId, sessionToken: user.sessionToken },
        timeout: 15000
      }));
    } catch (error) {
      if (/FUNCTION_NOT_FOUND/i.test(`${error?.code || ''} ${error?.message || ''}`)) {
        throw new Error('模板库服务尚未部署，请稍后再来。');
      }
      throw new Error(error?.message || '模板读取失败，请稍后重试。');
    }
    const result = response?.result || response || {};
    if (result.ok !== true && result.success !== true) {
      throw new Error(result.message || result.detail || '模板读取失败，请稍后重试。');
    }
    return result;
  }

  function rememberPreviewUrls(urls) {
    Object.entries(urls || {}).forEach(([fileId, url]) => {
      if (/^cloud:\/\//i.test(fileId) && /^https:\/\//i.test(String(url))) cacheSet(previewUrlCache, fileId, url);
    });
  }

  function resolvePreviewImages(scope) {
    const images = Array.from(scope.querySelectorAll('[data-template-preview-file]'))
      .filter((image) => !image.dataset.templatePreviewResolved);
    images.forEach((image) => {
      const fileId = String(image.dataset.templatePreviewFile || '').trim();
      if (!fileId) return;
      const cachedUrl = cacheGet(previewUrlCache, fileId);
      image.addEventListener('error', () => {
        previewUrlCache.delete(fileId);
        image.parentElement?.classList.add('bty-template-image-error');
      }, { once: true });
      if (cachedUrl) {
        image.src = cachedUrl;
        image.dataset.templatePreviewResolved = 'true';
        return;
      }
      image.parentElement?.classList.add('bty-template-image-error');
      image.dataset.templatePreviewResolved = 'true';
    });
  }

  function imageMarkup(template, className = 'bty-template-preview') {
    const fileId = previewFileId(template);
    if (!fileId) return '<span class="bty-template-preview bty-template-preview-empty" aria-label="暂无效果图"><span>暂无效果图</span></span>';
    const src = cacheGet(previewUrlCache, fileId) || '';
    return `<span class="${className}"><img${src ? ` src="${escapeHtml(src)}"` : ''} data-template-preview-file="${escapeHtml(fileId)}" alt="${escapeHtml(template.name || '模板')}效果预览" loading="lazy"></span>`;
  }

  function createLibrary(container) {
    const id = `bty-template-library-${++instanceSequence}`;
    const state = {
      host: 'host_chat', search: '', page: 1, hasMore: false, loading: false,
      items: [], detail: null, detailLoading: false, error: '', timer: 0,
      requestId: 0, detailRequestId: 0
    };

    function shell() {
      container.innerHTML = `<section class="bty-template-library" data-template-library-root="${id}" aria-label="高级美化模板库">
        <div class="bty-template-library-heading"><div><span class="bty-template-eyebrow">SHE.X BEAUTIFY</span><h2>美化模板库</h2><p>看看效果图，读完说明后复制需要的模板内容。</p></div></div>
        <div class="bty-template-controls">
          <div class="bty-template-host-tabs" role="tablist" aria-label="选择模板所属位置">
            <button type="button" role="tab" data-template-host="host_chat" aria-selected="true">X传讯</button>
            <button type="button" role="tab" data-template-host="host_stage" aria-selected="false">X世界</button>
          </div>
          <label class="bty-template-search"><span aria-hidden="true">⌕</span><input type="search" maxlength="80" autocomplete="off" placeholder="搜索模板名称" aria-label="搜索模板名称" data-template-search><button type="button" data-template-search-clear aria-label="清空搜索" hidden>×</button></label>
        </div>
        <div class="bty-template-alert" data-template-alert role="status" aria-live="polite" hidden></div>
        <div data-template-list-view><div class="bty-template-grid" data-template-grid aria-live="polite"></div><button type="button" class="bty-template-more" data-template-more hidden>查看更多模板</button></div>
        <div data-template-detail-view hidden></div>
      </section>`;
      const root = container.querySelector(`[data-template-library-root="${id}"]`);
      root.addEventListener('click', onClick);
      root.querySelector('[data-template-search]').addEventListener('input', onSearchInput);
      root.querySelector('[data-template-search]').addEventListener('compositionstart', () => { state.composing = true; });
      root.querySelector('[data-template-search]').addEventListener('compositionend', (event) => {
        state.composing = false;
        onSearchInput(event);
      });
      root.querySelector('[data-template-more]').addEventListener('click', () => void loadPage(true));
      return root;
    }

    const root = shell();

    function setAlert(message = '', isError = false) {
      const alert = root.querySelector('[data-template-alert]');
      alert.hidden = !message;
      alert.textContent = message;
      alert.classList.toggle('is-error', isError);
    }

    function cardMarkup(item) {
      return `<button type="button" class="bty-template-card" data-template-open="${escapeHtml(item.templateId)}" aria-label="查看${escapeHtml(item.name || '未命名模板')}详情">
        ${imageMarkup(item)}<span class="bty-template-card-copy"><strong>${escapeHtml(item.name || '未命名模板')}</strong><span class="bty-template-host-label">所属：${hostLabel(item.host)}${isThemeTemplate(item) ? ' · 整套主题' : ''}</span></span><span class="bty-template-card-arrow" aria-hidden="true">›</span>
      </button>`;
    }

    function renderList() {
      root.querySelector('[data-template-list-view]').hidden = Boolean(state.detail || state.detailLoading);
      root.querySelector('[data-template-detail-view]').hidden = !state.detail && !state.detailLoading;
      root.querySelectorAll('[data-template-host]').forEach((button) => {
        button.setAttribute('aria-selected', String(button.dataset.templateHost === state.host));
      });
      const grid = root.querySelector('[data-template-grid]');
      if (state.loading && !state.items.length) {
        grid.innerHTML = '<div class="bty-template-state"><span class="bty-template-spinner" aria-hidden="true"></span><p>正在读取模板…</p></div>';
      } else if (!state.items.length) {
        grid.innerHTML = `<div class="bty-template-state"><span class="bty-template-state-icon" aria-hidden="true">✦</span><strong>${state.search ? '没有找到这个名称的模板' : '这里还没有上架模板'}</strong><p>${state.search ? '试试缩短关键词，或检查一下输入。' : '管理员上架模板后，会显示在这里。'}</p></div>`;
      } else {
        grid.innerHTML = state.items.map(cardMarkup).join('');
      }
      const more = root.querySelector('[data-template-more]');
      more.hidden = !state.hasMore;
      more.disabled = state.loading;
      more.textContent = state.loading ? '正在读取…' : '查看更多模板';
      root.querySelector('[data-template-search-clear]').hidden = !state.search;
      void resolvePreviewImages(grid);
      renderDetail();
    }

    function renderDetail() {
      const view = root.querySelector('[data-template-detail-view]');
      if (state.detailLoading) {
        view.innerHTML = '<div class="bty-template-state"><span class="bty-template-spinner" aria-hidden="true"></span><p>正在打开模板…</p></div>';
        return;
      }
      const item = state.detail;
      if (!item) { view.replaceChildren(); return; }
      const interaction = String(item.interaction || '');
      const theme = isThemeTemplate(item);
      view.innerHTML = `<article class="bty-template-detail">
        <button type="button" class="bty-template-back" data-template-back><span aria-hidden="true">‹</span> 返回模板列表</button>
        ${imageMarkup(item, 'bty-template-detail-preview')}
        <header class="bty-template-detail-heading"><span class="bty-template-detail-host">${hostLabel(item.host)}${theme ? ' · 整套主题' : ''}</span><h2>${escapeHtml(item.name || '未命名模板')}</h2></header>
        <section class="bty-template-guide"><h3><span aria-hidden="true">✦</span> 使用说明</h3><div>${escapeHtml(item.usageGuide || '管理员暂未填写使用说明。').replace(/\n/g, '<br>')}</div></section>
        ${theme ? `<p class="bty-template-theme-hint">点击“复制完整主题”，前往 X传讯 → 高级美化 → 整套主题导入 / 导出，粘贴一次后识别，应用到预览再保存。${Object.hasOwn(item, 'hostCss') ? '完整内容包含主题设置和 Host CSS。' : '这是旧版主题，仅包含主题设置，会保留你已有的 Host CSS。'}不包含组件、图片或字体文件。</p>${codeSection('整套主题内容', 'themeJson', item.themeJson)}${String(item.hostCss || '').trim() ? codeSection('Host CSS', 'hostCss', item.hostCss) : ''}` : `${codeSection('HTML', 'html', item.html)}
        ${codeSection('CSS', 'css', item.css)}
        ${interaction.trim() ? codeSection('Interaction', 'interaction', interaction) : ''}`}
        <button type="button" class="bty-template-copy-all" data-template-copy-all>${theme ? '复制完整主题' : '复制完整模板'}</button>
      </article>`;
      void resolvePreviewImages(view);
    }

    function codeSection(title, part, value) {
      return `<section class="bty-template-code-section"><div class="bty-template-code-heading"><h3>${title}</h3><button type="button" data-template-copy="${part}">复制${title}</button></div><pre><code>${escapeHtml(value || '')}</code></pre></section>`;
    }

    function cacheKey(page) {
      return `${state.host}\u0000${state.search}\u0000${page}`;
    }

    async function loadPage(append = false) {
      if (state.loading) return;
      const requestedPage = append ? state.page + 1 : 1;
      if (!append) {
        state.page = 1;
        state.items = [];
        state.hasMore = false;
        state.error = '';
      }
      const requestId = ++state.requestId;
      const key = cacheKey(requestedPage);
      const cached = cacheGet(pageCache, key);
      if (cached) {
        rememberPreviewUrls(cached.previewUrls);
        state.page = requestedPage;
        state.items = append ? state.items.concat(cached.items) : cached.items.slice();
        state.hasMore = cached.hasMore;
        state.loading = false;
        setAlert();
        renderList();
        return;
      }
      state.loading = true;
      setAlert();
      renderList();
      try {
        const result = await callTemplateAction('listTemplates', {
          host: state.host,
          search: state.search,
          page: requestedPage,
          pageSize: PAGE_SIZE
        });
        if (requestId !== state.requestId) return;
        const items = Array.isArray(result.items) ? result.items : [];
        const page = { items, hasMore: result.hasMore === true, previewUrls: result.previewUrls || {} };
        rememberPreviewUrls(page.previewUrls);
        cacheSet(pageCache, key, page);
        state.page = requestedPage;
        state.items = append ? state.items.concat(items) : items;
        state.hasMore = page.hasMore;
        state.error = '';
        setAlert();
      } catch (error) {
        if (requestId !== state.requestId) return;
        state.error = error?.message || '模板读取失败，请稍后重试。';
        setAlert(state.error, true);
      } finally {
        if (requestId === state.requestId) {
          state.loading = false;
          renderList();
        }
      }
    }

    async function openDetail(templateId) {
      const key = String(templateId || '').trim();
      if (!key) return;
      const cached = cacheGet(detailCache, key);
      if (cached) {
        if (cached.previewUrl) rememberPreviewUrls({ [previewFileId(cached.template)]: cached.previewUrl });
        state.detail = cached.template;
        state.detailLoading = false;
        setAlert();
        renderList();
        root.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      const requestId = ++state.detailRequestId;
      state.detail = null;
      state.detailLoading = true;
      setAlert();
      renderList();
      try {
        const result = await callTemplateAction('getTemplate', { templateId: key });
        if (requestId !== state.detailRequestId) return;
        if (!result.template) throw new Error('模板内容暂时无法读取，请稍后重试。');
        if (result.previewUrl) rememberPreviewUrls({ [previewFileId(result.template)]: result.previewUrl });
        cacheSet(detailCache, key, { template: result.template, previewUrl: result.previewUrl || '' });
        state.detail = result.template;
        state.detailLoading = false;
        setAlert();
      } catch (error) {
        if (requestId !== state.detailRequestId) return;
        state.detailLoading = false;
        setAlert(error?.message || '模板读取失败，请稍后重试。', true);
      }
      renderList();
      if (state.detail) root.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function onSearchInput(event) {
      if (state.composing) return;
      state.search = String(event.target.value || '').trim();
      global.clearTimeout(state.timer);
      state.timer = global.setTimeout(() => {
        state.detail = null;
        state.detailLoading = false;
        state.requestId += 1;
        state.loading = false;
        void loadPage(false);
      }, 300);
    }

    async function copy(value, button) {
      const text = String(value || '');
      if (!text) return;
      try {
        if (!global.navigator?.clipboard?.writeText) throw new Error('clipboard-unavailable');
        await global.navigator.clipboard.writeText(text);
        const oldText = button.textContent;
        button.textContent = '已复制';
        button.classList.add('is-copied');
        global.setTimeout(() => {
          if (button.isConnected) {
            button.textContent = oldText;
            button.classList.remove('is-copied');
          }
        }, 1500);
      } catch (_) {
        setAlert('复制没有成功，请在代码框中长按或选中内容复制。', true);
      }
    }

    function fullTemplateText(item) {
      if (isThemeTemplate(item)) {
        const theme = JSON.parse(item.themeJson);
        return JSON.stringify({ ...theme, ...(Object.hasOwn(item, 'hostCss') ? { hostCss:String(item.hostCss || '') } : {}) }, null, 2);
      }
      const blocks = [['HTML', item.html], ['CSS', item.css], ['Interaction', item.interaction]]
        .filter(([, value]) => String(value || '').trim());
      return blocks.map(([label, value]) => `【${label}】\n${String(value)}`).join('\n\n');
    }

    function onClick(event) {
      const hostButton = event.target.closest('[data-template-host]');
      if (hostButton) {
        if (hostButton.dataset.templateHost === state.host) return;
        global.clearTimeout(state.timer);
        state.host = hostButton.dataset.templateHost;
        state.detail = null;
        state.detailLoading = false;
        state.requestId += 1;
        state.loading = false;
        void loadPage(false);
        return;
      }
      if (event.target.closest('[data-template-search-clear]')) {
        const input = root.querySelector('[data-template-search]');
        input.value = '';
        state.search = '';
        state.detail = null;
        state.detailLoading = false;
        global.clearTimeout(state.timer);
        state.requestId += 1;
        state.loading = false;
        void loadPage(false);
        input.focus();
        return;
      }
      const openButton = event.target.closest('[data-template-open]');
      if (openButton) { void openDetail(openButton.dataset.templateOpen); return; }
      if (event.target.closest('[data-template-back]')) {
        state.detailRequestId += 1;
        state.detail = null;
        state.detailLoading = false;
        setAlert();
        renderList();
        return;
      }
      const copyButton = event.target.closest('[data-template-copy]');
      if (copyButton && state.detail) {
        void copy(state.detail[copyButton.dataset.templateCopy], copyButton);
        return;
      }
      const copyAllButton = event.target.closest('[data-template-copy-all]');
      if (copyAllButton && state.detail) void copy(fullTemplateText(state.detail), copyAllButton);
    }

    void loadPage(false);
    return Object.freeze({ refresh: () => loadPage(false) });
  }

  function mount(container) {
    if (!container || typeof container.querySelector !== 'function') throw new Error('模板库挂载位置不可用');
    return createLibrary(container);
  }

  global.SHEXBeautifyTemplateLibrary = Object.freeze({ mount, PAGE_SIZE });
})(typeof window !== 'undefined' ? window : globalThis);
