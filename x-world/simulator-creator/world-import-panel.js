(function initWorldImportPanel(global, factory) {
  const api = factory(global);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.SHEXWorldImportPanel = api;
})(typeof window !== 'undefined' ? window : globalThis, function createWorldImportPanelModule(global) {
  'use strict';

  const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

  function escapeHtml(value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function bytes(value) { return new TextEncoder().encode(String(value || '')).byteLength; }

  async function copyTextToClipboard(value) {
    try {
      if (global.navigator?.clipboard?.writeText) {
        await global.navigator.clipboard.writeText(value);
        return true;
      }
    } catch (_) {}
    const document = global.document;
    if (!document?.body) return false;
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    try {
      textarea.select();
      return Boolean(document.execCommand?.('copy'));
    } catch (_) {
      return false;
    } finally {
      textarea.remove();
    }
  }

  const TEXT_TRUNCATION_FIELDS = new Map([
    ['作品名称', { maximum:80 }], ['作品简介', { maximum:600 }], ['创作者备注', { maximum:1000 }],
    ['世界背景', { maximum:3000 }], ['开场白', { maximum:1200 }],
    ['地点名称', { maximum:100 }], ['地点简介', { maximum:600 }],
    ['世界内显示名', { maximum:80, ownerLabel:'角色' }], ['角色备注', { maximum:1500 }],
    ['变量展示名', { maximum:40 }], ['变量说明', { maximum:500 }],
    ['道具名称', { maximum:80 }], ['道具简介', { maximum:500 }],
    ['路线标题', { maximum:120 }], ['路线简介', { maximum:600 }],
    ['章节标题', { maximum:120 }], ['章节简介', { maximum:1000 }],
    ['阶段标题', { maximum:120 }], ['阶段简介', { maximum:1000 }],
    ['事件标题', { maximum:120 }], ['事件简介', { maximum:1000 }],
    ['导演目标', { maximum:2000 }], ['语气说明', { maximum:1500 }],
  ]);

  function compatibilityMessages(issues = []) {
    const source = Array.isArray(issues) ? issues : [];
    const truncationGroups = new Map();
    source.filter(issue => issue?.code === 'TEXT_TRUNCATED').forEach(issue => {
      const fieldLabel = String(issue?.fieldLabel || '');
      const field = TEXT_TRUNCATION_FIELDS.get(fieldLabel);
      if (!field || Number(issue?.maximum) !== field.maximum) return;
      const key = `${fieldLabel}\u0000${field.maximum}`;
      truncationGroups.set(key, { ...field, fieldLabel, count:(truncationGroups.get(key)?.count || 0) + 1 });
    });
    const messages = Array.from(truncationGroups.values()).map(group => (
      `${group.count} 个${group.ownerLabel ? `${group.ownerLabel}的` : ''}${group.fieldLabel}超过 ${group.maximum} 个字符，已自动截短至 ${group.maximum} 个字符`
    ));
    // X103：导入不再截短，超长文字完整保留；按字段合并提示“发布前需精简”。
    const overLimitGroups = new Map();
    source.filter(issue => issue?.code === 'TEXT_OVER_PUBLISH_LIMIT').forEach(issue => {
      const fieldLabel = String(issue?.fieldLabel || '');
      const field = TEXT_TRUNCATION_FIELDS.get(fieldLabel);
      if (!field || Number(issue?.maximum) !== field.maximum) return;
      const key = `${fieldLabel}\u0000${field.maximum}`;
      overLimitGroups.set(key, { ...field, fieldLabel, count:(overLimitGroups.get(key)?.count || 0) + 1 });
    });
    overLimitGroups.forEach(group => messages.push(
      `${group.count} 个${group.ownerLabel ? `${group.ownerLabel}的` : ''}${group.fieldLabel}超过 ${group.maximum} 个字符，已完整导入；发布前请在草稿里精简`
    ));
    const invalidWeightCount = source.filter(issue => issue?.code === 'EVENT_PROGRESS_WEIGHT_DEFAULTED').length;
    if (invalidWeightCount) messages.push(`${invalidWeightCount} 个事件的推进权重不符合当前规则，已自动调整为默认值 1`);
    source.filter(issue => !['TEXT_TRUNCATED', 'TEXT_OVER_PUBLISH_LIMIT', 'EVENT_PROGRESS_WEIGHT_DEFAULTED'].includes(issue?.code)).forEach(issue => {
      messages.push(issue?.message || '部分内容已跳过');
    });
    return messages;
  }

  function compatibilityNoticeMarkup(issues = []) {
    const messages = compatibilityMessages(issues);
    return messages.length
      ? `<details class="shex-world-import-compat"><summary>部分内容已自动调整</summary><ul>${messages.map(message => `<li>${escapeHtml(message)}</li>`).join('')}</ul></details>`
      : '';
  }

  function importReportMarkup(preview = {}) {
    const report = preview.importReport || {};
    const recognized = Number(report.recognizedCount || 0);
    const imported = Number(report.importedCount || 0);
    const skipped = Number(report.skippedCount || 0);
    const details = [
      ...(Array.isArray(report.issues) ? report.issues : []),
      ...(Array.isArray(preview.reviewWarnings) ? preview.reviewWarnings : []),
      ...(Array.isArray(preview.suggestions) ? preview.suggestions : []),
    ];
    const migrationMessages = [...new Set(details.filter(issue => issue?.code === 'CANDIDATE_POLICY_MIGRATED')
      .map(issue => String(issue.message || '旧版 AI 候选设置已迁移为当前支持的事件候选和变量候选。').trim()))];
    const migrationNotice = migrationMessages.map(message => `<p class="shex-world-import-compat" data-world-import-migration>${escapeHtml(message)}</p>`).join('');
    const notice = compatibilityNoticeMarkup(details.filter(issue => issue?.code !== 'CANDIDATE_POLICY_MIGRATED'));
    return `<div class="shex-world-import-result" data-world-import-result><span>已识别 ${recognized} 项</span><span>已导入 ${imported} 项</span><span>跳过 ${skipped} 项</span></div>${migrationNotice}${notice}${publishIssuesMarkup(preview.publishIssues)}`;
  }

  // X103：发布规则只提示，不拦导入；作者导入后在草稿里修改。
  function publishIssuesMarkup(issues = []) {
    const messages = [...new Set((Array.isArray(issues) ? issues : []).map(issue => String(issue?.message || '').trim()).filter(Boolean))];
    return messages.length
      ? `<details class="shex-world-import-compat" data-world-import-publish-issues open><summary>可以导入；发布前需在草稿里处理 ${messages.length} 项</summary><ul>${messages.map(message => `<li>${escapeHtml(message)}</li>`).join('')}</ul></details>`
      : '';
  }

  function createWorldImportPanel(options = {}) {
    const root = options.root;
    const isAdmin = options.isAdmin;
    const hasAccess = typeof options.hasAccess === 'function' ? options.hasAccess : isAdmin;
    const client = options.offlineClient;
    const createRequestId = typeof options.createRequestId === 'function'
      ? options.createRequestId
      : prefix => `${prefix}_${Date.now().toString(36)}`;
    if (!root || typeof hasAccess !== 'function' || !client || typeof client.inspectWorldImport !== 'function' || typeof client.confirmWorldImport !== 'function') {
      throw new Error('world import panel dependencies are required');
    }

    const state = {
      preview: null, receipt: null, sourceText: '', fileName: '', fileSize: 0,
      error: '', notice: '', busy: false, pendingConfirmation: false, confirmRequestId: '', generation: 0, mediaUrls: {}
    };

    function clearInspection({ keepFile = false } = {}) {
      state.preview = null;
      state.receipt = null;
      state.confirmRequestId = '';
      state.pendingConfirmation = false;
      state.busy = false;
      state.error = '';
      state.notice = '';
      if (!keepFile) {
        state.sourceText = '';
        state.fileName = '';
        state.fileSize = 0;
      }
      state.generation += 1;
    }

    function allowed() { return hasAccess() === true; }
    function notify(message) { if (message && typeof options.notify === 'function') options.notify(message); }
    function markIndependentPage(active) {
      root.closest?.('.shex-character-gallery')?.classList.toggle('is-world-creator-independent', active === true);
    }
    function formatFileSize(value) {
      const size = Math.max(0, Number(value || 0));
      if (!size) return '';
      if (size < 1024) return `${size} B`;
      if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
      return `${(size / (1024 * 1024)).toFixed(1)} MB`;
    }
    function mediaFileId(value) { return typeof value === 'string' ? String(value || '').trim() : String(value?.fileId || value?.fileID || '').trim(); }
    function issueList(issues = []) {
      return Array.isArray(issues) && issues.length
        ? `<ul class="shex-world-import-issues">${issues.map(issue => `<li data-world-import-issue>${escapeHtml(issue?.message || '导入内容需要修改')}</li>`).join('')}</ul>`
        : '';
    }
    function summaryMarkup(summary = {}) {
      const rows = [
        ['角色', summary.roleCount], ['章节', summary.chapterCount], ['阶段', summary.stageCount],
        ['随机事件数量', summary.randomEventCount], ['变量', summary.variableCount], ['块', summary.blockCount], ['字节', summary.byteCount]
      ];
      const promoId = mediaFileId(summary.coverAssetRef);
      const backgroundId = mediaFileId(summary.worldBackgroundAssetRef);
      const media = [['宣传主题图', promoId, 'landscape'], ['世界背景', backgroundId, 'portrait']]
        .filter(([, fileId]) => fileId)
        .map(([label, fileId, ratio]) => `<figure class="shex-world-import-media is-${ratio}">${state.mediaUrls[fileId] ? `<img src="${escapeHtml(state.mediaUrls[fileId])}" alt="${label}">` : '<span>图片已识别</span>'}<figcaption>${label}</figcaption></figure>`).join('');
      return `<div class="shex-world-import-overview"><h3>${escapeHtml(summary.title || '未命名世界')}</h3><p>${escapeHtml(summary.summary || '暂未填写简介')}</p>${media ? `<div class="shex-world-import-media-grid">${media}</div>` : ''}</div><dl class="shex-world-import-summary">${rows.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value ?? '—')}</dd></div>`).join('')}</dl>`;
    }
    function render() {
      if (!allowed()) { root.innerHTML = ''; return; }
      const fileInput = root.querySelector('[data-world-import-file]');
      fileInput?.remove();
      const preview = state.preview;
      const blocking = preview?.blockingIssues || [];
      const canConfirm = Boolean(preview?.previewId && preview?.contentHash && !blocking.length && !state.busy && !state.receipt);
      const selected = Boolean(state.fileName && state.sourceText);
      const sourceHint = state.fileName ? `${formatFileSize(state.fileSize)} · JSON 世界文件` : '支持 JSON 世界文件，最大 2MB';
      const sourceMarkup = `<div class="shex-world-import-cards">
        <section class="shex-world-import-contract-card" aria-labelledby="shex-world-import-contract-title"><span class="shex-world-import-card-icon" aria-hidden="true">✦</span><div class="shex-world-import-card-copy"><h3 id="shex-world-import-contract-title">模拟器导入合同</h3><p>把合同和你的设定一起发给 AI，让它帮你写出可导入的模拟器世界文件。</p></div><div class="shex-world-import-contract-actions"><a class="shex-world-import-download" data-world-import-download href="./x-world/simulator-creator/SHEX-world-simulator-import-contract.md?v=20261030-001746-x103-front-20" download="SHE.X模拟器导入合同.md">下载合同</a><button type="button" class="shex-world-import-copy" data-world-import-copy-contract>复制合同</button></div></section>
        <section class="shex-world-import-source" data-state="${selected ? 'selected' : 'empty'}" aria-labelledby="shex-world-import-file-title"><div class="shex-world-import-file-control">${fileInput ? '' : '<input id="shex-world-import-file-input" class="shex-world-import-native-file" type="file" accept=".json,application/json" data-world-import-file>'}</div><span class="shex-world-import-card-icon is-file" aria-hidden="true">⌁</span><div class="shex-world-import-card-copy"><h3 id="shex-world-import-file-title">选择世界文件</h3><p data-world-import-file-name>${state.fileName ? `${escapeHtml(state.fileName)} · ` : ''}${escapeHtml(sourceHint)}</p></div><div class="shex-world-import-file-actions"><button type="button" class="shex-world-import-choose" data-world-import-choose>${selected ? '更换文件' : '选择文件'}</button>${selected ? `<button type="button" class="shex-world-import-inspect" data-world-import-inspect ${state.busy ? 'disabled' : ''}>${state.busy ? '正在检查…' : '检查文件'}</button>` : ''}</div></section>
      </div>`;
      root.innerHTML = `<section class="shex-world-import-panel" data-world-import-panel aria-labelledby="shex-world-import-title">
        <header class="shex-world-import-head"><button type="button" data-world-import-close ${state.pendingConfirmation ? 'disabled' : ''} aria-label="返回创建世界">‹</button><div><h2 id="shex-world-import-title">${preview ? '世界导入预览' : options.targetDraftId ? '再次导入模拟器' : '导入已有世界'}</h2><p>${options.targetDraftId ? '确认后用新文件覆盖当前草稿内容。公开头像、背景、宣传图及已有美化不会被覆盖；旧发布版本不变。' : preview ? '确认内容无误后导入为可继续编辑的草稿。' : '选择世界文件，检查后即可导入为草稿。'}</p></div></header>
        ${preview ? `<section class="shex-world-import-preview" data-world-import-preview>${summaryMarkup(preview.normalizedSummary)}${importReportMarkup(preview)}${issueList(preview.blockingIssues)}</section><div class="shex-world-import-actions"><button type="button" data-world-import-reselect ${state.pendingConfirmation ? 'disabled' : ''}>重新选择</button><button type="button" class="primary" data-world-import-confirm ${canConfirm ? '' : 'disabled'}>${state.pendingConfirmation ? '重试确认结果' : options.targetDraftId ? '确认覆盖当前草稿' : '确认导入为草稿'}</button></div>` : sourceMarkup}
        <p class="shex-world-import-status" data-world-import-status data-state="${state.error ? 'blocking' : state.busy ? 'busy' : 'idle'}" role="status" aria-live="polite">${escapeHtml(state.error || (state.busy ? '正在检查…' : ''))}</p>
      </section>`;
      const fileSlot = root.querySelector('.shex-world-import-file-control');
      if (fileInput && fileSlot) fileSlot.appendChild(fileInput);
      root.querySelector('[data-world-import-choose]')?.addEventListener('click', () => {
        root.querySelector('[data-world-import-file]')?.click();
      });
      root.querySelector('[data-world-import-copy-contract]')?.addEventListener('click', () => void copyContract());
      root.querySelector('[data-world-import-close]')?.addEventListener('click', () => {
        if (state.busy || state.pendingConfirmation) return;
        close();
        options.onClose?.();
      });
      const currentFileInput = root.querySelector('[data-world-import-file]');
      if (currentFileInput && currentFileInput.dataset.worldImportBound !== 'true') {
        currentFileInput.dataset.worldImportBound = 'true';
        currentFileInput.addEventListener('change', event => void readFile(event.currentTarget.files?.[0]));
      }
      root.querySelector('[data-world-import-inspect]')?.addEventListener('click', () => void inspect());
      root.querySelector('[data-world-import-reselect]')?.addEventListener('click', () => { if (state.busy || state.pendingConfirmation) return; clearInspection(); state.sourceText = ''; render(); });
      root.querySelector('[data-world-import-confirm]')?.addEventListener('click', () => void confirm());
    }
    async function copyContract() {
      const button = root.querySelector('[data-world-import-copy-contract]');
      const url = root.querySelector('[data-world-import-download]')?.href;
      if (!button || !url || typeof global.fetch !== 'function') return;
      button.disabled = true;
      button.textContent = '复制中…';
      try {
        const contentPromise = global.fetch(url).then(async response => {
          if (!response.ok) throw new Error('合同读取失败');
          return response.text();
        });
        let copied = false;
        if (global.navigator?.clipboard?.write && global.ClipboardItem && global.Blob) {
          try {
            const item = new global.ClipboardItem({ 'text/plain': contentPromise.then(content => new global.Blob([content], { type: 'text/plain' })) });
            await global.navigator.clipboard.write([item]);
            copied = true;
          } catch (_) {}
        }
        if (!copied) {
          const content = await contentPromise;
          copied = Boolean(content.trim()) && await copyTextToClipboard(content);
        }
        if (!copied) throw new Error('合同复制失败');
        notify('合同全文已复制，可以直接粘贴给 AI');
        button.textContent = '已复制';
        global.setTimeout?.(() => { if (button.isConnected) button.textContent = '复制合同'; }, 1800);
      } catch (_) {
        button.textContent = '复制合同';
        notify('复制失败，请下载合同后发送给 AI');
      } finally {
        button.disabled = false;
      }
    }
    async function readFile(file) {
      if (!file) return;
      clearInspection();
      state.fileName = String(file.name || '世界文件.json').trim() || '世界文件.json';
      state.fileSize = Number(file.size || 0);
      render();
      const generation = state.generation;
      if (file.size > MAX_IMPORT_BYTES) { state.error = '文件超过 2MB 上限'; render(); return; }
      try {
        const text = await file.text();
        if (generation !== state.generation) return;
        state.sourceText = text; state.error = ''; notify('文件已选择');
      } catch (_) { if (generation === state.generation) state.error = '无法读取文件'; }
      render();
    }
    async function inspect() {
      if (!allowed() || state.busy) return;
      const text = String(root.querySelector('[data-world-import-json]')?.value || state.sourceText || '');
      clearInspection({ keepFile: true });
      state.sourceText = text;
      state.error = '';
      state.notice = '';
      if (!text.trim()) { state.error = '请先选择世界文件'; render(); return; }
      if (bytes(text) > MAX_IMPORT_BYTES) { state.error = '内容超过 2MB 上限'; render(); return; }
      try { JSON.parse(text); } catch (_) { state.error = '文件内容格式不正确'; render(); return; }
      state.busy = true;
      render();
      const generation = state.generation;
      try {
        const preview = await client.inspectWorldImport({ jsonText: text, ...(options.targetDraftId ? { targetDraftId: options.targetDraftId, baseRevision: options.baseRevision } : {}) });
        if (generation !== state.generation) return;
        if (options.targetDraftId && (preview.targetDraftId !== options.targetDraftId || preview.baseRevision !== options.baseRevision)) throw new Error('当前服务端尚未支持再次导入。请先更新世界创作服务后重试，原草稿没有被覆盖。');
        state.preview = preview;
        if (Array.isArray(preview?.blockingIssues) && preview.blockingIssues.length) notify('文件存在需要修改的问题');
        else if (Array.isArray(preview?.publishIssues) && preview.publishIssues.length) notify('检查完成，可以导入；发布前需在草稿里修改');
        else notify('检查完成');
        void hydratePreviewMedia();
      } catch (error) { if (generation === state.generation) { state.error = error?.message || '导入检查失败'; notify('检查失败，请稍后重试'); } }
      finally { if (generation === state.generation) { state.busy = false; render(); } }
    }
    async function confirm() {
      if (!allowed() || state.busy || state.receipt || !state.preview || (state.preview.blockingIssues || []).length) return;
      state.busy = true; state.error = ''; state.notice = '';
      state.confirmRequestId ||= createRequestId('world_import_confirm');
      render();
      const generation = state.generation;
      try {
        const input = { previewId: state.preview.previewId, contentHash: state.preview.contentHash, requestId: state.confirmRequestId };
        const pendingResult = error => error?.commitState !== 'not_committed' && (error?.commitState === 'unknown'
          || !error?.code || /NETWORK|TIMEOUT|RESULT_PENDING/.test(String(error.code)) || error.code === 'WORLD_CREATOR_FAILED');
        let result;
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            result = await client.confirmWorldImport(input);
            if (options.targetDraftId && (result?.draftId !== options.targetDraftId || !Number.isSafeInteger(result?.draftRevision) || result.draftRevision < options.baseRevision
              || !Array.isArray(result?.blockHeads) || !result.blockHeads.length || !result.blockHeads.every(head => typeof head?.blockKey === 'string' && head.blockKey && typeof head.blockType === 'string' && head.blockType
                && Number.isSafeInteger(head.revision) && head.revision > 0 && /^[a-f0-9]{64}$/.test(String(head.contentHash || ''))))) {
              throw Object.assign(new Error('导入结果暂时无法确认'), { code: 'SIMULATOR_REIMPORT_RESULT_PENDING', commitState: 'unknown' });
            }
            break;
          } catch (error) {
            if (!options.targetDraftId || (!pendingResult(error) && !state.pendingConfirmation)) { state.pendingConfirmation = false; throw error; }
            state.pendingConfirmation = true;
            if (attempt === 1) throw Object.assign(new Error('保存结果暂时无法确认，请点击“重试确认结果”继续核对；请勿重新选择文件或重复新建作品。'), { code: 'SIMULATOR_REIMPORT_RESULT_PENDING' });
          }
        }
        state.pendingConfirmation = false;
        if (generation !== state.generation) return;
        state.receipt = result; notify(options.targetDraftId ? '新版内容已覆盖当前草稿，公开图片和已有美化已保留' : '世界草稿已创建');
        if (typeof options.onDraftCreated === 'function') options.onDraftCreated({ ...result });
      } catch (error) { if (generation === state.generation) state.error = error?.message || '草稿创建失败'; }
      finally { if (generation === state.generation) { state.busy = false; render(); } }
    }
    async function hydratePreviewMedia() {
      if (options.targetDraftId || typeof options.resolveMedia !== 'function' || !state.preview) return;
      const summary = state.preview.normalizedSummary || {};
      const refs = [mediaFileId(summary.coverAssetRef), mediaFileId(summary.worldBackgroundAssetRef)].filter(Boolean);
      const missing = refs.filter(fileId => !state.mediaUrls[fileId]);
      if (!missing.length) return;
      const generation = state.generation;
      try {
        Object.assign(state.mediaUrls, await options.resolveMedia(missing) || {});
        if (generation === state.generation) render();
      } catch (_) {}
    }
    function open() { clearInspection(); markIndependentPage(true); render(); return allowed(); }
    function close() { if (state.pendingConfirmation) return false; clearInspection(); markIndependentPage(false); root.innerHTML = ''; return true; }
    function dispose() { close(); }
    return Object.freeze({ open, close, dispose, getState: () => ({ ...state, preview: state.preview && { ...state.preview }, receipt: state.receipt && { ...state.receipt } }) });
  }

  return Object.freeze({ MAX_IMPORT_BYTES, compatibilityMessages, compatibilityNoticeMarkup, importReportMarkup, publishIssuesMarkup, createWorldImportPanel });
});
