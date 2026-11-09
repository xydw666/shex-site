(() => {
  'use strict';

  const definitions = new Map();
  const requests = new Map();
  const inFlight = new Set();
  let adapter = null;

  function register(definition = {}) {
    const featureKind = String(definition.featureKind || '').trim();
    if (!featureKind) throw new Error('status featureKind is required');
    definitions.set(featureKind, Object.freeze({ ...definition, featureKind }));
  }

  function configure(nextAdapter = {}) {
    adapter = nextAdapter;
  }

  function requireAdapter() {
    if (!adapter) throw new Error('SHEX status adapter is not configured');
    return adapter;
  }

  function requireDefinition(featureKind) {
    const definition = definitions.get(featureKind);
    if (!definition) throw new Error(`SHEX status definition is missing: ${featureKind}`);
    return definition;
  }

  function pickBranchState(pool = []) {
    const stateItem = pool[Math.floor(Math.random() * pool.length)];
    const text = stateItem.lines[Math.floor(Math.random() * stateItem.lines.length)];
    return [stateItem.value, text.replace(/。+$/g, '')];
  }

  function renderStatusMarkup(dream, definition) {
    const api = requireAdapter();
    const name = api.identity(dream).taName || 'TA';
    const escape = api.escapeHtml;
    const date = new Date();
    const dateLabel = `${date.getFullYear()}年${String(date.getMonth() + 1).padStart(2, '0')}月${String(date.getDate()).padStart(2, '0')}日`;
    const rows = definition.rows(name, pickBranchState);
    return `
      <div class="x-letter-status-card ${definition.cardClass}">
        <div class="x-letter-card-sky" aria-hidden="true">
          <span></span><span></span><span></span>
        </div>
        <div class="x-letter-status-head">
          <small>${definition.englishLabel} · ${dateLabel}</small>
          <div class="x-letter-status-title">${escape(definition.title(name))}</div>
          <p>${definition.subtitle}</p>
        </div>
        <div class="x-letter-status-grid">
          ${rows.map(([icon, label, value, text]) => `
            <div class="x-letter-status-item">
              <span class="x-letter-status-icon">${icon}</span>
              <small>${escape(label)}</small>
              <strong>${escape(value)}</strong>
              <p>${escape(text)}</p>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  function readDailyStatus(dreamId, definition) {
    const api = requireAdapter();
    const date = api.todayKey();
    const paid = api.readPaidEntry(dreamId, date, definition.featureKind);
    if (paid?.html) return { html: paid.html, paid, legacy: null };
    const legacy = api.readLegacyEntry(dreamId, definition.featureKind);
    return legacy?.date === date && legacy?.html
      ? { html: legacy.html, paid: null, legacy }
      : { html: '', paid: null, legacy: null };
  }

  function logEnergy(payload) {
    requireAdapter().debugLog('log', '[X_LETTER_ENERGY_DEBUG]', {
      cost: 2,
      beforeBalance: '',
      afterBalance: '',
      deductStarted: false,
      deductSuccess: false,
      skippedDeduct: false,
      skippedReason: '',
      ...payload
    });
  }

  async function ensureDailyStatus(dream, definition) {
    const api = requireAdapter();
    if (!dream?.id) return '';
    const featureKind = definition.featureKind;
    const date = api.todayKey();
    const dailyKey = `${featureKind}_${date}`;
    const cached = readDailyStatus(dream.id, definition);
    const businessKey = api.businessKey(featureKind, dream.id, date);
    if (cached.html) {
      api.showDiagnostic(definition.label, '未发起请求，命中本地缓存', definition.actionType, businessKey, dream.id, featureKind);
      if (cached.paid?.html) {
        api.writeLegacyEntry(dream.id, featureKind, cached.html);
      } else {
        await api.savePaidEntry(dream.id, featureKind, {
          html: cached.html,
          result: cached.html,
          date,
          createdAt: Date.now(),
          businessKey
        });
      }
      logEnergy({
        kind: definition.legacyKind,
        dailyKey,
        hasCachedMessage: true,
        alreadyPaidToday: true,
        skippedDeduct: true,
        skippedReason: 'cached_message'
      });
      return cached.html;
    }

    if (requests.has(businessKey)) {
      api.showDiagnostic(definition.label, '未新发起请求，同一请求正在进行', definition.actionType, businessKey, dream.id, featureKind);
      return requests.get(businessKey);
    }
    if (inFlight.has(businessKey)) {
      api.showDiagnostic(definition.label, '未新发起请求，同一请求正在进行', definition.actionType, businessKey, dream.id, featureKind);
      api.showToast('正在生成中，请稍候');
      return '';
    }

    const request = (async () => {
      inFlight.add(businessKey);
      try {
        logEnergy({
          kind: definition.legacyKind,
          dailyKey,
          hasCachedMessage: false,
          alreadyPaidToday: false,
          deductStarted: true
        });
        await api.consumeEnergy(
          definition.label,
          api.energyCost(definition.actionType, 2),
          definition.actionType,
          businessKey,
          dream.id,
          featureKind
        );
        const html = renderStatusMarkup(dream, definition);
        api.writeLegacyEntry(dream.id, featureKind, html);
        await api.savePaidEntry(dream.id, featureKind, {
          html,
          result: html,
          date,
          createdAt: Date.now(),
          businessKey
        });
        logEnergy({
          kind: definition.legacyKind,
          dailyKey,
          hasCachedMessage: false,
          alreadyPaidToday: false,
          deductStarted: true,
          deductSuccess: true
        });
        return html;
      } catch (error) {
        console.error('[X_STATUS_ENERGY_ERROR]', {
          kind: definition.legacyKind,
          cost: 2,
          step: 'consumeFeatureEnergy',
          rawError: error
        });
        const message = String(error?.message || error || '');
        api.showToast(/X能量不足|ENERGY_NOT_ENOUGH/i.test(message)
          ? 'X能量不足，暂时无法查看'
          : 'X能量更新有点慢，请稍后再试');
        return '';
      } finally {
        inFlight.delete(businessKey);
        requests.delete(businessKey);
      }
    })();
    requests.set(businessKey, request);
    return request;
  }

  function install(featureKind) {
    const api = requireAdapter();
    const definition = requireDefinition(featureKind);
    const panel = api.getPanel(definition.pageKey);
    const content = panel?.querySelector('[data-status-page-content]');
    const dream = api.currentDream();
    if (!panel || !content) return;
    if (!dream) {
      content.innerHTML = '<div class="x-status-page-message">请先选择梦角</div>';
      return;
    }
    const dreamId = dream.id;
    const cached = readDailyStatus(dreamId, definition).html;
    content.innerHTML = cached || '<div class="x-status-page-message">正在连接另一端…</div>';
    void ensureDailyStatus(dream, definition).then((html) => {
      if (api.currentDream()?.id !== dreamId) return;
      content.innerHTML = html || '<div class="x-status-page-message">暂时无法读取，请稍后再试</div>';
    });
  }

  window.SHEXStatusCore = {
    readCached:(dreamId,featureKind='hisStatus')=>{const definition=definitions.get(featureKind);return definition&&adapter?readDailyStatus(dreamId,definition).html:'';},
    configure,
    install,
    register
  };
})();
