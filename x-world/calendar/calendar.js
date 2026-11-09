(() => {
  'use strict';

  const CALENDAR_SCRIPT_URL = document.currentScript?.src || './x-world/calendar/calendar.js';
  const CALENDAR_ASSET_BASE = new URL('./assets/', CALENDAR_SCRIPT_URL).href;
  const assetUrl = name => `${CALENDAR_ASSET_BASE}${name}`;

  const MOODS = Object.freeze([
    { id: 'happy', label: '开心', src: assetUrl('mood-happy.jpg') },
    { id: 'calm', label: '平静', src: assetUrl('mood-calm.jpg') },
    { id: 'shy', label: '害羞', src: assetUrl('mood-shy.jpg') },
    { id: 'miss', label: '想念', src: assetUrl('mood-miss.jpg') },
    { id: 'angry', label: '生气', src: assetUrl('mood-angry.jpg') },
    { id: 'tired', label: '疲惫', src: assetUrl('mood-tired.jpg') },
    { id: 'expect', label: '期待', src: assetUrl('mood-expect.jpg') },
    { id: 'anxious', label: '焦虑', src: assetUrl('mood-anxious.jpg') },
    { id: 'sad', label: '难过', src: assetUrl('mood-sad.jpg') }
  ]);
  const PARTNER_MOOD_WEIGHTS = Object.freeze({
    happy: 15,
    calm: 18,
    shy: 14,
    miss: 12,
    angry: 6,
    tired: 8,
    expect: 15,
    anxious: 6,
    sad: 6
  });
  const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
  const HEART_FILL = ['0110110','1111111','1111111','0111110','0011100','0001000'];
  const HEART_OUTLINE = ['0110110','1001001','1000001','0100010','0010100','0001000'];
  const MODE_META = {
    overview: { label: '总览', icon: '◆', add: '' },
    mood: { label: '心情日历', icon: '●', add: '记录心情' },
    period: { label: '经期日历', icon: '♡', add: '记录实际经期' },
    plan: { label: '计划日历', icon: '▣', add: '添加记录' }
  };
  const EDITABLE_AUTHORITY_STATES = new Set(['authoritative_ready', 'empty_ready', 'legacy_bootstrap_ready']);
  const MUTATION_SELECTOR = [
    '[data-open-modal]',
    '[data-open-dream-plan]',
    '[data-confirm-dream-plan]',
    '[data-edit-period]',
    '[data-pick-mood]',
    '[data-toggle-plan]',
    '[data-delete-plan]',
    '[data-delete-anniversary]',
    '[data-delete-period]'
  ].join(',');

  const pad = value => String(value).padStart(2, '0');
  const dateKey = (year, month, day) => `${year}-${pad(month + 1)}-${pad(day)}`;
  const parseKey = key => {
    const [year, month, day] = String(key).split('-').map(Number);
    return { year, month: month - 1, day };
  };
  const addDays = (key, amount) => {
    const value = parseKey(key);
    const date = new Date(value.year, value.month, value.day + amount, 12);
    return dateKey(date.getFullYear(), date.getMonth(), date.getDate());
  };
  const between = (key, start, end) => key >= start && key <= end;
  const daysBetween = (start, end) => Math.round((new Date(`${end}T12:00:00`) - new Date(`${start}T12:00:00`)) / 86400000);
  const average = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  const moodById = id => MOODS.find(item => item.id === id) || MOODS[0];
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const cloneValue = value => JSON.parse(JSON.stringify(value));

  function moodFace(id, options = {}) {
    const mood = moodById(id);
    return `<img class="mood-face${options.mini ? ' is-mini' : ''}${options.partner ? ' is-partner' : ''}" src="${mood.src}" alt="${escapeHtml(mood.label)}">`;
  }

  function heartMarkup(kind = 'actual') {
    const bits = kind === 'predicted' ? HEART_OUTLINE : HEART_FILL;
    return `<span class="heart-pixels is-${kind}" role="img" aria-label="${kind === 'predicted' ? '预计经期' : '实际经期'}">${bits.join('').split('').map(bit => `<i class="${bit === '1' ? 'is-on' : ''}"></i>`).join('')}</span>`;
  }

  function notebookMarkup(done = false) {
    return `<span class="pixel-notebook${done ? ' is-done' : ''}" role="img" aria-label="${done ? '已完成计划' : '计划'}"></span>`;
  }

  function anniversaryMarkup() {
    return `<span class="record-anniversary-icon" role="img" aria-label="纪念日"><img class="record-pixel-icon is-anniversary" src="${assetUrl('anniversary-icon.png')}" alt=""></span>`;
  }

  function planMarkup(done = false) {
    return `<span class="record-plan-icon${done ? ' is-done' : ''}" role="img" aria-label="${done ? '已完成计划' : '计划'}"><img class="record-pixel-icon is-plan" src="${assetUrl('plan-icon.png')}" alt="">${done ? '<i>✓</i>' : ''}</span>`;
  }

  const CLOUD_MOTIF = ['0000001110000000','0000010001000000','0000100000100000','0011100000111000','0100000000000100','1100000000000110','1000010001000010','1000000110000010','0100000000000100','0011111111111000'];

  function pixelMotif(name) {
    if (name === 'cloud') return `<span class="pixel-motif is-cloud" aria-hidden="true">${CLOUD_MOTIF.join('').split('').map(bit => `<i class="${bit === '1' ? 'is-on' : ''}"></i>`).join('')}</span>`;
    return `<span class="pixel-motif is-${name}" aria-hidden="true"><img src="${assetUrl(`month-${name}.png`)}" alt=""></span>`;
  }

  function modeIconMarkup(mode) {
    return `<span class="mode-choice-icon is-${mode}" aria-hidden="true"><i></i><i></i><i></i><i></i></span>`;
  }

  function seededIndex(seed, length) {
    let hash = 2166136261;
    for (let index = 0; index < seed.length; index += 1) {
      hash ^= seed.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    const roll = (hash >>> 0) % 100;
    let cumulative = 0;
    const id = MOODS.find((mood) => {
      cumulative += Number(PARTNER_MOOD_WEIGHTS[mood.id] || 0);
      return roll < cumulative;
    })?.id || 'happy';
    return Math.max(0, MOODS.findIndex(item => item.id === id)) % length;
  }

  function createDemoData(today) {
    return {
      dreams: [
        { id: 'dream-qiyu', name: '祁煜' },
        { id: 'dream-qinche', name: '秦彻' }
      ],
      moods: { 'dream-qiyu': {}, 'dream-qinche': {} },
      periodActual: [],
      periodPredicted: null,
      plans: { 'dream-qiyu': [], 'dream-qinche': [] },
      anniversaries: { 'dream-qiyu': [], 'dream-qinche': [] }
    };
  }

  function createEmptyData(dream = {}) {
    const id = String(dream.id || 'dream-default');
    return {
      dreams: [{ id, name: String(dream.name || 'TA') }],
      moods: { [id]: {} },
      periodActual: [],
      periodPredicted: null,
      plans: { [id]: [] },
      anniversaries: { [id]: [] }
    };
  }

  function loadData(storageKey, fallback) {
    if (!storageKey) return fallback;
    try {
      const value = JSON.parse(localStorage.getItem(storageKey) || 'null');
      return value && typeof value === 'object' ? value : fallback;
    } catch (_) {
      return fallback;
    }
  }

  class CalendarDemo {
    constructor(root, options = {}) {
      this.root = root;
      this.demo = options.demo !== false;
      const liveNow = new Date();
      const fallbackToday = this.demo ? '2026-08-07' : dateKey(liveNow.getFullYear(), liveNow.getMonth(), liveNow.getDate());
      const now = parseKey(options.today || fallbackToday);
      this.today = dateKey(now.year, now.month, now.day);
      this.viewYear = now.year;
      this.viewMonth = now.month;
      this.selectedDate = this.today;
      this.mode = 'overview';
      this.modeMenuOpen = false;
      this.storageKey = String(options.storageKey || '');
      this.ownerUserId = String(options.ownerUserId || (this.demo ? 'demo' : 'local'));
      this.ownerAwaitingDream = false;
      this.managedLocalPersistence = options.managedLocalPersistence === true;
      this.authorityState = this.demo ? 'authoritative_ready' : 'preview_readonly';
      this.authorityMessage = '';
      this.onChange = typeof options.onChange === 'function' ? options.onChange : null;
      this.onBeforeMutation = typeof options.onBeforeMutation === 'function' ? options.onBeforeMutation : null;
      this.onDreamPlanPermission = typeof options.onDreamPlanPermission === 'function' ? options.onDreamPlanPermission : null;
      this.onAuthorityRetry = typeof options.onAuthorityRetry === 'function' ? options.onAuthorityRetry : null;
      this.partnerMoodDates = new Set(Array.isArray(options.partnerMoodDates) ? options.partnerMoodDates : []);
      const dream = options.dream
        ? { ...options.dream, hasPersona: options.dream.hasPersona === true }
        : { id: 'dream-qiyu', name: '祁煜', hasPersona: this.demo };
      this.dreamId = String(dream.id || 'dream-default');
      const fallbackData = this.demo ? createDemoData(this.today) : createEmptyData(dream);
      this.data = options.initialData || options.data || loadData(this.storageKey, fallbackData);
      this.pickerYear = this.viewYear;
      this.modalMode = '';
      this.editingPeriodId = '';
      this.dreamPlanBusy = false;
      this.toastTimer = 0;
      this.ensureDream(dream);
      this.data.periodActual = (Array.isArray(this.data.periodActual) ? this.data.periodActual : []).map((item, index) => ({ ...item, id: item.id || `period-${index + 1}` }));
      this.prunePartnerMoods();
      this.ensurePartnerMood(this.selectedDate);
      this.refreshPeriodPrediction();
      this.render();
      this.bind();
    }

    canMutate() {
      return this.demo || EDITABLE_AUTHORITY_STATES.has(this.authorityState);
    }

    authorityNotice() {
      if (this.canMutate()) return '';
      if (this.authorityMessage) return this.authorityMessage;
      if (this.authorityState === 'loading') return '正在核对云端日历，暂时只能查看';
      if (this.authorityState === 'load_failed_readonly') return '云端日历暂时没有加载成功，请重试后再编辑';
      return '云端日历尚未确认，暂时只能查看';
    }

    setAuthorityState(state, options = {}) {
      this.authorityState = String(state || 'preview_readonly');
      this.authorityMessage = String(options.message || '');
      this.root?.setAttribute?.('data-calendar-authority-state', this.authorityState);
      this.root?.classList?.toggle?.('is-calendar-readonly', !this.canMutate());
      if (options.render !== false) this.render();
      return this;
    }

    guardMutation() {
      if (this.canMutate()) return true;
      this.toast(this.authorityNotice());
      return false;
    }

    prepareMutation(operation) {
      if (!this.guardMutation()) return null;
      if (typeof this.onBeforeMutation !== 'function') return operation;
      try {
        const result = this.onBeforeMutation(operation);
        if (result === false || result?.ok === false) {
          this.toast(result?.message || '这次修改暂时不能安全保存，请稍后重试');
          return null;
        }
        return result?.operation || operation;
      } catch (error) {
        this.toast(error?.message || '这次修改暂时不能安全保存，请稍后重试');
        return null;
      }
    }

    resetOwner(options = {}) {
      window.clearTimeout(this.toastTimer);
      this.ownerUserId = String(options.ownerUserId || 'local');
      this.storageKey = String(options.storageKey || '');
      this.managedLocalPersistence = options.managedLocalPersistence === true;
      this.onChange = typeof options.onChange === 'function' ? options.onChange : null;
      this.onBeforeMutation = typeof options.onBeforeMutation === 'function' ? options.onBeforeMutation : null;
      this.onDreamPlanPermission = typeof options.onDreamPlanPermission === 'function' ? options.onDreamPlanPermission : null;
      this.onAuthorityRetry = typeof options.onAuthorityRetry === 'function' ? options.onAuthorityRetry : null;
      this.partnerMoodDates = new Set(Array.isArray(options.partnerMoodDates) ? options.partnerMoodDates : []);
      this.ownerAwaitingDream = options.deferDream === true;
      const dream = this.ownerAwaitingDream ? { id: 'dream-default', name: 'TA', hasPersona: false } : (options.dream || { id: 'dream-default', name: 'TA', hasPersona: false });
      this.dreamId = String(dream.id || 'dream-default');
      this.data = this.ownerAwaitingDream ? createEmptyData(dream) : (options.initialData || options.data || loadData(this.storageKey, createEmptyData(dream)));
      this.authorityState = 'preview_readonly';
      this.authorityMessage = '';
      this.modalMode = '';
      this.editingPeriodId = '';
      this.dreamPlanBusy = false;
      this.ensureDream(dream);
      this.data.periodActual = (Array.isArray(this.data.periodActual) ? this.data.periodActual : []).map((item, index) => ({ ...item, id: item.id || `period-${index + 1}` }));
      this.prunePartnerMoods();
      this.ensurePartnerMood(this.selectedDate);
      this.refreshPeriodPrediction();
      this.render();
      return this;
    }

    ensureDream(dream = {}) {
      if (!Array.isArray(this.data.dreams)) this.data.dreams = [];
      let current = this.data.dreams.find(item => item.id === this.dreamId);
      if (!current) {
        current = { id: this.dreamId, name: String(dream.name || 'TA') };
        this.data.dreams.push(current);
      } else if (dream.name) current.name = String(dream.name);
      if (!this.data.moods || typeof this.data.moods !== 'object') this.data.moods = {};
      if (!this.data.plans || typeof this.data.plans !== 'object') this.data.plans = {};
      if (!this.data.anniversaries || typeof this.data.anniversaries !== 'object') this.data.anniversaries = {};
      if (!this.data.dreamPlanSettings || typeof this.data.dreamPlanSettings !== 'object') this.data.dreamPlanSettings = {};
      this.data.moods[this.dreamId] ||= {};
      this.data.plans[this.dreamId] ||= [];
      this.data.anniversaries[this.dreamId] ||= [];
      this.data.dreamPlanSettings[this.dreamId] ||= { enabled: false };
      current.hasPersona = dream.hasPersona === true;
    }

    setDream(dream = {}) {
      const nextId = String(dream.id || this.dreamId || 'dream-default');
      if (this.ownerAwaitingDream) {
        this.ownerAwaitingDream = false;
        this.dreamId = nextId;
        this.data = loadData(this.storageKey, createEmptyData(dream));
        this.data.periodActual = (Array.isArray(this.data.periodActual) ? this.data.periodActual : []).map((item, index) => ({ ...item, id: item.id || `period-${index + 1}` }));
        this.ensureDream(dream);
        this.prunePartnerMoods();
        this.ensurePartnerMood(this.selectedDate);
        this.refreshPeriodPrediction();
        this.render();
        return this;
      }
      const current = this.data.dreams?.find(item => item.id === nextId);
      const changed = nextId !== this.dreamId
        || (dream.name && dream.name !== current?.name)
        || (dream.hasPersona === true) !== (current?.hasPersona === true);
      this.dreamId = nextId;
      this.ensureDream(dream);
      if (!changed) return this;
      this.ensurePartnerMood(this.selectedDate);
      this.persist({ notify: false });
      this.render();
      return this;
    }

    setPartnerMoodDates(dates = []) {
      this.partnerMoodDates = new Set(Array.isArray(dates) ? dates : []);
      const changed = this.prunePartnerMoods();
      this.partnerMoodDates.forEach(key => this.ensurePartnerMood(key));
      if (changed) this.persist({ notify: false });
      this.render();
      return this;
    }

    prunePartnerMoods() {
      const rows = this.dreamMoods();
      let changed = false;
      Object.keys(rows).forEach(key => {
        if (rows[key]?.partner && !this.partnerMoodDates.has(key)) {
          delete rows[key].partner;
          changed = true;
        }
        if (rows[key] && !rows[key].partner && !rows[key].mine) delete rows[key];
      });
      return changed;
    }

    persist(options = {}) {
      if (this.storageKey && !this.managedLocalPersistence) {
        try { localStorage.setItem(this.storageKey, JSON.stringify(this.data)); } catch (_) {}
      }
      if (options.notify !== false && this.onChange) Promise.resolve(this.onChange(this.data)).catch(() => {});
    }

    replaceData(data, dream = {}) {
      if (!data || typeof data !== 'object') return this;
      this.data = data;
      this.data.periodActual = (Array.isArray(this.data.periodActual) ? this.data.periodActual : []).map((item, index) => ({ ...item, id: item.id || `period-${index + 1}` }));
      this.ensureDream(dream);
      this.prunePartnerMoods();
      this.partnerMoodDates.forEach(key => this.ensurePartnerMood(key));
      this.refreshPeriodPrediction();
      this.persist({ notify: false });
      this.render();
      return this;
    }

    dream() { return this.data.dreams.find(item => item.id === this.dreamId) || this.data.dreams[0]; }
    dreamMoods() { return this.data.moods[this.dreamId] || (this.data.moods[this.dreamId] = {}); }
    dreamPlans() { return this.data.plans[this.dreamId] || (this.data.plans[this.dreamId] = []); }
    dreamAnniversaries() { return this.data.anniversaries[this.dreamId] || (this.data.anniversaries[this.dreamId] = []); }
    dreamPlanSetting() { return this.data.dreamPlanSettings[this.dreamId] || (this.data.dreamPlanSettings[this.dreamId] = { enabled: false }); }

    calculatePeriodPrediction() {
      const history = [...this.data.periodActual].filter(item => item.start).sort((a, b) => a.start.localeCompare(b.start));
      if (!history.length) return null;
      const durations = history.map(item => Number(item.duration) || daysBetween(item.start, item.end) + 1).filter(value => value >= 1 && value <= 10).slice(-6);
      const duration = Math.max(2, Math.min(10, Math.round(average(durations) || 5)));
      const lastStart = history[history.length - 1].start;
      if (history.length === 1) {
        const cycleLength = 28;
        const start = addDays(lastStart, cycleLength);
        return { start, end: addDays(start, duration - 1), duration, cycleLength, variation: 3, samples: 0, basis: 'default' };
      }
      const intervals = [];
      for (let index = 1; index < history.length; index += 1) {
        const interval = daysBetween(history[index - 1].start, history[index].start);
        if (interval >= 15 && interval <= 60) intervals.push(interval);
      }
      const recentIntervals = intervals.slice(-6);
      if (!recentIntervals.length) return null;
      const cycleLength = Math.round(average(recentIntervals));
      const deviation = Math.sqrt(average(recentIntervals.map(value => (value - cycleLength) ** 2)));
      const start = addDays(lastStart, cycleLength);
      return { start, end: addDays(start, duration - 1), duration, cycleLength, variation: Math.max(1, Math.round(deviation)), samples: recentIntervals.length, basis: 'history' };
    }

    refreshPeriodPrediction() {
      this.data.periodPredicted = this.calculatePeriodPrediction();
    }

    ensurePartnerMood(key) {
      if (!this.partnerMoodDates.has(key)) return;
      const rows = this.dreamMoods();
      if (!rows[key]) rows[key] = {};
      if (!rows[key].partner) rows[key].partner = MOODS[seededIndex(`${this.dreamId}:${key}`, MOODS.length)].id;
    }

    anniversaryForDate(key) {
      const current = parseKey(key);
      return this.dreamAnniversaries().filter(item => {
        const original = parseKey(item.date);
        const targetDay = original.month === 1 && original.day === 29 && new Date(current.year, 1, 29).getMonth() !== 1 ? 28 : original.day;
        return original.month === current.month && targetDay === current.day;
      }).map(item => ({ ...item, years: Math.max(0, current.year - parseKey(item.date).year) }));
    }

    periodKind(key) {
      if (this.data.periodActual.some(item => between(key, item.start, item.end))) return 'actual';
      if (this.data.periodPredicted && between(key, this.data.periodPredicted.start, this.data.periodPredicted.end)) return 'predicted';
      return '';
    }

    dayIcons(key) {
      if (this.mode === 'overview') {
        const hasMood = Boolean(this.dreamMoods()[key]?.mine || this.dreamMoods()[key]?.partner);
        const hasPeriod = Boolean(this.periodKind(key));
        const hasPlan = Boolean(this.anniversaryForDate(key).length || this.dreamPlans().some(item => item.date === key));
        if (!hasMood && !hasPeriod && !hasPlan) return '';
        const labels = [hasMood ? '心情' : '', hasPeriod ? '经期' : '', hasPlan ? '计划' : ''].filter(Boolean).join('、');
        return `<span class="overview-marks" role="img" aria-label="${labels}">${hasMood ? '<i class="is-mood"></i>' : ''}${hasPeriod ? '<i class="is-period"></i>' : ''}${hasPlan ? '<i class="is-plan"></i>' : ''}</span>`;
      }
      if (this.mode === 'mood') {
        const value = this.dreamMoods()[key];
        if (!value) return '';
        return `${value.partner ? moodFace(value.partner, { mini: true, partner: true }) : ''}${value.mine ? moodFace(value.mine, { mini: true }) : ''}`;
      }
      if (this.mode === 'period') {
        const kind = this.periodKind(key);
        return kind ? heartMarkup(kind) : '';
      }
      const anniversary = this.anniversaryForDate(key)[0];
      const plans = this.dreamPlans().filter(item => item.date === key);
      return `${anniversary ? anniversaryMarkup() : ''}${plans.length ? planMarkup(plans.every(item => item.done)) : ''}`;
    }

    calendarDays() {
      const firstWeekday = new Date(this.viewYear, this.viewMonth, 1, 12).getDay();
      const daysInMonth = new Date(this.viewYear, this.viewMonth + 1, 0, 12).getDate();
      const previousDays = new Date(this.viewYear, this.viewMonth, 0, 12).getDate();
      const total = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;
      const rows = [];
      for (let index = 0; index < total; index += 1) {
        let year = this.viewYear;
        let month = this.viewMonth;
        let day = index - firstWeekday + 1;
        let outside = false;
        if (day < 1) { outside = true; month -= 1; day = previousDays + day; }
        else if (day > daysInMonth) { outside = true; month += 1; day -= daysInMonth; }
        if (month < 0) { month = 11; year -= 1; }
        if (month > 11) { month = 0; year += 1; }
        rows.push({ year, month, day, outside, key: dateKey(year, month, day) });
      }
      return rows;
    }

    moodDetailBody() {
      const value = this.dreamMoods()[this.selectedDate] || {};
      return `<div class="mood-detail-grid">
        ${value.partner ? `<div class="mood-detail-card">${moodFace(value.partner, { partner: true })}<div><small>${escapeHtml(this.dream().name)}的心情</small><strong>${moodById(value.partner).label}</strong></div></div>` : '<div class="mood-detail-card is-empty">和他聊天后会看到他的心情</div>'}
        ${value.mine ? `<div class="mood-detail-card">${moodFace(value.mine)}<div><small>我的心情</small><strong>${moodById(value.mine).label}</strong></div></div>` : '<div class="mood-detail-card is-empty">今天还没有记录我的心情</div>'}
      </div>`;
    }

    periodDetailBody() {
      const actual = this.data.periodActual.find(item => between(this.selectedDate, item.start, item.end));
      const predicted = this.data.periodPredicted && between(this.selectedDate, this.data.periodPredicted.start, this.data.periodPredicted.end);
      if (actual) {
        const dayNumber = Math.max(1, Math.round((new Date(`${this.selectedDate}T12:00:00`) - new Date(`${actual.start}T12:00:00`)) / 86400000) + 1);
        const extras = [actual.flow ? `经量${actual.flow}` : '', ...(actual.symptoms || []), actual.note || ''].filter(Boolean).join(' · ');
        return `<div class="detail-list"><div class="detail-row is-period-record">${heartMarkup('actual')}<div class="detail-row-copy"><small>实际经期</small><strong>经期第 ${dayNumber} 天${extras ? `<span class="period-detail-extras">${escapeHtml(extras)}</span>` : ''}</strong></div><button class="detail-edit" type="button" data-edit-period="${escapeHtml(actual.id)}">修改</button></div></div>`;
      }
      if (predicted) {
        const basis = this.data.periodPredicted.basis === 'default' ? '首次按 28 天周期初步估算' : `历史平均周期 ${this.data.periodPredicted.cycleLength} 天`;
        return `<div class="detail-list"><div class="detail-row is-period-record">${heartMarkup('predicted')}<div class="detail-row-copy"><small>预计经期</small><strong>${basis} · 波动约 ±${this.data.periodPredicted.variation} 天 · 预计持续 ${this.data.periodPredicted.duration} 天</strong></div></div></div>`;
      }
      return '<p class="detail-empty">这一天没有经期记录</p>';
    }

    planDetailBody() {
      const anniversaries = this.anniversaryForDate(this.selectedDate);
      const plans = this.dreamPlans().filter(item => item.date === this.selectedDate).sort((a,b) => a.time.localeCompare(b.time));
      return `<div class="detail-list">
        ${anniversaries.map(item => `<div class="detail-row is-anniversary">${anniversaryMarkup()}<div class="detail-row-copy"><small>${escapeHtml(item.type)} · 每年重复</small><strong>${escapeHtml(item.title)}${item.years ? ` ${item.years}周年` : ''}</strong></div><div class="detail-row-actions"><button class="is-delete" type="button" data-delete-anniversary="${escapeHtml(item.id)}">删除</button></div></div>`).join('')}
        ${plans.map(item => {
          const ownerLabel = item.owner === 'dream' ? `${this.dream().name}的计划` : item.owner === 'together' ? '我们的计划' : '我的计划';
          const meta = [ownerLabel, item.time, item.type].filter(Boolean).map(escapeHtml).join(' · ');
          return `<div class="detail-row is-plan${item.done ? ' is-done' : ''}">${planMarkup(item.done)}<div class="detail-row-copy"><small>${meta}</small><strong>${escapeHtml(item.title)}</strong>${item.note ? `<span class="plan-detail-note">${escapeHtml(item.note)}</span>` : ''}</div><div class="detail-row-actions"><button class="is-delete" type="button" data-delete-plan="${escapeHtml(item.id)}">删除</button><button type="button" data-toggle-plan="${escapeHtml(item.id)}">${item.done ? '恢复' : '完成'}</button></div></div>`;
        }).join('')}
        ${!anniversaries.length && !plans.length ? '<p class="detail-empty">这一天还没有纪念日或计划</p>' : ''}
      </div>`;
    }

    detailMarkup() {
      const label = `${this.viewMonth + 1}月${parseKey(this.selectedDate).day}日`;
      let body = '';
      if (this.mode === 'overview') {
        body = `<div class="overview-detail">
          <section class="overview-detail-section is-mood"><h3><i></i>心情</h3>${this.moodDetailBody()}</section>
          <section class="overview-detail-section is-period"><h3><i></i>经期</h3>${this.periodDetailBody()}</section>
          <section class="overview-detail-section is-plan"><h3><i></i>计划与纪念日</h3>${this.planDetailBody()}</section>
        </div>`;
      } else if (this.mode === 'mood') body = this.moodDetailBody();
      else if (this.mode === 'period') body = this.periodDetailBody();
      else body = this.planDetailBody();
      const canAddMood = this.mode !== 'mood' || this.selectedDate <= this.today;
      const addButton = this.mode === 'overview' || !canAddMood ? '' : `<button class="detail-add" type="button" data-open-modal>${MODE_META[this.mode].add}</button>`;
      const dreamPlanButton = this.mode === 'plan' ? `<button class="dream-plan-permission${this.dreamPlanSetting().enabled ? ' is-enabled' : ''}" type="button" data-open-dream-plan>${this.dreamPlanSetting().enabled ? 'TA可添加' : '允许TA添加'}</button>` : '';
      const actions = addButton || dreamPlanButton ? `<div class="detail-head-actions">${addButton}${dreamPlanButton}</div>` : '';
      const detailTitle = this.mode === 'mood' ? `${label} · ${escapeHtml(this.dream().name)}` : label;
      return `<div class="detail-head"><div><h2>${detailTitle}</h2></div>${actions}</div><div class="detail-content">${body}</div>`;
    }

    modalMarkup() {
      const formMode = this.modalMode || this.mode;
      const title = formMode === 'mood'
        ? '记录我的心情'
        : formMode === 'period'
          ? '记录实际经期'
          : formMode === 'dream-permission'
            ? '允许TA添加计划'
            : '添加计划或纪念日';
      let content = '';
      if (formMode === 'dream-permission') {
        const enabled = this.dreamPlanSetting().enabled === true;
        content = `<div class="form-intro is-plan"><b>✦</b><div><strong>${enabled ? 'TA可以添加计划' : '允许TA添加计划'}</strong></div></div><button class="calendar-submit is-plan" type="button" data-confirm-dream-plan="${enabled ? 'false' : 'true'}">${enabled ? '关闭TA添加' : '允许TA添加'}</button>`;
      } else if (formMode === 'mood') {
        const current = this.dreamMoods()[this.selectedDate]?.mine || '';
        const moodPrompt = this.selectedDate === this.today ? '选一个最接近此刻的心情' : '补记这一天最接近的心情';
        content = `<div class="form-intro is-mood"><b>✦</b><div><strong>${this.viewMonth + 1}月${parseKey(this.selectedDate).day}日</strong><span>${moodPrompt}</span></div></div><div class="mood-picker">${MOODS.map(mood => `<button type="button" class="${current === mood.id ? 'is-selected' : ''}" data-pick-mood="${mood.id}">${moodFace(mood.id)}<span>${mood.label}</span></button>`).join('')}</div><p class="modal-note">${escapeHtml(this.dream().name)}的心情只会在当天与TA说过话后出现，用户不能修改。</p>`;
      } else if (formMode === 'period') {
        const editing = this.data.periodActual.find(item => item.id === this.editingPeriodId) || null;
        const suggestedDuration = this.data.periodPredicted?.duration || 5;
        const period = editing || { start: this.selectedDate, duration: suggestedDuration, flow: '适中', symptoms: [], note: '' };
        content = `<div class="form-intro is-period"><b>♡</b><div><strong>${editing ? '修改这次经期记录' : '记下这次开始的第一天'}</strong><span>结束日期由预计持续天数自动计算</span></div></div><form class="calendar-form" data-period-form><div class="form-split"><label class="form-field"><span>开始日期</span><input name="start" type="date" value="${escapeHtml(period.start)}" required></label><label class="form-field"><span>预计持续</span><div class="duration-input"><input name="duration" type="number" min="2" max="10" value="${Number(period.duration) || suggestedDuration}" required><b>天</b></div></label></div><fieldset class="form-fieldset"><legend>今天的经量</legend><div class="form-choice-row is-three">${['偏少','适中','偏多'].map(item => `<label><input type="radio" name="flow" value="${item}" ${period.flow === item ? 'checked' : ''}><span>${item}</span></label>`).join('')}</div></fieldset><fieldset class="form-fieldset"><legend>身体感觉（可多选）</legend><div class="form-chip-grid">${['腹痛','疲惫','头痛','腰酸','腹胀','情绪波动'].map(item => `<label><input type="checkbox" name="symptoms" value="${item}" ${(period.symptoms || []).includes(item) ? 'checked' : ''}><span>${item}</span></label>`).join('')}</div></fieldset><label class="form-field"><span>想记一点什么</span><textarea name="note" placeholder="例如：今天需要早点休息……">${escapeHtml(period.note || '')}</textarea></label><div class="period-form-actions"><button class="calendar-submit is-period" type="submit">保存</button>${editing ? `<button class="calendar-delete" type="button" data-delete-period="${escapeHtml(editing.id)}">删除</button>` : ''}</div></form><p class="modal-note">第一次记录会先按 28 天周期作初步估算；从第二次开始，按两次开始日之间的间隔计算，并使用最近最多 6 个周期的平均值预测。预测仅供生活记录，不用于避孕或医疗判断。</p>`;
      } else {
        content = `<div class="form-intro is-plan"><b>✎</b><div><strong>留下一件值得期待的事</strong><span>计划和纪念日放在同一天也可以</span></div></div><form class="calendar-form" data-plan-form><fieldset class="form-fieldset"><legend>记录类型</legend><div class="form-choice-row"><label><input type="radio" name="recordType" value="plan" checked><span>计划</span></label><label><input type="radio" name="recordType" value="anniversary"><span>纪念日</span></label></div></fieldset><label class="form-field"><span>标题</span><input name="title" placeholder="一起看电影" required></label><div class="form-split"><label class="form-field"><span>日期</span><input name="date" type="date" value="${this.selectedDate}" required></label><label class="form-field"><span>时间（可选）</span><input name="time" type="time" value="20:00"></label></div><label class="form-field"><span>分类</span><select name="type"><option>普通计划</option><option selected>约会计划</option><option>想和TA完成的事情</option><option>恋爱纪念日</option><option>第一次见面</option><option>生日</option><option>自定义纪念日</option></select></label><label class="form-field"><span>备注（可选）</span><textarea name="note" placeholder="写下一点想记住的细节……"></textarea></label><button class="calendar-submit is-plan" type="submit">保存记录</button></form><p class="modal-note">纪念日会每年重复，并自动计算周年。</p>`;
      }
      return `<section class="calendar-modal" data-modal hidden><div class="calendar-modal-card" role="dialog" aria-modal="true" aria-labelledby="calendarModalTitle"><div class="modal-head"><div><small>✦ 日历记录</small><h3 id="calendarModalTitle">${title}</h3></div><button class="modal-close" type="button" data-close-modal aria-label="关闭">×</button></div>${content}</div></section>`;
    }

    monthPickerMarkup() {
      return `<section class="calendar-month-picker" data-month-picker hidden>
        <div class="month-picker-year"><button type="button" data-picker-year="-1" aria-label="上一年">−</button><strong data-picker-year-label>${this.pickerYear}年</strong><button type="button" data-picker-year="1" aria-label="下一年">＋</button></div>
        <div class="month-picker-grid">${Array.from({ length: 12 }, (_, month) => `<button type="button" data-picker-month="${month}" class="${this.pickerYear === this.viewYear && month === this.viewMonth ? 'is-current' : ''}">${month + 1}月</button>`).join('')}</div>
        <button class="month-picker-close" type="button" data-close-picker>取消</button>
      </section>`;
    }

    render() {
      const month = `${this.viewYear}.${pad(this.viewMonth + 1)}`;
      const calendarDays = this.calendarDays();
      calendarDays.filter(day => !day.outside).forEach(day => this.ensurePartnerMood(day.key));
      this.root.classList.add('shex-calendar-demo');
      this.root.setAttribute?.('data-calendar-authority-state', this.authorityState);
      this.root.classList.toggle?.('is-calendar-readonly', !this.canMutate());
      this.root.innerHTML = `
        <header class="calendar-demo-topbar">
          <div class="calendar-mode-switcher">
            <button class="calendar-mode-trigger" type="button" data-mode-toggle aria-expanded="${this.modeMenuOpen ? 'true' : 'false'}"><i class="mode-select-pixel" aria-hidden="true"></i><span>切换日历</span><strong>${modeIconMarkup(this.mode)}${MODE_META[this.mode].label}</strong><b class="mode-select-arrow" aria-hidden="true"></b></button>
            <div class="calendar-mode-menu" data-mode-menu${this.modeMenuOpen ? '' : ' hidden'}>${Object.entries(MODE_META).map(([key, meta]) => `<button type="button" data-mode-choice="${key}" class="${key === this.mode ? 'is-selected' : ''}">${modeIconMarkup(key)}<span>${meta.label}</span>${key === this.mode ? '<b>✓</b>' : ''}</button>`).join('')}</div>
          </div>
        </header>
        ${this.canMutate() ? '' : `<aside class="calendar-authority-notice" role="status"><span>${escapeHtml(this.authorityNotice())}</span>${this.authorityState === 'load_failed_readonly' && this.onAuthorityRetry ? '<button type="button" data-calendar-retry>重新加载</button>' : ''}</aside>`}
        <section class="pixel-calendar" aria-label="日历 Demo">
          <header class="calendar-heading"><button class="month-nav is-previous" type="button" data-month="-1" aria-label="上个月">${pixelMotif('cloud')}</button><button class="calendar-month-title" type="button" data-open-picker aria-label="选择年份和月份"><small>✦ OUR LITTLE DAYS ✦</small><strong>${month}</strong></button><button class="month-nav is-next" type="button" data-month="1" aria-label="下个月">${pixelMotif('cat')}</button></header>
          ${this.monthPickerMarkup()}
          <div class="calendar-grid">${WEEKDAYS.map(day => `<div class="calendar-weekday">${day}</div>`).join('')}${calendarDays.map(day => `<button type="button" class="calendar-day${day.outside ? ' is-outside' : ''}${day.key === this.selectedDate ? ' is-selected' : ''}${day.key === this.today ? ' is-today' : ''}" data-date="${day.key}" aria-label="${day.key}"><span class="calendar-day-number">${day.day}</span><span class="calendar-day-icons">${this.dayIcons(day.key)}</span></button>`).join('')}</div>
          <section class="calendar-detail" aria-live="polite">${this.detailMarkup()}</section>
          <div class="calendar-legend"><span><b class="is-mood"></b>心情</span><span><b class="is-period"></b>经期</span><span><b class="is-plan"></b>计划与纪念日</span></div>
        </section>
        ${this.modalMarkup()}
        <div class="demo-toast" data-toast role="status"></div>
      `;
    }

    bind() {
      this.root.addEventListener('click', async event => {
        if (event.target.closest('[data-calendar-retry]')) {
          await Promise.resolve(this.onAuthorityRetry?.()).catch(() => {});
          return;
        }
        if (event.target.closest(MUTATION_SELECTOR) && !this.guardMutation()) {
          event.preventDefault?.();
          event.stopPropagation?.();
          return;
        }
        const modeChoice = event.target.closest('[data-mode-choice]');
        if (modeChoice) { this.mode = modeChoice.dataset.modeChoice; this.modeMenuOpen = false; this.render(); return; }
        if (event.target.closest('[data-mode-toggle]')) { this.toggleModeMenu(); return; }
        if (!event.target.closest('.calendar-mode-switcher')) this.closeModeMenu();
        if (event.target.closest('[data-open-picker]')) { this.pickerYear = this.viewYear; this.render(); this.openMonthPicker(); return; }
        if (event.target.closest('[data-close-picker]')) { this.closeMonthPicker(); return; }
        const pickerYearButton = event.target.closest('[data-picker-year]');
        if (pickerYearButton) {
          this.pickerYear += Number(pickerYearButton.dataset.pickerYear);
          this.render();
          this.openMonthPicker();
          return;
        }
        const pickerMonthButton = event.target.closest('[data-picker-month]');
        if (pickerMonthButton) {
          const selectedDay = parseKey(this.selectedDate).day;
          this.viewYear = this.pickerYear;
          this.viewMonth = Number(pickerMonthButton.dataset.pickerMonth);
          const lastDay = new Date(this.viewYear, this.viewMonth + 1, 0, 12).getDate();
          this.selectedDate = dateKey(this.viewYear, this.viewMonth, Math.min(selectedDay, lastDay));
          this.render();
          return;
        }
        const monthButton = event.target.closest('[data-month]');
        if (monthButton) {
          this.viewMonth += Number(monthButton.dataset.month);
          if (this.viewMonth < 0) { this.viewMonth = 11; this.viewYear -= 1; }
          if (this.viewMonth > 11) { this.viewMonth = 0; this.viewYear += 1; }
          this.pickerYear = this.viewYear;
          this.selectedDate = dateKey(this.viewYear, this.viewMonth, 1);
          this.ensurePartnerMood(this.selectedDate);
          this.render();
          return;
        }
        const dayButton = event.target.closest('[data-date]');
        if (dayButton) {
          this.selectedDate = dayButton.dataset.date;
          const parsed = parseKey(this.selectedDate);
          this.viewYear = parsed.year;
          this.viewMonth = parsed.month;
          this.ensurePartnerMood(this.selectedDate);
          this.render();
          return;
        }
        if (event.target.closest('[data-open-modal]')) {
          this.modalMode = this.mode;
          this.render();
          this.openModal();
          return;
        }
        if (event.target.closest('[data-open-dream-plan]')) {
          if (this.dream()?.hasPersona !== true) {
            this.toast('请先给梦角设置人设');
            return;
          }
          this.modalMode = 'dream-permission';
          this.render();
          this.openModal();
          return;
        }
        const permissionButton = event.target.closest('[data-confirm-dream-plan]');
        if (permissionButton && !this.dreamPlanBusy) {
          const enabled = permissionButton.dataset.confirmDreamPlan === 'true';
          this.dreamPlanBusy = true;
          permissionButton.disabled = true;
          try {
            let response = null;
            if (typeof this.onDreamPlanPermission === 'function') response = await this.onDreamPlanPermission(enabled, this.dreamId);
            else {
              this.dreamPlanSetting().enabled = enabled;
              this.persist();
            }
            this.closeModal();
            this.render();
            this.toast(response?.generated ? `${this.dream().name}添加了${Number(response.generatedCount || 1)}条计划 · 已消耗${Number(response.energyCost || 2)}点X能量` : (enabled ? '已经允许TA添加计划' : '已经关闭TA添加计划'));
          } catch (error) {
            this.toast(error?.message || '暂时没有设置成功，请稍后再试');
            permissionButton.disabled = false;
          } finally {
            this.dreamPlanBusy = false;
          }
          return;
        }
        const editPeriodButton = event.target.closest('[data-edit-period]');
        if (editPeriodButton) {
          this.modalMode = 'period';
          this.editingPeriodId = editPeriodButton.dataset.editPeriod;
          this.render();
          this.openModal();
          return;
        }
        if (event.target.closest('[data-close-modal]') || event.target.matches('[data-modal]')) { this.closeModal(); return; }
        const moodButton = event.target.closest('[data-pick-mood]');
        if (moodButton) {
          if (this.selectedDate > this.today) {
            this.toast('还不能提前记录未来的心情');
            return;
          }
          const mutation = this.prepareMutation({
            kind: 'set_mood',
            dreamId: this.dreamId,
            date: this.selectedDate,
            mine: moodButton.dataset.pickMood
          });
          if (!mutation) return;
          const rows = this.dreamMoods();
          const dayMood = rows[this.selectedDate] || (rows[this.selectedDate] = {});
          dayMood.mine = mutation.mine;
          this.closeModal();
          this.persist();
          this.render();
          this.toast(this.selectedDate === this.today ? '今天的心情已经记下啦' : '这一天的心情已经补记啦');
          return;
        }
        const planButton = event.target.closest('[data-toggle-plan]');
        if (planButton) {
          const item = this.dreamPlans().find(plan => plan.id === planButton.dataset.togglePlan);
          if (!item) return;
          const nextDone = !item.done;
          const changedAt = Date.now();
          const mutation = this.prepareMutation({
            kind: 'set_plan_completion',
            dreamId: this.dreamId,
            recordId: item.id,
            done: nextDone,
            completedBy: nextDone ? 'user' : undefined,
            completedAt: nextDone ? changedAt : undefined
          });
          if (!mutation) return;
          if (item) {
            item.done = mutation.done;
            if (item.done) {
              item.completedBy = mutation.completedBy || 'user';
              item.completedAt = Number(mutation.completedAt || changedAt);
            } else {
              delete item.completedBy;
              delete item.completedAt;
            }
          }
          this.persist();
          this.render();
          this.toast(item?.done ? '计划完成啦' : '已恢复为未完成');
          return;
        }
        const deletePlanButton = event.target.closest('[data-delete-plan]');
        if (deletePlanButton) {
          const mutation = this.prepareMutation({ kind: 'delete_plan', dreamId: this.dreamId, recordId: deletePlanButton.dataset.deletePlan });
          if (!mutation) return;
          this.data.plans[this.dreamId] = this.dreamPlans().filter(item => item.id !== mutation.recordId);
          this.persist();
          this.render();
          this.toast('计划已删除');
          return;
        }
        const deleteAnniversaryButton = event.target.closest('[data-delete-anniversary]');
        if (deleteAnniversaryButton) {
          const mutation = this.prepareMutation({ kind: 'delete_anniversary', dreamId: this.dreamId, recordId: deleteAnniversaryButton.dataset.deleteAnniversary });
          if (!mutation) return;
          this.data.anniversaries[this.dreamId] = this.dreamAnniversaries().filter(item => item.id !== mutation.recordId);
          this.persist();
          this.render();
          this.toast('纪念日已删除');
          return;
        }
        const deletePeriodButton = event.target.closest('[data-delete-period]');
        if (deletePeriodButton) {
          const mutation = this.prepareMutation({ kind: 'delete_period', recordId: deletePeriodButton.dataset.deletePeriod });
          if (!mutation) return;
          this.data.periodActual = this.data.periodActual.filter(item => item.id !== mutation.recordId);
          this.editingPeriodId = '';
          this.modalMode = '';
          this.refreshPeriodPrediction();
          this.persist();
          this.render();
          this.toast('经期记录已删除');
        }
      });

      this.root.addEventListener('submit', event => {
        const periodForm = event.target.closest('[data-period-form]');
        if (periodForm) {
          event.preventDefault();
          if (!this.guardMutation()) return;
          const values = new FormData(periodForm);
          const start = String(values.get('start') || '');
          const duration = Math.max(2, Math.min(10, Number(values.get('duration')) || 5));
          if (!start) { this.toast('请选择开始日期'); return; }
          const record = { id: this.editingPeriodId || `period-${Date.now()}`, start, end: addDays(start, duration - 1), duration, flow: String(values.get('flow') || ''), symptoms: values.getAll('symptoms').map(String), note: String(values.get('note') || '') };
          const existingIndex = this.data.periodActual.findIndex(item => item.id === this.editingPeriodId);
          const mutation = this.prepareMutation({
            kind: 'upsert_period',
            record,
            baseRecord: existingIndex >= 0 ? cloneValue(this.data.periodActual[existingIndex]) : undefined
          });
          if (!mutation) return;
          if (existingIndex >= 0) this.data.periodActual.splice(existingIndex, 1, mutation.record);
          else this.data.periodActual.push(mutation.record);
          this.editingPeriodId = '';
          this.refreshPeriodPrediction();
          this.selectedDate = start;
          this.closeModal();
          this.persist();
          this.render();
          this.toast(existingIndex >= 0 ? '经期记录已修改' : '实际经期已经记录');
          return;
        }
        const planForm = event.target.closest('[data-plan-form]');
        if (planForm) {
          event.preventDefault();
          if (!this.guardMutation()) return;
          const values = new FormData(planForm);
          const recordType = String(values.get('recordType') || 'plan');
          const item = { id: `demo-${Date.now()}`, date: String(values.get('date') || this.selectedDate), time: String(values.get('time') || ''), title: String(values.get('title') || ''), type: String(values.get('type') || ''), note: String(values.get('note') || ''), owner: 'mine', done: false };
          const mutation = this.prepareMutation({
            kind: recordType === 'anniversary' ? 'upsert_anniversary' : 'upsert_plan',
            dreamId: this.dreamId,
            record: item
          });
          if (!mutation) return;
          if (recordType === 'anniversary') this.dreamAnniversaries().push(mutation.record);
          else this.dreamPlans().push(mutation.record);
          this.selectedDate = mutation.record.date;
          this.closeModal();
          this.persist();
          this.render();
          this.toast(recordType === 'anniversary' ? '纪念日已经保存' : '计划已经保存');
        }
      });

      document.addEventListener('keydown', event => {
        if (event.key === 'Escape') { this.closeModal(); this.closeMonthPicker(); this.closeModeMenu(); }
      });
    }

    toggleModeMenu() {
      const menu = this.root.querySelector('[data-mode-menu]');
      const trigger = this.root.querySelector('[data-mode-toggle]');
      if (!menu || !trigger) return;
      this.modeMenuOpen = !this.modeMenuOpen;
      menu.hidden = !this.modeMenuOpen;
      trigger.setAttribute('aria-expanded', String(this.modeMenuOpen));
    }

    closeModeMenu() {
      this.modeMenuOpen = false;
      const menu = this.root.querySelector('[data-mode-menu]');
      const trigger = this.root.querySelector('[data-mode-toggle]');
      if (menu) menu.hidden = true;
      if (trigger) trigger.setAttribute('aria-expanded', 'false');
    }

    openMonthPicker() {
      const picker = this.root.querySelector('[data-month-picker]');
      if (!picker) return;
      this.pickerYear = Number(this.pickerYear || this.viewYear);
      picker.hidden = false;
      picker.querySelector('button')?.focus();
    }

    closeMonthPicker() {
      const picker = this.root.querySelector('[data-month-picker]');
      if (picker) picker.hidden = true;
    }

    openModal() {
      if ((this.modalMode || this.mode) === 'period' && !this.editingPeriodId) {
        this.editingPeriodId = '';
      }
      const modal = this.root.querySelector('[data-modal]');
      if (!modal) return;
      modal.hidden = false;
      modal.querySelector('button, input, select')?.focus();
    }

    closeModal() {
      const modal = this.root.querySelector('[data-modal]');
      if (modal) modal.hidden = true;
      this.editingPeriodId = '';
      this.modalMode = '';
    }

    toast(message) {
      const node = this.root.querySelector('[data-toast]');
      if (!node) return;
      window.clearTimeout(this.toastTimer);
      node.textContent = message;
      node.classList.add('is-show');
      this.toastTimer = window.setTimeout(() => node.classList.remove('is-show'), 1800);
    }
  }

  function mount(root, options = {}) {
    if (!root) return null;
    if (root.__shexCalendarInstance) {
      const instance = root.__shexCalendarInstance;
      const nextOwnerUserId = String(options.ownerUserId || instance.ownerUserId || 'local');
      if (nextOwnerUserId !== instance.ownerUserId) return instance.resetOwner({ ...options, ownerUserId: nextOwnerUserId });
      if (options.storageKey) root.__shexCalendarInstance.storageKey = String(options.storageKey);
      if (options.managedLocalPersistence === true) root.__shexCalendarInstance.managedLocalPersistence = true;
      if (typeof options.onChange === 'function') root.__shexCalendarInstance.onChange = options.onChange;
      if (typeof options.onBeforeMutation === 'function') root.__shexCalendarInstance.onBeforeMutation = options.onBeforeMutation;
      if (typeof options.onDreamPlanPermission === 'function') root.__shexCalendarInstance.onDreamPlanPermission = options.onDreamPlanPermission;
      if (typeof options.onAuthorityRetry === 'function') root.__shexCalendarInstance.onAuthorityRetry = options.onAuthorityRetry;
      if (options.data) root.__shexCalendarInstance.replaceData(options.data, options.dream || {});
      if (options.dream) root.__shexCalendarInstance.setDream(options.dream);
      if (Array.isArray(options.partnerMoodDates)) root.__shexCalendarInstance.setPartnerMoodDates(options.partnerMoodDates);
      return root.__shexCalendarInstance;
    }
    const instance = new CalendarDemo(root, options);
    root.__shexCalendarInstance = instance;
    return instance;
  }

  window.SHEXCalendar = { mount, moods: MOODS };
  window.SHEXCalendarDemo = window.SHEXCalendar;
  document.querySelectorAll('[data-calendar-demo]').forEach(root => mount(root, { demo: true }));
})();
