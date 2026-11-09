((root, factory) => {
  const api = factory(root || {});
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SHEXXLettersView = api;
})(typeof window !== 'undefined' ? window : globalThis, root => {
  'use strict';
  const Player = root.SHEXXLettersPlayer || (typeof require === 'function' ? require('./x-letter-player') : null);
  // 已寄出的正式信、以及任意一封未寄出的草稿（不限最新）都可以删除；空白新信页（还没写字）没有可删的内容。
  const deletable = (state, paper) => Boolean(paper && !paper.legacySource && (paper.state === 'sent' ||
    paper.state === 'draft' && (!paper.authorType || paper.authorType === 'user') && !['uncertain', 'sent', 'sending'].includes(state?.sendAttempt?.phase) &&
    (!paper.localDraft || (paper.blocks || []).some(block => block.type !== 'text' || String(block.text || '').trim()))));
  // 图片配文：旧数据里存的是文件名 / 编号，不展示；只展示用户自己写的那句话。
  const imageCaption = alt => { const text = String(alt || '').trim(); return !text || /\.(png|jpe?g|webp|gif|heic|bmp)$/i.test(text) || /^[0-9a-f-]{16,}$/i.test(text) ? '' : text; };
  const boundaryMessage = message => /^当前已经是(?:第一封|最后一封|最新一页)了$/.test(message || '');
  const Stationery = root.SHEXXLettersStationery || (typeof require === 'function' ? require('./x-letter-stationery') : null);
  const ENVELOPE_COLORS = Stationery.envelopes.map(item=>item.id);
  // 一套一套的风格：书皮 → 配套的信纸和信封（邮章的默认款在控制器里按同一张表设置）。
  const STYLE_SETS = Stationery.styleSets;
  const ENVELOPE_LABELS = Stationery.envelopes.map(item=>item.name);
  const SEALS = Stationery.seals.map(item=>item.id);
  // 图片款邮章：加新款时在这里加一行（款式名 → 显示名和透明底图片），并把款式名加进上面的 SEALS。
  const SEAL_IMAGES = Object.fromEntries(Stationery.seals.filter(item=>item.image || item.art).map(item=>[item.id,item]));
  const SEAL_NAMES = { 'botanical-round': '植物圆章', 'plain-round': '简洁圆章' };
  const COVER_IDS = Stationery.covers.map(item=>item.id);
  const AVAILABLE_COVERS = Stationery.covers.filter(item=>!item.retired).map(item=>item.id);
  // 统一解锁：每类只有排最前的未解锁素材显示“下个月解锁”（可花 10 X能量提前解锁），其余显示“待解锁”。
  const LOCK_TEXT=Object.freeze({next:'下个月解锁',pending:'待解锁'});
  const lockedChoice=(kind,id,state)=>{const lock=Stationery.lockState(kind,id,state);return !lock?'':lock==='next'?`data-stationery-locked="next" data-stationery-kind="${kind}" title="下个月解锁，可用 10 X能量提前解锁"`:'data-stationery-locked="true" disabled title="待解锁"';};
  const unlockLabel=(kind,id,state)=>{const lock=Stationery.lockState(kind,id,state);return lock?`<span class="x-letter-unlock-label" data-lock="${lock}">${LOCK_TEXT[lock]}</span>`:'';};
  const SEAL_RING = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 60" fill="none"><g stroke="#556d59"><circle cx="30" cy="30" r="28"/><circle cx="30" cy="30" r="25"/></g></svg>');
  const BOTANICAL_IMAGE = './x-world/x-letters/botanical-sprig.svg';
  const PAPER_STYLES = Stationery.papers;
  const resourceImage = (art, lazy = false) => {
    const [x,y,w,h] = art.crop || [0,0,art.width,art.height];
    return `<span class="x-letter-resource-viewport" style="--resource-ratio:${w/h}"><img src="${Stationery.url(art)}" alt="" draggable="false" decoding="async" ${lazy ? 'loading="lazy"' : ''} style="width:${art.width/w*100}%;height:${art.height/h*100}%;left:${-x/w*100}%;top:${-y/h*100}%"></span>`;
  };
  const sealImage = (style, lazy = false) => {
    const item = SEAL_IMAGES[style];
    if (item?.art?.crop) {
      return `<span class="x-letter-seal-picture x-letter-resource-crop">${resourceImage(item.art,lazy)}</span>`;
    }
    return item ? `<img class="x-letter-seal-picture" src="${item.image || Stationery.url(item.art)}" alt="" draggable="false" decoding="async" ${lazy ? 'loading="lazy"' : ''}>` : `<img class="x-letter-seal-ring" src="${SEAL_RING}" alt=""><img class="x-letter-seal-botanical" src="${BOTANICAL_IMAGE}" alt="" ${style === 'plain-round' ? 'hidden' : ''}><span>已寄出</span>`;
  };
  function envelopeGesture(dx, dy, sendDistance) {
    if (Math.abs(dx) >= 48 && Math.abs(dx) > 1.6 * Math.abs(dy)) return dx < 0 ? 'next' : 'previous';
    if (Number.isFinite(sendDistance) && -dy >= Math.max(48, sendDistance) && Math.abs(dy) > 1.6 * Math.abs(dx)) return 'send';
    return null;
  }
  const escape = value => String(value == null ? '' : value).replace(/[&<>"']/g,
    character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  const button = (action, label, more = '') => `<button type="button" data-letter-action="${action}" ${more}>${label}</button>`;
  // 每日来信在打开 X信件时自动领取并直接显示信封；这一行只在需要你处理时出现（失败重试、旧任务恢复、查询失败）。
  function incomingRow(state){
    const incoming=state.incoming;if(!incoming)return '';
    const op=incoming.dailyOperation,retry=op?.status==='retryable_failed',waiting=incoming.processing;
    const fee=op&&[0,2,5,6,10].includes(op.energyCost)?(op.energyCost===0?'本次免费':`本次 ${op.energyCost} X能量（原任务费用）`):'';
    const claim=state.replyMode==='card'&&(retry||waiting&&!incoming.busy);
    const recovery=state.incomingRecovery;
    // 旧收信：之前某次收信没走完，留在本机待恢复；费用按当时创建任务的价格（不是现在的价格）。
    const recoveryFee=recovery&&[0,2,5,6,10].includes(recovery.energyCost)?recovery.energyCost===0?'当时免费':`按当时价格 ${recovery.energyCost} X能量`:'';
    const pendingCheck=state.pendingIncomingCount&&!recovery;
    const text=incoming.error||(incoming.busy?'TA 的信正在路上…':retry?'今日来信没有送达':waiting?'来信正在准备':recovery&&recovery.status!=='completed'?'有一封之前没收完的来信':'');
    if(!text&&!claim&&incoming.available!==false&&!pendingCheck&&!recovery)return '<div class="x-letter-incoming-row" data-letter-incoming hidden></div>';
    return `<div class="x-letter-incoming-row" data-letter-incoming><span role="status">${escape(text)}${recoveryFee?` · ${escape(recoveryFee)}`:''}</span><div>${claim?`${fee?`<span data-incoming-cost>${escape(fee)}</span>`:''}${button('collect-incoming',retry?'重试收信':'继续收信',incoming.busy?'disabled':'')}`:''}${incoming.available===false?button('refresh-incoming','重试查询'):''}${pendingCheck?button('check-pending-incoming','恢复未完成收信'):''}${recovery&&recovery.status!=='completed'?button('resume-pending-incoming','继续收这封',incoming.busy||!recoveryFee?'disabled':'')+button('dismiss-pending-incoming','不要了',incoming.busy?'disabled':''):''}${recovery?.status==='completed'&&recovery.resultPaperId?button('view-recovered-incoming','查看恢复来信',state.editLocked?'disabled':''):''}</div></div>`;
  }

  const coverImage = (id,lazy = false) => {
    const item = Stationery.covers.find(item=>item.id===id);
    return item?.art ? `<i class="x-letter-cover-art" aria-hidden="true">${resourceImage(item.art,lazy)}</i>` : '';
  };
  const coverArt = id => {
    const item = Stationery.covers.find(item=>item.id===id);
    return item?.art ? `data-stationery-cover ${item.binding ? `data-cover-binding="${escape(item.binding)}"` : ''} style="${escape(`${Stationery.background(item.art)};--book-cover-color:${item.color}`)}"` : '';
  };
  const paperArt = item => item.art ? `data-stationery-paper style="${escape(Stationery.background(item.thumb || item.art))}"` : '';
  const envelopeArt = id => Stationery.envelopeStyle(id) ? `data-stationery-envelope style="${escape(Stationery.envelopeStyle(id))}"` : '';
  const sealArt = id => {
    const item = SEAL_IMAGES[id];
    return item?.art ? `data-stationery-seal style="${escape(Stationery.background(item.art))}"` : '';
  };
  const sentSeal = style => `<span class="x-letter-sent-seal" data-seal-style="${escape(style)}" ${sealArt(style)} aria-label="已寄出">${SEAL_IMAGES[style]?.art ? sealImage(style) : '已寄出'}</span>`;
  const icon = name => {
    const paths = { back: '<path d="m14 18-6-6 6-6"/>', down: '<path d="m6 9 6 6 6-6"/>', more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
      palette: '<path d="M12 3a9 9 0 1 0 0 18c1.2 0 1.8-.8 1.8-1.7 0-.5-.2-.9-.5-1.2-.3-.4-.5-.8-.5-1.3 0-1 .8-1.8 1.8-1.8H17a4 4 0 0 0 4-4c0-4.4-4-8-9-8z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7.2" r="1"/><circle cx="14.5" cy="7.2" r="1"/><circle cx="17" cy="11" r="1"/>',
      left: '<path d="m14 18-6-6 6-6"/>', right: '<path d="m10 18 6-6-6-6"/>', up: '<path d="m6 10 6-6 6 6M12 4v16"/>', bookmark: '<path d="M6 4h12v16l-6-4-6 4z"/>',
      voice: '<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15 9a5 5 0 0 1 0 6M18 6a9 9 0 0 1 0 12"/>',
      text: '<path d="M4 6h16M12 6v13M8 19h8"/>', question: '<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 1 1 5 2c-1 .8-2 1.5-2 3"/><path d="M12 17h.01"/>',
      image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8" cy="9" r="1"/><path d="m4 18 5-5 3 3 3-4 5 6"/>',
      paper: '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v5h4"/>', single: '<rect x="6" y="3" width="12" height="18" rx="2"/><path d="M9 3v18"/>',
      grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
      play: '<path d="m8 5 11 7-11 7z"/>', pause: '<path d="M8 5v14M16 5v14"/>',
      swap: '<path d="M4 8h16m-4-4 4 4-4 4M20 16H4m4-4-4 4 4 4"/>',
      plus: '<path d="M12 5v14M5 12h14"/>', close: '<path d="M5 5 19 19M19 5 5 19"/>' };
    return `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${paths[name] || ''}</svg>`;
  };
  const quarterLabel = value => {
    if (value === 'archive') return '旧信';
    const month = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value || '');
    if (month) return `${month[1]} · ${monthSeason(Number(month[2]))} · ${Number(month[2])}月`;
    const match = /^(\d{4})-Q([1-4])$/.exec(value || '');
    return match ? `${match[1]} · ${['春', '夏', '秋', '冬'][Number(match[2]) - 1]}` : value === 'undated' ? '日期未详' : '本季度';
  };
  const monthSeason = month => month >= 3 && month <= 5 ? '春' : month >= 6 && month <= 8 ? '夏' : month >= 9 && month <= 11 ? '秋' : '冬';
  const coverDate = key => {
    if(key === 'archive') return '<span class="x-letter-cover-date" data-archive="true"><span>旧信</span></span>';
    const month=/^(\d{4})-(0[1-9]|1[0-2])$/.exec(key || '');
    const quarter=/^(\d{4})-Q([1-4])$/.exec(key || '');
    return month ? `<span class="x-letter-cover-date"><span class="x-letter-cover-date-year">${month[1]}</span><span aria-hidden="true"> · </span><span class="x-letter-cover-date-season">${monthSeason(Number(month[2]))}</span><span aria-hidden="true"> · </span><span class="x-letter-cover-date-month">${Number(month[2])}月</span></span>`
      : quarter ? `<span class="x-letter-cover-date"><span class="x-letter-cover-date-year">${quarter[1]}</span><span aria-hidden="true"> · </span><span class="x-letter-cover-date-season">${['春','夏','秋','冬'][Number(quarter[2])-1]}</span></span>` : `<span class="x-letter-cover-date">${escape(quarterLabel(key))}</span>`;
  };
  const shiftMonthKey = value => { const [year,month]=value.split('-').map(Number),date=new Date(Date.UTC(year,month,1));return `${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,'0')}`; };
  const currentBookKey = (state, now) => state.monthlyReady ? state.currentMonthKey : currentQuarterKey(now);
  const dateLabel = value => {
    if (!value) return '日期未详';
    const date = new Date(typeof value === 'number' && value < 1e11 ? value * 1000 : value);
    return Number.isNaN(date.getTime()) ? '日期未详' : new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: 'long', day: 'numeric' }).format(date);
  };
  const currentQuarterKey = now => {
    const date = new Date(Number(now) + 8 * 3600 * 1000);
    return `${date.getUTCFullYear()}-Q${Math.floor(date.getUTCMonth() / 3) + 1}`;
  };
  const nextQuarterKey = value => {
    const match = /^(\d{4})-Q([1-4])$/.exec(value);
    return Number(match[2]) === 4 ? `${Number(match[1]) + 1}-Q1` : `${match[1]}-Q${Number(match[2]) + 1}`;
  };
  const quarterStartLabel = value => {
    const match = /^(\d{4})-Q([1-4])$/.exec(value);
    return `${match[1]}年${(Number(match[2]) - 1) * 3 + 1}月1日`;
  };
  const quarterOrder = value => value === 'undated' ? -1 : Number(value.slice(0, 4)) * 4 + Number(value.slice(-1));
  const bookKeys = (state, now) => {
    if(state.monthlyReady) {
      const current=state.currentMonthKey;
      if(!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(current || '')) return [];
      const active=state.bookKey === 'archive' || /^\d{4}-(?:0[1-9]|1[0-2])$/.test(state.bookKey || '') && state.bookKey<=current ? state.bookKey : null;
      return [...new Set([...(state.books || []).map(book=>book.bookKey).filter(key=>key==='archive'||key<=current),...(active?[active]:[]),current,shiftMonthKey(current)])].sort((a,b)=>a==='archive'?-1:b==='archive'?1:a.localeCompare(b));
    }
    const current = currentQuarterKey(now), future = nextQuarterKey(current);
    return [...new Set([...(state.books || []).map(item => item.quarterKey).filter(key => key && quarterOrder(key) <= quarterOrder(current)), current, future])]
      .sort((a, b) => quarterOrder(a) - quarterOrder(b));
  };
  // 换书皮的小弹窗内容：从底部弹出，书皮横向排成一行，可以左右滑着选。过去的季度和还没寄过信的季度也能换。
  const coverOf = (state, key) => state.coverPicks?.[key] || (state.books || []).find(item => (state.monthlyReady ? item.bookKey : item.quarterKey) === key)?.coverTemplateId || 'cover-default-1';
  function coverSettings(state, selected, now = Date.now()) {
    if (!selected || (state.monthlyReady ? selected !== 'archive' && selected > state.currentMonthKey : quarterOrder(selected) > quarterOrder(currentQuarterKey(now)))) return '';
    const saved = coverOf(state, selected);
    const current = Stationery.covers.find(item=>item.id===saved)?.replacementId || saved;
    return `<div class="x-letter-cover-strip-row x-letter-choice-row" data-letter-picker="book-cover" role="group" aria-label="书皮，左右滑动选择">${AVAILABLE_COVERS.map((id,index) => button('choose-cover', `<span class="x-letter-cover-mini" data-cover="${id}" ${coverArt(id)}>${coverImage(id,true)}</span>${unlockLabel('covers',id,state)}`, `data-template-id="${id}" data-quarter="${escape(selected)}" aria-label="书皮款式 ${index+1}${Stationery.lockState('covers',id,state)?`，${LOCK_TEXT[Stationery.lockState('covers',id,state)]}`:''}" aria-pressed="${current === id}" ${lockedChoice('covers',id,state)}`)).join('')}</div>`;
  }
  function bookCarousel(state, ui) {
    const current = currentBookKey(state,ui.now ?? Date.now()), future = state.monthlyReady ? shiftMonthKey(current) : nextQuarterKey(current);
    const books = new Map((state.books || []).map(item => [state.monthlyReady ? item.bookKey : item.quarterKey, item]));
    const keys = bookKeys(state, ui.now ?? Date.now());
    const selected = keys.includes(ui.bookQuarter) ? ui.bookQuarter : current;
    const index = keys.indexOf(selected);
    const card = key => {
      const book = books.get(key), locked = key === future, isCurrent = key === current;
      const coverId = coverOf(state, key);
      const bindingColor = Stationery.covers.find(item=>item.id===coverId)?.color || (coverId === 'cover-default-3' ? '#dcdddd' : '#c8d4c1');
      const count = Number.isInteger(book?.paperCount) && book.paperCount >= 0 ? `共 ${book.paperCount} 封` : '数量待更新';
      const canSetCover = !locked;
      return `<article class="x-letter-book-card${key === selected ? ' is-selected' : ''}${locked ? ' is-locked' : ''}" data-book-quarter="${escape(key)}" ${key === selected ? 'data-book-active' : ''}>
        <div class="x-letter-book-object" style="--book-cover-color:${escape(bindingColor)}"><span class="x-letter-book-side" aria-hidden="true"></span><span class="x-letter-book-bottom" aria-hidden="true"></span>${button(locked ? 'preview-book' : 'open-book', `${coverImage(coverId)}${coverDate(key)}<strong>四季来信</strong>`, `class="x-letter-cover" data-cover="${escape(coverId)}" ${coverArt(coverId)} data-quarter="${escape(key)}" aria-label="${locked ? '预览' : '打开'}${escape(quarterLabel(key))}书册"`)}</div>
        <p class="x-letter-book-meta">${isCurrent ? `<strong>${state.monthlyReady ? '当前月份' : '当前季度'}</strong> · ` : ''}${locked ? `尚未解锁 · ${state.monthlyReady ? `${key.slice(0,4)}年${Number(key.slice(5))}月1日` : quarterStartLabel(key)}开启` : key==='archive' ? '之前的来信' : count}</p>
      </article>`;
    };
    return `<div class="x-letter-books-body${ui.bookView === 'grid' ? ' is-grid' : ' is-single'}" data-books-body>
      ${state.booksRefreshing ? '<p class="x-letter-books-status" role="status">正在更新书册…</p>' : ''}
      ${state.booksError ? `<p class="x-letter-books-status" role="status">${escape(state.booksError)}</p>` : ''}
      ${/失败|不可用|错误|未更新|未寄出/.test(state.status || '') ? `<p class="x-letter-books-status" role="status">${escape(state.status)}</p>` : ''}
      ${state.capabilityWarning ? `<p class="x-letter-books-status" role="status">${escape(state.capabilityWarning)}</p>` : ''}
      ${state.monthlyReady&&state.capabilities?.monthlyStationeryClaims!==1?'<p class="x-letter-books-status" role="status">领取书册需要更新 shexXLetters；已存信件仍可阅读。</p>':''}
      ${ui.bookView === 'grid' ? `<div class="x-letter-book-grid" aria-label="${state.monthlyReady ? '月册书架' : '季度书架'}">${keys.map(card).join('')}</div>`
        : `<div class="x-letter-book-switch">${button('book-prev', icon('left'), `aria-label="前一本书" ${index === 0 ? 'disabled' : ''}`)}<div class="x-letter-book-single" data-book-single>${card(selected)}</div>${button('book-next', icon('right'), `aria-label="后一本书" ${index === keys.length - 1 ? 'disabled' : ''}`)}</div>`}
      
      ${state.booksCursor ? button('load-more-books', '更早的书册', `class="x-letter-books-load" ${state.booksRefreshing ? 'disabled' : ''}`) : ''}</div>
      ${ui.bookView === 'grid' ? '' : `<div class="x-letter-cover-strip" data-book-cover-settings><div class="x-letter-cover-strip-head"><strong>选择书皮</strong><small>${escape(quarterLabel(selected))}</small></div>${coverSettings(state, selected, ui.now ?? Date.now()) || '<p class="x-letter-cover-strip-locked">该月份开启后可更换书皮</p>'}</div>`}`;
  }
  function sendPanel(state = {}, ui = {}) {
    const cardMode = state.replyMode === 'card';
    const deliveryMode = ui.sendDeliveryMode || 'immediate', sealStyle = ui.sentSealStyle || 'botanical-round';
    const color = Number.isInteger(ui.envelopeColor) ? ((ui.envelopeColor % ENVELOPE_COLORS.length) + ENVELOPE_COLORS.length) % ENVELOPE_COLORS.length : 0;
    const envelopeLock=Stationery.lockState('envelopes',ENVELOPE_COLORS[color],state),envelopeLocked=Boolean(envelopeLock);
    const costKnown = [2, 5, 6, 10].includes(state.replyEnergyCost);
    const choice = (action, label, selected, attrs = '') => button(action, label, `aria-pressed="${selected}" ${attrs}`);
    const deliveryLabel = deliveryMode === 'within_24h' ? '24小时内回复' : '立即回复';
    return `<section class="x-letter-send-surface" data-letter-send-surface data-seal-stamped="${ui.sealStamped ? 'true' : 'false'}" data-send-phase="${escape(ui.sendPhase || 'selecting')}" ${ui.sendOpen || ui.sheet === 'send' ? '' : 'hidden'} aria-label="寄出信件">
      <header class="x-letter-send-head">${button('back', icon('back'), 'class="x-letter-icon-button" aria-label="返回 X世界"')}<h2>寄出信件</h2><div class="x-letter-send-time">${cardMode ? button('toggle-delivery', `<span data-send-delivery-label>${deliveryLabel}</span>${icon('swap')}`, `class="x-letter-send-time-toggle" data-send-delivery aria-label="回信时间：${deliveryLabel}，点击切换" ${ui.sending ? 'disabled' : ''}`) : `<span class="x-letter-send-time-fixed" data-send-delivery-label>${state.replyMode === 'ai' ? '立即回复' : '正在确认'}</span>`}</div></header>
      <div class="x-letter-envelope-space"><div class="x-letter-send-gesture-hint" aria-hidden="true">${icon('up')}<span class="is-after-stamp">把信划出屏幕，信件寄出</span><span class="is-before-stamp">左右滑选好邮章，再点信封上的章盖下去</span></div><div class="x-letter-envelope" data-letter-envelope data-envelope-color="${ENVELOPE_COLORS[color]}" data-stationery-locked="${envelopeLocked}" ${envelopeArt(ENVELOPE_COLORS[color])} tabindex="0" aria-label="${ENVELOPE_LABELS[color]}信封，左右滑动换样式${envelopeLocked?`，${LOCK_TEXT[envelopeLock]}`:'，向上滑动寄出'}">
        <div class="x-letter-envelope-base" data-envelope-base aria-hidden="true"></div>
        <div class="x-letter-envelope-address" data-envelope-text><p>寄给：${escape(state.owner?.dreamName || '当前梦角')}</p><small>${escape(dateLabel(ui.now ?? Date.now()))}</small></div>
        <div class="x-letter-envelope-stamps" data-envelope-stamp-layer>
          <span class="x-letter-send-seal-image x-letter-envelope-seal" data-envelope-seal data-seal-style="${escape(sealStyle)}" aria-label="邮章预览">${sealImage(sealStyle)}</span>
          ${button('stamp-seal', '<span>点这里盖章</span>', `class="x-letter-stamp-target" data-stamp-target aria-label="在这里盖章" ${ui.sealStamped ? 'hidden' : ''} ${envelopeLocked?'disabled':''}`)}
        </div>
        <span class="x-letter-envelope-unlock-label" data-envelope-unlock-label data-letter-action="unlock-early" data-stationery-kind="envelopes" data-lock="${envelopeLock}" role="button" ${envelopeLocked?'':'hidden'}>${LOCK_TEXT[envelopeLock]||''}</span>
      </div></div>
      <p class="x-letter-envelope-hint">滑动换邮章</p>
      <div class="x-letter-send-details">
        <div class="x-letter-send-seals"><div class="x-letter-seal-slot"><div class="x-letter-seal-carousel" data-letter-seal-carousel data-letter-picker="seal" role="group" aria-label="邮章，左右滑动选择">${SEALS.map((style,index)=>choice('choose-seal', `<span class="x-letter-send-seal-image">${sealImage(style,true)}</span>${unlockLabel('seals',style,state)}`, style===sealStyle, `class="x-letter-seal-choice" data-seal-style="${style}" aria-label="邮章款式 ${index+1}" ${lockedChoice('seals',style,state)}`)).join('')}</div></div></div>
        <p class="x-letter-send-status" data-send-status role="status">${escape(ui.sendError || (ui.sending ? '正在寄出…' : ''))}</p>
      </div>
      <footer class="x-letter-send-actions"><p class="x-letter-send-cost" data-send-cost role="status">${costKnown ? (Number(state.replyEnergyCost) === 0 ? '会员权益 · 本次免费' : `本次回信消耗 ${state.replyEnergyCost} X能量`) : '正在确认费用'}</p>${button('resume-writing', '再写一写', `class="x-letter-send-cancel" ${ui.sending ? 'disabled' : ''}`)}${button('confirm-send', ui.sending ? '正在寄出…' : '确认寄信', `class="x-letter-send-confirm" ${ui.sending || !costKnown || envelopeLocked ? 'disabled' : ''}`)}</footer>
      <div class="x-letter-send-waiting" data-send-waiting role="status" aria-live="polite" ${ui.sendPhase === 'waiting' ? '' : 'hidden'}><div class="x-letter-meet-loader" aria-hidden="true"><span class="x-letter-meet-ring"></span><span class="x-letter-meet-square"></span><span class="x-letter-meet-circle"></span><span class="x-letter-meet-core"></span></div><span class="x-letter-send-waiting-label">正在寄出</span></div>
    </section>`;
  }
  function favoritesPanel(state = {}) {
    const favorites = state.favorites || [], paper = state.paper;
    const wholeMarked = Boolean(paper?.bookmarked || state.bookmarkIds?.__paper__);
    return `<section class="x-letter-favorites-panel" ${state.sheet === 'favorites' ? '' : 'hidden'}>
      <h2>我的收藏</h2><p class="x-letter-sheet-sub">收藏当前梦角的整封信，跨季度查看。</p>
      ${paper?.state === 'draft' ? button('toggle-paper-bookmark', '草稿暂不能收藏', 'disabled') : paper ? button('toggle-paper-bookmark', wholeMarked ? '取消收藏整封信' : '收藏整封信', `aria-pressed="${wholeMarked}"`) : ''}
      ${state.favoritesError ? `<p class="x-letter-favorites-error" role="alert">${escape(state.favoritesError)}</p>` : ''}
      ${state.favoritesLoading && !favorites.length ? '<p class="x-letter-favorites-status" role="status">正在读取收藏…</p>' : ''}
      ${state.favoritesLoading && favorites.length ? '<p class="x-letter-favorites-status" role="status">正在更新收藏…</p>' : ''}
      ${favorites.length ? `<ol class="x-letter-list">${favorites.map(row => `<li>${button('open-favorite', `${escape(row.preview || '已收藏的信')}<small>${escape(quarterLabel(row.quarterKey))}</small>`, `data-paper-id="${escape(row.paperId)}" data-legacy-source="${Boolean(row.legacySource)}" ${row.unavailable ? 'disabled title="这封信暂时无法打开"' : ''}`)}</li>`).join('')}</ol>` : !state.favoritesLoading && !state.favoritesError && !state.favoritesCursor ? '<p class="x-letter-favorites-status">还没有收藏的信。</p>' : ''}
      ${state.favoritesCursor ? button('load-more-favorites', state.favoritesLoading ? '正在加载…' : '加载更多收藏', `class="x-letter-favorites-load" ${state.favoritesLoading ? 'disabled' : ''}`) : ''}
    </section>`;
  }
  function retryKind(state = {}) {
    const paper = state.paper;
    if (!paper || paper.authorType !== 'user' || paper.legacySource || paper.hiddenAt) return null;
    const attempt = state.sendAttempt;
    if (attempt?.paperId === paper.paperId && ['failed', 'uncertain', 'sending'].includes(attempt.phase)) return 'retry-send';
    const reply = state.reply;
    if(reply?.sourcePaperId===paper.paperId&&reply.recoverable===false)return null;
    if (paper.state === 'sent' && reply?.sourcePaperId === paper.paperId && (reply.status === 'retryable_failed' || reply.busy)) return 'retry-reply';
    if (attempt?.paperId === paper.paperId && attempt.phase === 'sent' && attempt.replyPending &&
      (reply?.sourcePaperId !== paper.paperId || reply.status === 'fee_changed')) return 'retry-send';
    return null;
  }
  function sendAction(state, ui = {}) {
    const status = documentState(state, ui), locked = state.editLocked || ui.sending;
    if (status.action === 'retry-send' || status.key === 'sending') return '';
    // 草稿：寄出旁边放一个同款「保存」键（自动保存照旧，这里给一个手动确认入口）。
    return state.paper?.state === 'draft' ? button('save', '保存', `class="x-letter-send-top x-letter-save-top" ${locked || ui.newDraftBusy ? 'disabled' : ''}`) + button('send', ui.sending ? '寄出中…' : '寄出', `class="x-letter-send-top" ${locked ? 'disabled' : ''}`) : '';
  }
  function documentState(state = {}, ui = {}) {
    const paper = state.paper;
    if (!paper) return { key: 'empty', label: '' };
    if (paper.hiddenAt) return { key: 'hidden', label: '已隐藏' };
    if (paper.legacySource) return { key: 'legacy', label: '旧信' };
    if (paper.authorType === 'dream') return { key: 'received', label: 'TA 来信' };
    const attempt = state.sendAttempt?.paperId === paper.paperId ? state.sendAttempt : null;
    const reply = state.reply?.sourcePaperId === paper.paperId ? state.reply : null;
    if (attempt?.phase === 'uncertain') return { key: 'uncertain', label: '待确认', action: 'retry-send', detail: true };
    if (attempt?.phase === 'sending' || paper.state === 'draft' && ui.sending) return { key: 'sending', label: '正在寄出' };
    if (paper.state === 'draft') return attempt?.phase === 'failed'
      ? { key: 'send-failed', label: '寄出失败', action: 'retry-send', detail: true }
      : { key: 'draft', label: '草稿' };
    if (reply?.status === 'completed' && reply.resultPaperId) return { key: 'replied', label: '已回信' };
    if (reply?.busy || ['waiting', 'waiting_delivery', 'claimed', 'billed', 'generating'].includes(reply?.status))
      return { key: 'waiting', label: reply?.outputRecovery === 'correcting' ? '正在整理回信格式' : reply?.status === 'waiting_delivery' ? '24小时内回信' : reply?.status === 'generating' ? 'TA 正在写回信' : '等待回复', action: 'check-reply' };
    if (reply?.status === 'retryable_failed' || reply?.status === 'fee_changed')
      return { key: 'reply-failed', label: '回信失败', action: reply?.errorCode==='AI_UPSTREAM_X_LETTER_MODEL_UNCERTAIN'&&reply?.recoverable===false
        ? 'check-reply' : retryKind(state), detail: true };
    if (attempt?.phase === 'sent' && attempt.replyPending && !reply)
      return { key: 'waiting', label: '等待回复', action: attempt.canRetry ? 'retry-send' : 'check-reply' };
    // No completion evidence means only the letter's own sent state is known.
    return { key: 'sent', label: '已寄出' };
  }
  function hideSentSeal(state, ui = {}) {
    const status = documentState(state, ui);
    return Boolean(status.detail || status.key === 'sending');
  }
  function paperStatus(state, ui = {}) {
    const status = documentState(state, ui);
    const locked = ui.sending || state.reply?.busy && status.action === 'check-reply' || state.sendAttempt?.phase === 'sending';
    const label = status.detail ? button('open-status-details', escape(status.label), 'class="x-letter-state x-letter-state-details" aria-label="查看状态详情"')
      : `<span class="x-letter-state">${escape(status.label)}</span>`;
    const action = status.action ? button(status.action, status.action === 'check-reply' ? '查看' : '重试',
      `class="x-letter-state-action" aria-label="${status.action === 'check-reply' ? '查看回信进度' : status.key === 'reply-failed' ? '重试原回信任务' : '重试并核实寄出'}" ${locked ? 'disabled' : ''}`) : '';
    return `${label}${action}`;
  }
  function statusDetails(state) {
    const status = documentState(state), paper = state.paper;
    const reply = state.reply?.sourcePaperId === paper?.paperId ? state.reply : null;
    const attempt = state.sendAttempt?.paperId === paper?.paperId ? state.sendAttempt : null;
    const raw = status.key === 'reply-failed' ? reply?.errorCode || reply?.label : attempt?.message;
    const candidate = /^[A-Z][A-Z0-9_]{0,79}$/.test(raw || '') ? raw : String(raw || '').match(/[（(]([A-Z][A-Z0-9_]{0,79})[）)]/)?.[1];
    const code = candidate || (reply?.status === 'fee_changed' ? 'REPLY_MODE_CHANGED' : '');
    let reason = status.key === 'uncertain' ? '后台尚未确认寄出结果。重试会先核对原信状态，不会直接重新寄出。'
      : status.key === 'reply-failed' ? '信已经寄出，回信暂未完成。重试只恢复原回信任务，不会重新寄信。'
      : '这封信尚未确认寄出。内容和寄出选择仍保留，重试会沿用原请求。';
    const replyReasons = {
      BILLING_RECEIPT_MISMATCH: '扣费回执校验未通过，回信尚未完成。重试会按原任务重新核对，不会重复扣费，也不会重新寄信。',
      BILLING_UNCERTAIN: '暂时没能确认这次扣费结果。重试会先核对原扣费，不会重复扣费。',
      ENERGY_NOT_ENOUGH: 'X能量不足，回信没有生成，也没有扣费。补充X能量后点重试即可。',
      PLAN_UNAVAILABLE: '暂时没能读取套餐状态，回信没有生成。请稍后重试。',
      AI_GENERATION_UNAVAILABLE: 'AI 暂时没有写出回信。能量如已扣除会保留给这次任务，重试不会重复扣费。',
      GENERATION_UNAVAILABLE: '回信生成服务暂时不可用，请稍后重试。',
      RESULT_TOO_LARGE: '生成的回信超出长度上限，重试会重新生成。',
      X_LETTER_INPUT_HASH_MISMATCH: '回信任务的内容校验没有通过，请联系管理员处理。'
    };
    if (status.key === 'reply-failed' && replyReasons[code]) reason = replyReasons[code];
    const upstreamReasons = {
      AI_UPSTREAM_X_LETTER_SECRET_MISSING: 'AI 回信服务还没有配置信笺密钥，回信没有生成。需要管理员在后台补上配置后再重试。',
      AI_UPSTREAM_UNKNOWN_ACTION: 'AI 回信服务的版本太旧，还不认识信笺回信。需要管理员更新后台后再重试。'
    };
    if (status.key === 'reply-failed' && /^AI_UPSTREAM_/.test(code || ''))
      reason = upstreamReasons[code] || 'AI 回信服务返回了错误，回信没有生成。重试不会重复扣费；如果一直失败，请把下面的错误码发给管理员。';
    const outputReasons={INVALID_JSON:'返回的信件格式不是完整 JSON',MISSING_FIELD:'信件缺少必要字段',UNKNOWN_FIELD:'信件包含不支持的字段',
      INVALID_FIELD:'信件字段格式不符合要求',DUPLICATE_ID:'信件段落编号重复',TEXT_TOO_LONG:'信件文字超过长度上限',BLOCK_LIMIT:'信件段落数量不符合要求',
      OUTPUT_TOO_LARGE:'信件数据超过容量上限',INVALID_ANSWER_REFERENCE:'回答没有正确对应来源问题',INVALID_ANSWER_VALUE:'回答类型不符合来源问题要求',TRUNCATED:'模型输出被截断'};
    if(code==='AI_UPSTREAM_X_LETTER_OUTPUT_INVALID')reason=`${outputReasons[reply?.outputReason]||'AI 返回的信件没有通过格式校验'}。`+
      (reply?.recoverable===false?'已停止本次生成，请把错误码和任务号发给管理员。信件和原扣费记录保留，不会重新寄信或重复扣费。':'可以恢复原任务，系统会尝试一次格式修正，不会重新寄信或重复扣费。');
    else if(reply?.recoverable===false)reason='本次回信已停止，不能安全地再次生成。请把错误码和任务号发给管理员核查；原信和扣费记录保留。';
    if(code==='AI_UPSTREAM_X_LETTER_MODEL_UNCERTAIN')reason='上次生成是否完成暂时无法确认。点击“查看”只取晚到的已有结果，不会重新生成，也不会重复扣费。若仍未完成，请把任务号发给管理员。';
    if (code === 'REPLY_MODE_CHANGED') reason = '信已经寄出，但回信模式发生变化。请按现有流程重新确认当前费用，不会重新寄信。';
    if (attempt?.message === '本机恢复记录保存失败，请检查存储空间后重试') reason = attempt.message;
    if (attempt?.message === '后台尚未更新寄出确认，请先更新 shexXLetters') reason = '当前后台版本尚不支持寄出确认，需要更新后台后重试。';
    const taskId=/^[A-Za-z0-9:_-]{1,180}$/.test(reply?.operationId||'')?reply.operationId:'';
    return status.detail ? `<h2>${escape(status.label)}</h2><p>${escape(reason)}</p>${code ? `<small class="x-letter-error-code">错误码：${escape(code)}</small>` : ''}${taskId?`<small class="x-letter-error-code">任务号：${escape(taskId)}</small>`:''}` : '<h2>状态详情</h2><p>当前没有待处理的寄出或回信错误。</p>';
  }
  function bookCover(state) {
    if(state.monthlyReady) return COVER_IDS.includes(state.coverPreview) ? state.coverPreview : coverOf(state,state.bookKey);
    const quarter = state.paper?.quarterKey || state.quarterKey;
    const cover = state.books?.find(book => book.quarterKey === quarter)?.coverTemplateId;
    const fallback = !state.paper?.quarterKey || state.paper.quarterKey === state.quarterKey ? state.coverPreview : null;
    return [cover, fallback].find(value => COVER_IDS.includes(value)) || 'cover-default-1';
  }
  const answerText = value => Array.isArray(value) ? value.join('、') : String(value == null ? '' : value);
  // 判断题的答案在数据里是 true / false，显示给用户时只写“是 / 否”。
  const answerLabel = value => value === true || value === 'true' ? '是' : value === false || value === 'false' ? '否' : answerText(value);
  function answerOptionIndices(question, ui) {
    const options = question.options || [];
    const selected = ui.answerOptionIndices?.[question.questionId];
    if (Array.isArray(selected)) return selected;
    // 旧数据只含选项文字：按出现次数匹配，不能把同名选项全部勾上。
    const answer = ui.answers?.[question.questionId];
    const values = question.questionType === 'multi' ? (Array.isArray(answer) ? [...answer] : []) : [answer];
    const indices = [];
    options.forEach((option, index) => {
      const found = values.indexOf(option);
      if (found < 0) return;
      indices.push(index); values.splice(found, 1);
    });
    return indices;
  }
  function block(item, state, ui) {
    const edit = state.paper?.state === 'draft';
    const selected = edit && ui.selectedBlockId === item.blockId;
    const bid = `data-block-id="${escape(item.blockId)}"`;
    let content = '';
    if (item.type === 'text') content = edit
      ? `<textarea class="x-letter-inline-text" ${bid} data-block-field="text" maxlength="1200" aria-label="信笺正文">${escape(item.text)}</textarea>`
      : `<p class="x-letter-prose">${escape(item.text)}</p>`;
    if (item.type === 'image') {
      const url = state.media?.[item.attachmentId];
      content = `<figure class="x-letter-image">${url ? `<img src="${escape(url)}" alt="${escape(item.alt)}" loading="lazy">` : button('load-image', '轻触查看图片', `data-attachment-id="${escape(item.attachmentId)}"`)}${edit ? `<figcaption><input class="x-letter-image-caption" type="text" ${bid} data-block-field="alt" maxlength="60" value="${escape(imageCaption(item.alt))}" placeholder="写一句关于这张图的话…" aria-label="图片配文"></figcaption>` : imageCaption(item.alt) ? `<figcaption>${escape(imageCaption(item.alt))}</figcaption>` : ''}</figure>`;
    }
    if (item.type === 'question') {
      const answerable = !edit && state.paper?.state === 'sent' && state.paper?.authorType === 'dream' && !state.paper?.legacySource;
      const selectedAnswer = ui.answers?.[item.questionId];
      const type = item.questionType || 'open';
      const options = type === 'boolean' ? (item.options?.length ? item.options : ['是', '否']) : item.options || [];
      const selectedIndices = answerOptionIndices({ ...item, options }, ui);
      const questionInput = answerable ? (type === 'open' ? `<textarea class="x-letter-answer-input" data-answer-question="${escape(item.questionId)}" maxlength="1200" aria-label="回答：${escape(item.prompt)}" placeholder="写下你的回答…">${escape(selectedAnswer || '')}</textarea>` : `<div class="x-letter-answer-options">${options.map((option, index) => `<label><input type="${type === 'multi' ? 'checkbox' : 'radio'}" name="answer-${escape(item.questionId)}" data-answer-question="${escape(item.questionId)}" data-answer-option-index="${index}" value="${escape(option)}" ${selectedIndices.includes(index) ? 'checked' : ''}><span>${escape(option)}</span></label>`).join('')}</div>`) : (options.length ? `<p class="x-letter-option-preview">${options.map(escape).join(' · ')}</p>` : '');
      content = `<div class="x-letter-question"><small>给你的问题</small>${selected ? `<textarea class="x-letter-inline-text" ${bid} data-block-field="prompt" aria-label="编辑问题">${escape(item.prompt)}</textarea>` : `<p>${escape(item.prompt)}</p>`}${questionInput}${answerable ? '<small class="x-letter-answer-hint">选择或填写后，点「写回信」；尚未寄出</small>' : ''}</div>`;
    }
    if (item.type === 'answer') content = `<div class="x-letter-answer"><small>回应 · ${escape(item.promptSnapshot)}</small>${edit ? `<textarea class="x-letter-inline-text" ${bid} data-block-field="value" aria-label="回答">${escape(answerText(item.value))}</textarea>` : `<p>${escape(answerLabel(item.value))}</p>`}</div>`;
    const blockMore = edit && ['question', 'image'].includes(item.type) ? button('block-more', icon('more'), `${bid} class="x-letter-block-more" aria-label="这段内容的操作"`) : '';
    const savedBlockBookmark = !edit && state.bookmarkIds?.[item.blockId] ? button('bookmark', '取消书签', bid) : '';
    return `<section class="x-letter-block${item.type === 'text' ? ' x-letter-block-text' : ''}" data-letter-block="${escape(item.blockId)}">${content}${blockMore}${savedBlockBookmark}</section>`;
  }
  const visibleStatus = (message, state = {}) => {
    if (boundaryMessage(message) || ['尚未保存', '已保存', '已寄出', '正在寄出…'].includes(message)) return '';
    const paperId = state.paper?.paperId;
    if (paperId && state.sendAttempt?.paperId === paperId && message === state.sendAttempt.message ||
      paperId && state.reply?.sourcePaperId === paperId && message === state.reply.label) return '';
    return message || '';
  };
  // 收到 TA 的信：和寄信一样的整屏信封页（不带邮章选择），点「收信」拆开后再看信纸。
  function receivePanel(state, paper, look, ui = {}) {
    const name = escape(state.owner?.dreamName || 'TA');
    return `<section class="x-letter-send-surface x-letter-receive-surface${ui.unsealing === paper.paperId ? ' is-opening' : ''}" data-letter-receive-surface aria-label="收到来信">
      <header class="x-letter-send-head">${button('back', icon('back'), 'class="x-letter-icon-button" aria-label="返回 X世界"')}<h2>收到来信</h2></header>
      <div class="x-letter-envelope-space"><p class="x-letter-send-gesture-hint x-letter-receive-hint">${name} 给你寄来一封信</p><div class="x-letter-envelope" data-receive-envelope data-envelope-color="${escape(look.envelope)}" ${envelopeArt(look.envelope)} aria-label="${name}寄来的信封">
        <div class="x-letter-envelope-base" aria-hidden="true"></div>
        <div class="x-letter-envelope-address"><p>来自：${name}</p><small>${escape(dateLabel(paper.sentAt || paper.visibilityAt || paper.createdAt))}</small></div>
        <div class="x-letter-envelope-stamps" aria-hidden="true"><span class="x-letter-send-seal-image x-letter-envelope-seal" data-seal-style="${escape(look.seal)}">${sealImage(look.seal)}</span></div>
      </div></div>
      <footer class="x-letter-receive-actions">${button('unseal-letter', '收信', `class="x-letter-receive-confirm" data-paper-id="${escape(paper.paperId)}" ${ui.unsealing ? 'disabled' : ''}`)}</footer>
    </section>`;
  }
  function render(state = {}, ui = {}) {
    const paper = state.paper, edit = paper?.state === 'draft';
    // TA 的来信和你寄出的信用同一套信纸视觉：每封来信从它到达时你已解锁的信纸/邮章/信封里随机取一套（按信固定）。
    // 云端给 TA 的信只存默认款（paper-default-1/-4）；你在“这篇的信纸”里换过且已解锁的款式仍然优先。
    const received = paper?.authorType==='dream'&&paper.state==='sent'&&!paper.legacySource ? Stationery.receivedLook(paper,state) : null;
    const chosenPaper = received&&!['paper-default-1','paper-default-4'].includes(paper.paperTemplateId)&&Stationery.unlocked('papers',paper.paperTemplateId,state) ? paper.paperTemplateId : null;
    const setPaper = received ? chosenPaper || received.paper : paper?.authorType==='dream'&&!Stationery.unlocked('papers',paper.paperTemplateId,state)?'paper-default-1':null;
    const sealed = Boolean(received && (state.sealedIncoming || []).includes(paper.paperId) && !paper.hiddenAt);
    const paperStyle = PAPER_STYLES.find(item => item.id === (setPaper || paper?.paperTemplateId)) || PAPER_STYLES[0];
    const quarter = state.monthlyReady ? state.bookKey : state.quarterKey || paper?.quarterKey || '';
    const openingCover = bookCover(state);
    const opening = !paper && state.busy;
    const parentLabel = paper?.relationType === 'correction' ? '↳ 查看所更正的那篇' : paper?.authorType === 'dream' ? '↳ 查看 TA 回应的那篇' : '↳ 查看正在回复的 TA 来信';
    const relation = paper?.parentPaperId && paper.parentPaperId !== paper.paperId ? button('open-parent', parentLabel, `data-paper-id="${escape(paper.parentPaperId)}"`) : '';
    const chain = (state.chain || []).filter(item => !item.hidden && item.paperId !== paper?.paperId);
    const sheet = ui.sheet === 'send' ? '' : ui.sheet || '';
    const canRead = (paper?.state === 'sent' || edit && paper.authorType === 'user') && !paper.hiddenAt && !paper.hidden && (paper.blocks || []).some(item => item.type === 'text' && String(item.text || '').trim());
    const canReply = paper?.state === 'sent' && !paper.hiddenAt && paper.authorType === 'dream' && !paper.legacySource;
    const tools = edit ? [
      button('add-text', `${icon('text')}<span>文字</span>`, 'class="x-letter-tool"'), button('open-question-sheet', `${icon('question')}<span>问题</span>`, 'class="x-letter-tool"'),
      button('add-image', `${icon('image')}<span>图片</span>`, 'class="x-letter-tool"'), button('open-paper-sheet', `${icon('paper')}<span>信纸</span>`, 'class="x-letter-tool"')].join('')
      // 已寄出 / 已收到的信：工具里只有“读给我听”和“信纸”两项。
      : paper?.state === 'sent' && !paper.hiddenAt ? [canRead ? button('voice-select', `${icon('voice')}<span>读给我听</span>`, 'class="x-letter-tool"') : '',
        paper.legacySource ? '' : button('open-paper-sheet', `${icon('paper')}<span>信纸</span>`, 'class="x-letter-tool"')].join('') : '';
    const pageNav = `<nav class="x-letter-nav" aria-label="切换篇目">${button('previous', icon('left'), `aria-label="较早的信" aria-disabled="${!state.canPrevious}" ${state.navigationBusy ? 'disabled' : ''}`)}<span>${edit ? '草稿' : state.paperPosition ? `第 ${state.paperPosition} 封` : ''}</span>${button('next', icon('right'), `aria-label="较新的信或写新信" aria-disabled="${!state.canNext}" ${state.navigationBusy ? 'disabled' : ''}`)}</nav>`;
    return `<div class="x-letter-app" data-letter-app><div class="x-letter-shell" data-letter-layout>
      <header class="x-letter-head" ${sheet ? 'inert' : ''}>${button('back', `${icon('back')}<span class="sr-only">返回 X世界</span>`, 'class="x-letter-icon-button" aria-label="返回 X世界"')}
        <strong class="x-letter-dream">${escape(state.owner?.dreamName || '当前梦角')}<span class="x-letter-mode-badge" data-reply-mode="${escape(state.replyMode || '')}">${state.replyMode === 'ai' ? 'AI 模式' : state.replyMode === 'card' ? '字卡模式' : '模式确认中'}</span></strong>
        <span data-letter-send-slot>${sendAction(state, ui)}${paper?.state==='sent'?button('write-latest','写信','class="x-letter-send-top" aria-label="打开最新草稿"'):''}</span>
        ${button('open-more', icon('more'), `class="x-letter-icon-button" aria-label="信笺工具" aria-expanded="${sheet === 'more'}" aria-controls="xLetterToolsSheet"`)}</header>
      <main class="x-letter-reader" aria-label="信笺阅读区" ${sheet ? 'inert' : ''}>
        <div class="x-letter-book-space">
        ${opening ? `<div class="x-letter-opening-frame" role="status" aria-live="polite">
          <div class="x-letter-cover x-letter-opening-cover" data-cover="${escape(openingCover)}" ${coverArt(openingCover)} aria-label="当前书册封面">${coverImage(openingCover)}${coverDate(quarter)}<strong>四季来信</strong></div>
          <div class="x-letter-opening-status"><span class="x-letter-opening-dots" aria-hidden="true"><i></i><i></i><i></i></span><p>正在翻开信笺</p></div>
        </div>` : `<section class="x-letter-quarter-book-shell" data-cover="${bookCover(state)}" ${coverArt(bookCover(state))} aria-label="${state.monthlyReady ? '当前月册' : '当前季度书册'}">
        <div class="x-letter-book-shadow" aria-hidden="true"></div>
        <div class="x-letter-book-back-cover" aria-hidden="true"></div>
        <div class="x-letter-book-thickness" aria-hidden="true"></div>
        <div class="x-letter-book-spine" aria-hidden="true"></div>
        <div class="x-letter-paper-stage">
        <article class="x-letter-paper" data-reading="${paper?.state === 'sent'}" data-template="${escape(paperStyle.id)}" ${paperStyle.artwork ? `data-paper-artwork="${paperStyle.artwork}"` : ''} aria-label="信纸正文">
          ${paperStyle.image ? `<img class="x-letter-paper-art" src="${paperStyle.image}" alt="" aria-hidden="true" draggable="false" width="${paperStyle.art?.width || 1055}" height="${paperStyle.art?.height || 1491}" decoding="async">` : ''}
          <span class="x-letter-turn-shade" aria-hidden="true"></span>
          <div class="x-letter-paper-safe">
          ${paper ? `<header class="x-letter-paper-head"><small>${dateLabel(paper.sentAt || paper.createdAt)} <span aria-hidden="true">·</span> ${paper.authorType === 'dream' ? 'TA 回给你' : `写给${escape(state.owner?.dreamName || '当前梦角')}`}</small><span class="x-letter-document-status" data-letter-document-status role="status" aria-live="polite">${paperStatus(state, ui)}</span></header>
            <div class="x-letter-content-frame"><div class="x-letter-paper-scroll${paper.state === 'sent' ? ' is-reading' : ''}" tabindex="0" aria-label="信纸正文内容">${paper.hiddenAt ? '<p class="x-letter-hidden">这篇已隐藏，可在更多操作里恢复。</p>' : `${(paper.blocks || []).map(item => block(item, state, ui)).join('')}${edit && (paper.blocks || []).at(-1)?.type !== 'text' ? button('write-here', '轻触这里继续写信…', 'class="x-letter-write-here"') : !paper.blocks?.length ? '<p class="x-letter-empty">这封信还没有正文。</p>' : ''}`}${relation ? `<div class="x-letter-relation-link">${relation}</div>` : ''}${chain.length ? `<div class="x-letter-relation-link">${chain.map(item => button('open-relation', `↳ ${escape(item.authorType === 'dream' ? 'TA 的回应' : item.authorType === 'user' ? '你的回应' : '关联信')} · ${escape(String(item.preview || dateLabel(item.createdAt)).slice(0, 24))}`, `data-paper-id="${escape(item.paperId)}"`)).join('')}</div>` : ''}${canRead ? `<div class="x-letter-player" data-letter-player aria-label="信笺正文朗读">
                ${button('voice-play', icon(['playing', 'waiting'].includes(ui.player?.status) ? 'pause' : 'play'), `class="x-letter-player-toggle" aria-label="${['playing', 'waiting'].includes(ui.player?.status) ? '暂停朗读' : '播放朗读'}" ${ui.player?.busy || ui.player?.status === 'empty' ? 'disabled' : ''}`)}
                <span data-voice-status role="status" aria-live="polite">${escape(ui.player?.label || '播放朗读正文')}</span>
              </div>` : ''}</div></div>` : `<header class="x-letter-paper-head"></header><div class="x-letter-content-frame"><div class="x-letter-paper-scroll" tabindex="0" aria-label="信纸正文内容">${state.busy ? '' : '<p class="x-letter-empty">这里还没有信。想写时，从右上角「更多」新建一封。</p>'}</div></div>`}
            <footer class="x-letter-paper-footer">${received && !paper.hiddenAt ? `<div class="x-letter-sent-footer" data-letter-received-footer>${sentSeal(received.seal)}</div>` : ''}${paper?.state === 'sent' && paper.authorType === 'user' && !paper.legacySource && !paper.hiddenAt ? `<div class="x-letter-sent-footer" data-letter-sent-footer ${hideSentSeal(state, ui) ? 'hidden' : ''}>${hideSentSeal(state, ui) ? '' : sentSeal(paper.sentSealStyle || 'botanical-round')}</div>` : ''}</footer>
          </div>
        </article>
        </div>
        </section>`}
        </div>
        <div class="x-letter-reading-actions"><div class="x-letter-reading-side">${edit ? button('voice-select', `${icon('play')}<span>读给我听</span>`, `class="x-letter-reading-action" ${!canRead || state.editLocked || ui.sending ? 'disabled' : ''}`) : canReply ? button('write-reply', `${icon('text')}<span>回信</span>`, 'class="x-letter-reading-action" aria-label="写回信"') : ''}</div>${pageNav}<div class="x-letter-reading-side is-reply">${tools ? `<div class="x-letter-tools-anchor">${button('toggle-tools', `${icon('plus')}<span>工具</span>`, `class="x-letter-reading-action" aria-label="展开或收起工具" aria-expanded="${Boolean(ui.toolsOpen)}" ${edit && (state.editLocked || ui.sending) ? 'disabled' : ''}`)}<div class="x-letter-toolbar" data-letter-tools ${ui.toolsOpen ? '' : 'hidden'} role="toolbar" aria-label="当前信笺操作">${tools}</div></div>` : ''}</div></div>
        ${incomingRow(state)}
        <p class="x-letter-status" role="status" aria-live="polite">${escape(visibleStatus(ui.notice || state.status, state))}</p>
        ${!edit && state.capabilityWarning ? `<p class="x-letter-cost-hint" role="status">${escape(state.capabilityWarning)}</p>` : ''}
      </main>
      <input data-letter-image-input type="file" accept="image/jpeg,image/png,image/webp" hidden>
      </div>
      ${sendPanel(state, ui)}
      ${sealed ? receivePanel(state, paper, received, ui) : ''}
      <div class="x-letter-boundary" data-letter-boundary role="status" aria-live="polite" hidden></div>
      <div class="x-letter-sheet-backdrop" ${sheet ? '' : 'hidden'} data-letter-action="close-sheet"></div>
      <aside class="x-letter-sheet${sheet === 'more' ? ' is-tools' : ''}${sheet === 'books' ? ' is-books' : ''}${['send','favorites'].includes(sheet) ? ' is-centered' : ''}" id="xLetterToolsSheet" ${sheet ? '' : 'hidden'} role="dialog" aria-modal="${Boolean(sheet)}" aria-label="${sheet === 'more' ? '信笺工具' : sheet === 'books' ? '信笺集' : sheet === 'send' ? '寄出确认' : sheet === 'favorites' ? '我的收藏' : '信笺操作面板'}">${sheet === 'books' ? `<header class="x-letter-books-head">${button('close-sheet', icon('back'), 'aria-label="返回阅读"')}<h2>信笺集</h2><div class="x-letter-books-views">${button('books-toggle-view', icon(ui.bookView === 'grid' ? 'single' : 'grid'), `aria-label="${ui.bookView === 'grid' ? '切换为单本展示' : '切换为书架展示'}"`)}</div></header>` : sheet === 'more' ? `<header class="x-letter-tools-head"><h2 data-letter-tools-date>${escape(quarterLabel(quarter))}</h2>${button('close-sheet', icon('close'), 'class="x-letter-icon-button" aria-label="关闭信笺工具"')}</header>` : `<div class="x-letter-sheet-top"><span class="x-letter-sheet-grip"></span>${button('close-sheet', icon('close'), 'aria-label="关闭面板"')}</div>`}
        <section class="x-letter-books-content" ${sheet === 'books' ? '' : 'hidden'}>
          ${bookCarousel(state, ui)}</section>
        <section ${sheet === 'paper' ? '' : 'hidden'}><h2>这篇的信纸</h2><p class="x-letter-sheet-sub">只调整这一篇，不影响其他篇。</p><div class="x-letter-choice-row" data-letter-picker="paper">${PAPER_STYLES.filter(item => !item.retired).map((item,index) => button('choose-paper', `<span class="x-letter-paper-mini" data-template="${item.id}" ${paperArt(item)}></span>${unlockLabel('papers',item.id,state)}`, `data-template-id="${item.id}" aria-label="信纸款式 ${index+1}" aria-pressed="${(setPaper || paper?.paperTemplateId || 'paper-default-1') === item.id}" ${lockedChoice('papers',item.id,state)}`)).join('')}</div></section>
        <section ${sheet === 'delete-confirm' ? '' : 'hidden'}><h2>真的要删除这篇吗？</h2><p class="x-letter-sheet-sub">删除后无法找回。</p>${button('confirm-delete', '确定删除', 'class="x-letter-danger"')}${button('open-more', '取消')}</section>
        <section data-letter-tools-sidebar ${sheet === 'more' ? '' : 'hidden'}>
          <div class="x-letter-tools-book">${button('open-books', `${coverImage(openingCover)}${coverDate(quarter)}<strong>四季来信</strong>`, `class="x-letter-cover" data-cover="${escape(openingCover)}" ${coverArt(openingCover)} data-quarter="${escape(quarter)}" aria-label="${state.monthlyReady ? '打开月册' : '打开季度书册'}"`)}<p>查看书册封皮</p></div>
          ${button('new-draft', `${icon('plus')}<span>加新信</span>`, `class="x-letter-tools-new" ${state.editLocked || ui.sending || ui.newDraftBusy || state.sendAttempt?.phase === 'uncertain' ? 'disabled' : ''}`)}
          ${button('save', '保存', `${!edit || state.editLocked || ui.sending || ui.newDraftBusy ? 'disabled' : ''}`)}
          ${button('hide', paper?.hiddenAt ? '恢复这篇' : '隐藏这篇', `${!paper || edit ? 'disabled' : ''}`)}${button('ask-delete', paper?.state === 'draft' ? '删除这封草稿' : '删除这篇', `class="x-letter-danger-text" ${!deletable(state, paper) || edit && (state.editLocked || ui.sending) ? 'disabled' : ''}`)}${button('toggle-paper-bookmark', paper?.bookmarked || state.bookmarkIds?.__paper__ ? '取消收藏这篇' : '收藏这篇', `${!paper || paper.state !== 'sent' ? 'disabled' : ''}`)}${button('open-favorites', '我的收藏')}
          <p class="x-letter-tools-notice" data-letter-tools-notice role="status" aria-live="polite" ${sheet === 'more' && (ui.notice || state.status) ? '' : 'hidden'}>${sheet === 'more' ? escape(ui.notice || state.status || '') : ''}</p>
          ${state.replyMode === 'ai' ? button('toggle-proactive', `<span class="x-letter-switch-text"><b>主动来信</b><small>开启后，TA 会主动给你写信，大约两三天一封。</small><small>每次 AI 来信会扣 6 X能量。</small></span><span class="x-letter-switch" aria-hidden="true"></span>`, `class="x-letter-switch-row" role="switch" aria-checked="${state.proactive?.on ? 'true' : 'false'}"`) : ''}</section>
        <section data-letter-status-details ${sheet === 'status-details' ? '' : 'hidden'}>${sheet === 'status-details' ? statusDetails(state) : ''}</section>
        <section ${sheet === 'block' ? '' : 'hidden'}><h2>这段内容</h2>${paper?.state === 'draft' ? `${button('text-before', '在前面写字')}${button('text-after', '在后面写字')}${ui.blockType === 'question' ? button('edit-question', '编辑题目') : ''}${button('delete-block', '删除这段内容')}` : ''}</section>
        <section ${sheet === 'relations' ? '' : 'hidden'}><h2>往来关系</h2><div class="x-letter-quarter-list">${(state.chain || []).map(item => item.hidden ? '<span class="x-letter-hidden-relation">信笺已隐藏</span>' : button('open-relation', escape(item.preview || '一封关联信'), `data-paper-id="${escape(item.paperId)}"`)).join('')}${state.chainCursor ? button('load-more-chain', '加载更多关联篇') : ''}</div></section>
        <section ${sheet === 'question' ? '' : 'hidden'}><h2>添加问题</h2><p class="x-letter-sheet-sub">问题会随这篇草稿一起保存。</p><label class="x-letter-field">题目<textarea data-new-question-prompt maxlength="1200" placeholder="想问 TA 什么？"></textarea></label><label class="x-letter-field">形式<select data-new-question-type><option value="open">开放作答</option><option value="single">单选</option><option value="multi">多选</option><option value="boolean">判断</option></select></label><label class="x-letter-field">选项（单选、多选时每行一个）<textarea data-new-question-options placeholder="选项一&#10;选项二"></textarea></label>${button('confirm-question', '加入信纸')}</section>
        ${favoritesPanel({ ...state, sheet })}
      </aside>
    </div>`;
  }
  function mount(element, controller, options = {}) {
    if (!element || !controller) throw new Error('X信笺挂载点不存在');
    const notify = options.notify || (message => root.alert?.(message));
    const uploadQueue = options.uploadQueue;
    const voice = () => options.voice || root.SHEXVoice;
    let visiblePaperId = null;
    let viewGeneration = 0, disposed = false;
    let player = null, boundaryTimer = null, transientBoundary = '', shownCrossingSeq = null;
    const delay = options.setTimeout || root.setTimeout.bind(root), clearDelay = options.clearTimeout || root.clearTimeout.bind(root);
    const clearBoundary = () => {
      if (boundaryTimer !== null) clearDelay(boundaryTimer);
      boundaryTimer = null; transientBoundary = '';
      const badge = element.querySelector?.('[data-letter-boundary]'); if (badge) { badge.hidden = true; badge.textContent = ''; }
    };
    const showBoundary = (message, duration = 500) => {
      clearBoundary(); transientBoundary = message;
      const badge = element.querySelector?.('[data-letter-boundary]'); if (badge) { badge.textContent = message; badge.hidden = false; }
      boundaryTimer = delay(clearBoundary, duration);
    };
    let lastTextBlockId = null, lastEditingPosition = null;
    const composingIds = new Set();
    let visibleOwner = '', deferredDraw = false, afterComposition = null, turning = null, navigating = false, gesture = null;
    const compositionTargets = new Map();
    const ownerKey = state => JSON.stringify([state.owner?.userId, state.owner?.dreamId]);
    let turnRequestId = 0, turnLayer = null, activeTurn = null;
    let turnAudio = null;
    const stopTurnSound = () => { try { turnAudio?.pause(); if (turnAudio) turnAudio.currentTime = 0; } catch (_) {} };
    const playTurnSound = () => {
      try {
        if (!turnAudio) {
          turnAudio = options.createTurnAudio ? options.createTurnAudio() : root.Audio ? new root.Audio('./x-world/x-letters/page-turn.mp3') : null;
          if (turnAudio) { turnAudio.volume = .22; turnAudio.preload = 'auto'; }
        }
        stopTurnSound(); turnAudio?.play()?.catch?.(() => {});
      } catch (_) { /* Sound is optional; browser autoplay restrictions never block navigation. */ }
    };
    const reducedMotion = () => Boolean(root.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
    const cancelTurn = (stopSound = true) => {
      const layer = turnLayer; turnLayer = null;
      turning?.cancel?.(); turning = null;
      if (!layer) return;
      if (stopSound) stopTurnSound();
      layer.target.remove?.(); layer.old.classList?.remove('is-turning-away', 'is-user-turn'); layer.old.inert = false;
      layer.old.removeAttribute?.('aria-hidden'); layer.stage.classList?.remove('is-turning'); layer.stage.removeAttribute?.('aria-busy');
      for (const { canvas, image } of layer.frozenImages) { canvas.replaceWith?.(image); canvas.width = canvas.height = 0; }
    };
    const startPaperTurn = (state, kind) => {
      const old = element.querySelector?.('.x-letter-paper'), stage = element.querySelector?.('.x-letter-paper-stage');
      const doc = element.ownerDocument || root.document;
      const explicitTurn = activeTurn && activeTurn.owner === ownerKey(state) && activeTurn.paperId === visiblePaperId
        && kind === `turn-${activeTurn.direction}`;
      if (!old?.animate || !stage?.prepend || !doc?.createElement || reducedMotion() && !explicitTurn) return false;
      const holder = doc.createElement('div');
      holder.innerHTML = render(state, { ...ui, answers: {}, answerOptionIndices: {}, selectedBlockId: null, voiceSelectMode: false });
      const target = holder.querySelector('.x-letter-paper'); if (!target) return false;
      const layer = { old, target, stage, owner: ownerKey(state), paperId: state.paper.paperId, frozenImages: [] };
      // Freeze only an already-displayed blob bitmap; this never fetches media or creates a new URL.
      for (const image of old.querySelectorAll?.('img') || []) {
        if (!String(image.currentSrc || image.src || '').startsWith('blob:')) continue;
        const rect = image.getBoundingClientRect?.(); if (!rect?.width || !rect.height) continue;
        if (!image.complete || !image.naturalWidth) {
          const placeholder = doc.createElement('span');
          placeholder.textContent = '图片尚未显示';
          Object.assign(placeholder.style, { display: 'block', margin: 'auto', width: `${rect.width}px`, height: `${rect.height}px`,
            maxWidth: '100%', color: 'var(--muted)', fontSize: '12px' });
          image.replaceWith(placeholder); layer.frozenImages.push({ canvas: placeholder, image }); continue;
        }
        const canvas = doc.createElement('canvas'), scale = Math.min(root.devicePixelRatio || 1, 2, Math.sqrt(1000000 / (rect.width * rect.height)));
        canvas.width = Math.max(1, Math.round(rect.width * scale)); canvas.height = Math.max(1, Math.round(rect.height * scale));
        try {
          const context = canvas.getContext?.('2d'); if (!context) continue;
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          canvas.style.width = `${rect.width}px`; canvas.style.height = `${rect.height}px`; canvas.style.maxWidth = '100%';
          canvas.style.display = 'block'; canvas.style.margin = 'auto';
          image.replaceWith(canvas); layer.frozenImages.push({ canvas, image });
        } catch (_) { canvas.width = canvas.height = 0; /* Keep the existing decoded image; do not retry its URL. */ }
      }
      turnLayer = layer; old.inert = true; target.inert = true; old.setAttribute?.('aria-hidden', 'true'); target.setAttribute?.('aria-hidden', 'true');
      stage.prepend(target); stage.classList?.add('is-turning'); stage.setAttribute?.('aria-busy', 'true'); old.classList?.add('is-turning-away');
      if (explicitTurn) old.classList?.add('is-user-turn');
      // Reverse unfolds the target above the old paper, on the same left binding.
      const reverse = kind === 'turn-previous', moving = reverse ? target : old, origin = 'left center';
      if (reverse) {
        old.classList?.remove('is-turning-away', 'is-user-turn');
        target.classList?.add('is-turning-away');
        if (explicitTurn) target.classList?.add('is-user-turn');
      }
      // Older Android WebViews reject partial keyframes: every animated property must appear in the first and last frame.
      try { turning = moving.animate([
        { transform: `perspective(1100px) rotateY(${reverse ? -108 : 0}deg)`, transformOrigin: origin, opacity: reverse ? 0 : 1, offset: 0,
          boxShadow: '0 0 0 #34453600' },
        { transform: 'perspective(1100px) rotateY(-54deg)', transformOrigin: origin, opacity: 1, offset: .55,
          boxShadow: '-18px 8px 28px #34453650' },
        { transform: `perspective(1100px) rotateY(${reverse ? 0 : -108}deg)`, transformOrigin: origin, opacity: reverse ? 1 : 0, offset: 1,
          boxShadow: '0 0 0 #34453600' }
      ], { duration: 400, easing: 'cubic-bezier(.35,.05,.25,1)', fill: 'forwards' }); }
      catch (_) { turning = null; cancelTurn(false); return false; } // Fall back to the plain redraw instead of a blank stage.
      if (explicitTurn) playTurnSound();
      const finish = () => {
        if (turnLayer !== layer || disposed) return;
        cancelTurn(false); draw(controller.state());
      };
      turning.finished?.then?.(finish, finish); syncEditingLock(state); return true;
    };
    const boundaryNotice = direction => {
      const state = controller.state();
      if (!state.positionLimited && (state.continuousReady || state.paper?.state === 'draft')) {
        showBoundary(direction === 'previous' ? '当前已经是第一封了' : '当前已经是最后一封了'); return;
      }
      ui.notice = state.positionLimited ? '阅读位置尚未确认，请重新打开此季度书册' : state.capabilityWarning || '翻篇暂不可用，请稍后重试';
      const status = element.querySelector?.('.x-letter-status'); if (status) status.textContent = ui.notice;
    };
    const panel = element.closest?.('#xLettersV1Panel');
    const viewport = root.visualViewport;
    // Soft keyboards shrink visualViewport (and on some webviews the host). While a letter field is focused,
    // keep the last settled height so the book stays put and the keyboard simply overlays the bottom.
    let settledHeight = 0;
    const editingText = () => {
      const active = root.document?.activeElement;
      return !!active && active !== element && !!element.contains?.(active) && !!active.matches?.('textarea, input, [contenteditable="true"]');
    };
    const syncHeight = () => {
      if (!panel?.style) return;
      const hostHeight = panel.parentElement?.getBoundingClientRect?.().height || root.innerHeight;
      const visibleHeight = viewport?.height || root.innerHeight;
      if (hostHeight > 0 && visibleHeight > 0) {
        const nextHeight = Math.floor(Math.min(hostHeight, visibleHeight));
        if (!(settledHeight && nextHeight < settledHeight && editingText())) settledHeight = nextHeight;
        panel.style.setProperty('--x-letter-available-height', `${settledHeight}px`);
      }
      element.querySelector?.('.x-letter-inline-text:focus')?.scrollIntoView?.({ block: 'nearest' });
    };
    const fitInlineTexts = () => {
      element.querySelectorAll?.('.x-letter-inline-text')?.forEach(field => {
        if (!field.style) return;
        field.style.height = 'auto'; field.style.height = `${field.scrollHeight}px`;
      });
    };
    const focusText = blockId => {
      const field = element.querySelector?.(`[data-block-field="text"][data-block-id="${blockId}"]`);
      field?.focus?.({ preventScroll: true });
      field?.scrollIntoView?.({ block: 'nearest' });
    };
    // 小弹窗：10 X能量提前解锁当前排最前的未解锁素材。挂在面板上，局部刷新不会把它冲掉。
    let unlockDialog = null;
    const closeUnlockDialog = () => { unlockDialog?.remove?.(); unlockDialog = null; };
    const refreshAfterUnlock = () => {
      const state = controller.state();
      const surface = element.querySelector?.('[data-letter-send-surface]');
      if (ui.sendOpen && !ui.sending && surface && 'outerHTML' in surface) { cancelSealScroll(); sealCarousel = null; surface.outerHTML = sendPanel(state, ui); }
      draw(state);
    };
    const openUnlockDialog = kind => {
      if (!['papers', 'seals', 'envelopes', 'covers'].includes(kind)) return;
      const doc = element.ownerDocument || root.document, host = panel || element;
      if (!doc?.createElement || !host?.appendChild) return;
      closeUnlockDialog();
      const box = doc.createElement('div');
      box.className = 'x-letter-unlock-dialog'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-labelledby', 'xLetterUnlockTitle');
      box.innerHTML = '<div class="x-letter-unlock-card"><p id="xLetterUnlockTitle">10 X能量提前解锁</p><div class="x-letter-unlock-actions"><button type="button" data-unlock-cancel>取消</button><button type="button" data-unlock-confirm>确认</button></div></div>';
      const confirm = box.querySelector('[data-unlock-confirm]'), cancel = box.querySelector('[data-unlock-cancel]');
      cancel?.addEventListener('click', closeUnlockDialog);
      box.addEventListener('click', event => { if (event.target === box && !confirm?.disabled) closeUnlockDialog(); });
      confirm?.addEventListener('click', () => {
        if (confirm.disabled) return;
        confirm.disabled = true; if (cancel) cancel.disabled = true; confirm.textContent = '正在解锁…';
        Promise.resolve().then(() => controller.unlockStationeryEarly(kind))
          .then(() => { closeUnlockDialog(); if (!disposed) refreshAfterUnlock(); },
            error => { closeUnlockDialog(); if (!disposed && !controller.state().status) notify(error?.message || '解锁未确认，请重试'); });
      });
      host.appendChild(box); unlockDialog = box;
      confirm?.focus?.({ preventScroll: true });
    };
    const centerBook = () => { if (ui.bookView === 'grid') element.querySelector?.('[data-book-active]')?.scrollIntoView?.({ block: 'nearest' }); };
    const ui = { sheet: '', selectedBlockId: null, blockId: null, blockType: null, bookQuarter: null,
      bookView: 'single', bookCoverOpen: false, voiceSelectMode: false, answers: {}, answerOptionIndices: {}, sending: false, notice: '',
      sendDeliveryMode: 'immediate', sentSealStyle: 'botanical-round', sendOpen: false,
      envelopeColor: 0, sendError: '', sendPhase: 'selecting' };
    let waitingForComposition = false, submittingSend = false, sendRequestSeq = 0;
    let bookCoverScrollLeft = null;
    let sheetReturn = null, sheetTrigger = null, toolsScrollTop = 0;
    let envelopeMotion = null, sendExit = null, envelopeTouch = null, draftReturn = null, sendVisual = null;
    let sealCarousel = null, sealScrollTimer = null;
    const cancelSealScroll = () => { if (sealScrollTimer != null) clearDelay(sealScrollTimer); sealScrollTimer = null; };
    const centerSeal = (smooth = false) => {
      const carousel = element.querySelector?.('[data-letter-seal-carousel]');
      const item = carousel?.querySelector?.(`[data-seal-style="${ui.sentSealStyle}"]`);
      const bounds = carousel?.getBoundingClientRect?.(), rect = item?.getBoundingClientRect?.();
      if (!bounds || !rect) return;
      const left = carousel.scrollLeft + (rect.left + rect.right - bounds.left - bounds.right) / 2;
      if (carousel.scrollTo) carousel.scrollTo({ left, behavior: smooth && !reducedMotion() ? 'smooth' : 'auto' });
      else carousel.scrollLeft = left;
    };
    const readEnvelopeLift = envelope => {
      let transform = envelope?.style?.transform || '';
      try { transform = root.getComputedStyle?.(envelope)?.transform || transform; } catch (_) { /* Detached/non-DOM hosts use their inline position. */ }
      const matrix = /^matrix(3d)?\(([^)]+)\)$/.exec(transform);
      const values = matrix?.[2].split(',').map(Number);
      const value = values ? values[matrix[1] ? 13 : 5] : Number(transform.match(/translateY\((-?[\d.]+)px\)/)?.[1]);
      return Number.isFinite(value) ? Math.min(0, value) : 0;
    };
    const cancelEnvelopeMotion = () => {
      envelopeMotion?.cancel?.(); envelopeMotion = null;
      const envelope = element.querySelector?.('[data-letter-envelope]'); if (envelope?.dataset) delete envelope.dataset.envelopeMotion;
    };
    const cancelSendExit = () => {
      const exit = sendExit; sendExit = null;
      exit?.animation?.cancel?.(); if (exit?.timer != null) clearDelay(exit.timer);
      const envelope = element.querySelector?.('[data-letter-envelope]'); if (envelope?.dataset) delete envelope.dataset.envelopeMotion;
      sendVisual = null;
    };
    const syncSendSurface = () => {
      const surface = element.querySelector?.('[data-letter-send-surface]');
      if (surface) { surface.hidden = !ui.sendOpen; if (surface.dataset) { surface.dataset.sendPhase = ui.sendPhase; surface.dataset.sealStamped = ui.sealStamped ? 'true' : 'false'; } }
      // 每次打开寄信页都要回到“还没盖章”的样子：盖章位重新出现，上一封留下的落章动画清掉。
      const stampTarget = element.querySelector?.('[data-stamp-target]'); if (stampTarget) stampTarget.hidden = Boolean(ui.sealStamped);
      if (!ui.sealStamped) element.querySelector?.('[data-envelope-seal]')?.classList?.remove('is-stamping');
      if (!ui.sealStamped) element.querySelector?.('[data-envelope-base]')?.classList?.remove('is-stamping');
      const waiting = element.querySelector?.('[data-send-waiting]'); if (waiting) waiting.hidden = !ui.sendOpen || ui.sendPhase !== 'waiting';
      const shell = element.querySelector?.('[data-letter-layout]');
      if (shell) shell.inert = Boolean(ui.sendOpen && !composingIds.size && !waitingForComposition);
      if (!ui.sendOpen) return;
      const state = controller.state();
      if (!ui.sending && ui.sendMode !== state.replyMode) {
        cancelEnvelopeMotion(); envelopeTouch = null;
        const oldEnvelope = element.querySelector?.('[data-letter-envelope]'); if (oldEnvelope?.style) oldEnvelope.style.transform = '';
        ui.sendMode = state.replyMode;
        if (state.replyMode !== 'card') ui.sendDeliveryMode = 'immediate';
        if (surface && 'outerHTML' in surface) { cancelSealScroll(); sealCarousel = null; surface.outerHTML = sendPanel(state, ui); }
      }
      const envelope = element.querySelector?.('[data-letter-envelope]');
      if (envelope?.dataset) {
        envelope.dataset.envelopeColor = ENVELOPE_COLORS[ui.envelopeColor];
        envelope.dataset.stationeryLocked=String(!Stationery.unlocked('envelopes',ENVELOPE_COLORS[ui.envelopeColor],state));
        const artwork = Stationery.envelopeStyle(ENVELOPE_COLORS[ui.envelopeColor]);
        // Only update artwork properties: keep the transform owned by the active gesture/exit.
        const variables = ['--stationery-image','--stationery-size','--stationery-position','--envelope-ratio','--address-left','--address-right','--address-top','--stamp-left','--stamp-top'];
        variables.forEach(name=>envelope.style?.removeProperty?.(name));
        if (artwork) { envelope.setAttribute?.('data-stationery-envelope',''); artwork.split(';').forEach(value=>{const split=value.indexOf(':');if(split>0)envelope.style?.setProperty?.(value.slice(0,split),value.slice(split+1));}); }
        else envelope.removeAttribute?.('data-stationery-envelope');
        envelope.setAttribute?.('aria-label', `${ENVELOPE_LABELS[ui.envelopeColor]}信封，左右滑动换样式${envelope.dataset.stationeryLocked==='true'?`，${LOCK_TEXT[Stationery.lockState('envelopes',ENVELOPE_COLORS[ui.envelopeColor],state)]}`:'，向上滑动寄出'}`);
      }
      const seal = element.querySelector?.('[data-envelope-seal]');
      if (seal?.dataset) {
        seal.dataset.sealStyle = ui.sentSealStyle;
        if (seal.dataset.sealDrawn !== ui.sentSealStyle) { seal.innerHTML = sealImage(ui.sentSealStyle); seal.dataset.sealDrawn = ui.sentSealStyle; }
      }
      const known = [2, 5, 6, 10].includes(state.replyEnergyCost);
      const fee = element.querySelector?.('[data-send-cost]');
      if (fee) fee.textContent = known ? (Number(state.replyEnergyCost) === 0 ? '会员权益 · 本次免费' : `本次回信消耗 ${state.replyEnergyCost} X能量`) : '正在确认费用';
      const label = element.querySelector?.('[data-send-status]');
      if (label) label.textContent = ui.sendError || (ui.sending ? '正在寄出…' : '');
      const timeLabel = element.querySelector?.('[data-send-delivery-label]');
      const timeControl = element.querySelector?.('[data-send-delivery]');
      const timeText = ui.sendDeliveryMode === 'within_24h' ? '24小时内回复' : '立即回复';
      if (timeLabel) timeLabel.textContent = state.replyMode === 'card' ? timeText : state.replyMode === 'ai' ? '立即回复' : '正在确认';
      if (timeControl) { timeControl.disabled = ui.sending || state.replyMode !== 'card'; timeControl.setAttribute?.('aria-label', `回信时间：${timeText}，点击切换`); }
      const envelopeLocked=!Stationery.unlocked('envelopes',ENVELOPE_COLORS[ui.envelopeColor],state);
      const unlockText=element.querySelector?.('[data-envelope-unlock-label]');
      if(unlockText){const lock=Stationery.lockState('envelopes',ENVELOPE_COLORS[ui.envelopeColor],state);unlockText.hidden=!envelopeLocked;unlockText.textContent=LOCK_TEXT[lock]||'';if(unlockText.dataset)unlockText.dataset.lock=lock;}
      if(stampTarget)stampTarget.disabled=ui.sending||envelopeLocked;
      element.querySelectorAll?.('[data-delivery-mode], [data-letter-action="choose-seal"]')?.forEach(control => { control.disabled = ui.sending||control.dataset?.stationeryLocked==='true'; });
      const carousel = element.querySelector?.('[data-letter-seal-carousel]');
      if (carousel) {
        carousel.inert = ui.sending;
        if (carousel !== sealCarousel) { cancelSealScroll(); sealCarousel = carousel; centerSeal(); }
      }
      const confirm = element.querySelector?.('[data-letter-action="confirm-send"]');
      if (confirm) { confirm.disabled = ui.sending || !known || envelopeLocked; confirm.textContent = ui.sending ? '正在寄出…' : '确认寄信'; }
      const resume = element.querySelector?.('[data-letter-action="resume-writing"]');
      if (resume) resume.disabled = ui.sending && !waitingForComposition;
    };
    const animateEnvelopeColor = direction => {
      const envelope = element.querySelector?.('[data-letter-envelope]');
      cancelEnvelopeMotion();
      if (envelope?.animate && !reducedMotion()) envelopeMotion = envelope.animate([
        { transform: `translateX(${direction * 12}px)`, opacity: .88 }, { transform: 'translateX(0)', opacity: 1 }
      ], { duration: 150, easing: 'ease-out' });
    };
    const shiftEnvelopeColor = delta => {
      if (!ui.sendOpen || ui.sending) return;
      ui.envelopeColor = (ui.envelopeColor + delta + ENVELOPE_COLORS.length) % ENVELOPE_COLORS.length; syncSendSurface(); animateEnvelopeColor(delta);
    };
    const settleEnvelope = () => {
      const envelope = element.querySelector?.('[data-letter-envelope]');
      const from = envelope?.style?.transform;
      cancelEnvelopeMotion();
      if (envelope?.style) envelope.style.transform = '';
      if (from && envelope?.animate && !reducedMotion()) {
        if (envelope.dataset) envelope.dataset.envelopeMotion = 'returning';
        const motion = envelope.animate([{ transform: from }, { transform: 'translateY(0px)' }], { duration: 180, easing: 'cubic-bezier(.16,1,.3,1)' });
        envelopeMotion = motion;
        motion.finished?.then?.(() => { if (envelopeMotion === motion) { envelopeMotion = null; if (envelope.dataset) delete envelope.dataset.envelopeMotion; } }, () => {});
      }
    };
    const finishSendSurface = () => {
      if (!sendVisual || !sendVisual.departed || !sendVisual.outcome) return;
      const failed = sendVisual.outcome === 'failed', saved = draftReturn;
      sendVisual = null;
      cancelSealScroll(); sealCarousel = null;
      ui.sendOpen = false; ui.sending = false; ui.sendPhase = 'selecting'; waitingForComposition = false; submittingSend = false; draftReturn = null;
      const state = controller.state();
      if (failed && state.paper?.state === 'draft' && (visiblePaperId === state.paper.paperId || visiblePaperId === state.paper.localSurfaceId)) {
        visiblePaperId = state.paper.paperId;
        syncSendSurface(); syncEditingLock(state); syncRecoveryChrome(state);
        const status = element.querySelector?.('.x-letter-status'); if (status) status.textContent = state.sendAttempt?.message || state.status || ui.sendError;
      } else draw(state);
      if (failed && saved?.owner === ownerKey(controller.state()) && controller.state().paper?.state === 'draft') {
        const scroll = element.querySelector?.('.x-letter-paper-scroll'); if (scroll) scroll.scrollTop = saved.scrollTop;
        const field = saved.blockId && element.querySelector?.(`[data-block-id="${saved.blockId}"][data-block-field="${saved.field}"]`);
        field?.focus?.({ preventScroll: true });
        if (Number.isInteger(saved.start) && Number.isInteger(saved.end)) field?.setSelectionRange?.(saved.start, saved.end, saved.direction);
      }
    };
    const finishSendExit = exit => {
      if (disposed || sendExit !== exit) return;
      sendExit = null; if (exit.timer != null) clearDelay(exit.timer); exit.animation?.cancel?.();
      const envelope = element.querySelector?.('[data-letter-envelope]');
      if (envelope?.style && Number.isFinite(exit.destination)) envelope.style.transform = `translateY(${exit.destination}px)`;
      if (envelope?.dataset) delete envelope.dataset.envelopeMotion;
      if (sendVisual) sendVisual.departed = true;
      ui.sendPhase = 'waiting'; syncSendSurface(); finishSendSurface();
    };
    const startSendExit = () => {
      if (sendExit) return;
      const envelope = element.querySelector?.('[data-letter-envelope]');
      const lift = readEnvelopeLift(envelope);
      if (envelope?.style) envelope.style.transform = `translateY(${lift}px)`;
      cancelEnvelopeMotion(); cancelSealScroll(); envelopeTouch = null;
      const exit = { animation: null, timer: null }; sendExit = exit;
      const bounds = element.querySelector?.('.x-letter-app')?.getBoundingClientRect?.();
      const rect = envelope?.getBoundingClientRect?.();
      // Bounds include the released drag. Finish with the entire envelope above the APP, not a fixed pixel guess.
      const destination = bounds && rect ? lift - Math.max(0, rect.bottom - bounds.top + 16) : null;
      exit.destination = destination;
      if (envelope?.style) envelope.style.transform = '';
      ui.sendPhase = 'leaving'; syncSendSurface();
      // This one user-initiated, translation-only send feedback is explicitly permitted; other reduced-motion behavior is unchanged.
      if (envelope?.animate && Number.isFinite(destination) && !(rect.bottom <= bounds.top)) {
        if (envelope.dataset) envelope.dataset.envelopeMotion = 'leaving';
        exit.animation = envelope.animate([
          { transform: `translateY(${lift}px)` },
          { transform: `translateY(${destination}px)` }
        ], { duration: 320, easing: 'linear', fill: 'forwards' });
        exit.animation.finished?.then?.(() => finishSendExit(exit), () => finishSendExit(exit));
        exit.timer = delay(() => finishSendExit(exit), 460);
      } else finishSendExit(exit);
    };
    const syncPlayer = () => {
      const container = element.querySelector?.('[data-letter-player]');
      // Eligibility is owned by the rendered paper, not the transient playback session.
      if (container) container.hidden = false;
      const control = container?.querySelector?.('[data-letter-action="voice-play"]');
      if (control) {
        control.disabled = Boolean(ui.player?.busy || ui.player?.status === 'empty');
        const playing = ['playing', 'waiting'].includes(ui.player?.status);
        control.setAttribute?.('aria-label', playing ? '暂停朗读' : '播放朗读');
        control.innerHTML = icon(playing ? 'pause' : 'play');
      }
      const label = container?.querySelector?.('[data-voice-status]'); if (label) label.textContent = ui.player?.label || '播放朗读正文';
    };
    if (Player?.createPlayer) player = Player.createPlayer({ voice: voice() || {}, api: options.api,
      currentUser: options.currentUser, currentDream: options.currentDream, voiceVersion: options.currentVoiceVersion,
      confirmVoice: options.confirmVoice || (message => root.confirm?.(message)),
      isActive: paper => !disposed && controller.state().paper?.paperId === paper.paperId && !controller.state().paper?.hiddenAt && JSON.stringify(controller.state().paper?.blocks) === JSON.stringify(paper.blocks),
      onChange: state => { ui.player = state; if (!disposed && visiblePaperId) syncPlayer(); } });
    const viewPreferenceKey = state => `shex_x_letters_books_view_v1:${state.owner?.userId || ''}`;
    const readBookView = state => {
      try { return (options.storage || root.localStorage)?.getItem(viewPreferenceKey(state)) === 'grid' ? 'grid' : 'single'; }
      catch (_) { return 'single'; }
    };
    const saveBookView = () => {
      try { (options.storage || root.localStorage)?.setItem(viewPreferenceKey(controller.state()), ui.bookView); } catch (_) { /* Local preference is optional. */ }
    };
    let suppressBookClick = false;
    const syncEditingLock = state => {
      const locked = Boolean(state.editLocked || ui.sending), inputLocked = Boolean(state.editLocked || ui.sending && !waitingForComposition);
      element.querySelectorAll?.('[data-block-field]')?.forEach(field => { field.readOnly = inputLocked; });
      element.querySelectorAll?.('[data-letter-action="send"], [data-letter-action="save"], [data-letter-action="toggle-tools"], [data-letter-action="add-text"], [data-letter-action="add-image"], [data-letter-action="open-question-sheet"], [data-letter-action="open-paper-sheet"], [data-letter-action="block-more"], [data-letter-action="write-here"]')?.forEach(control => { control.disabled = locked; });
      const save = element.querySelector?.('[data-letter-action="save"]');
      if (save) save.disabled = locked || ui.newDraftBusy || state.paper?.state !== 'draft';
      const create = element.querySelector?.('[data-letter-action="new-draft"]');
      if (create) create.disabled = locked || ui.newDraftBusy || state.sendAttempt?.phase === 'uncertain';
      if(state.paper?.state==='draft') {
        const readable=!state.paper.hiddenAt && !state.paper.hidden && (state.paper.blocks || []).some(block=>block.type==='text' && String(block.text || '').trim());
        const read=element.querySelector?.('[data-letter-action="voice-select"]');if(read)read.disabled=locked || !readable;
      }
      const notice = element.querySelector?.('[data-letter-tools-notice]');
      if (notice) { notice.textContent = ui.sheet === 'more' ? ui.notice || state.status || '' : ''; notice.hidden = !notice.textContent; }
      element.querySelectorAll?.('[data-letter-action="previous"], [data-letter-action="next"]')?.forEach(control => {
        control.disabled = navigating || state.navigationBusy || Boolean(turnLayer);
        control.setAttribute?.('aria-disabled', String(!(control.dataset.letterAction === 'next' ? state.canNext : state.canPrevious)));
      });
    };
    const syncRecoveryChrome = state => {
      const slot = element.querySelector?.('[data-letter-send-slot]');
      if (slot) slot.innerHTML = sendAction(state, ui);
      const status = element.querySelector?.('[data-letter-document-status]');
      if (status) status.innerHTML = paperStatus(state, ui);
      if (ui.sheet === 'status-details') {
        const details = element.querySelector?.('[data-letter-status-details]');
        if (details) details.innerHTML = statusDetails(state);
      }
      const footer = element.querySelector?.('[data-letter-sent-footer]');
      if (footer) {
        footer.hidden = hideSentSeal(state, ui);
        footer.innerHTML = footer.hidden ? '' : sentSeal(state.paper?.sentSealStyle || SEALS[0]);
      }
    };
    const syncSheetInPlace = () => {
      const backdrop = element.querySelector?.('.x-letter-sheet-backdrop'), aside = element.querySelector?.('.x-letter-sheet');
      if (!aside || !backdrop) return false;
      const visible = Boolean(ui.sheet);
      aside.hidden = !visible; backdrop.hidden = !visible;
      aside.setAttribute?.('aria-modal', String(visible));
      aside.setAttribute?.('aria-label', ui.sheet === 'send' ? '寄出确认' : '信笺操作面板');
      aside.classList?.toggle?.('is-centered', ui.sheet === 'send');
      const header = element.querySelector?.('.x-letter-head'), reader = element.querySelector?.('.x-letter-reader');
      if (header) header.inert = visible;
      if (reader) reader.inert = visible && !composingIds.size;
      aside.querySelectorAll?.(':scope > section')?.forEach(section => { section.hidden = true; });
      const panel = aside.querySelector?.('[data-letter-send-panel]');
      if (panel) panel.hidden = ui.sheet !== 'send';
      return true;
    };
    const updateSendChoices = () => {
      element.querySelectorAll?.('[data-delivery-mode]')?.forEach(control => control.setAttribute?.('aria-pressed', String(control.dataset.deliveryMode === ui.sendDeliveryMode)));
      element.querySelectorAll?.('[data-letter-action="choose-seal"]')?.forEach(control => control.setAttribute?.('aria-pressed', String(control.dataset.sealStyle === ui.sentSealStyle)));
      syncSendSurface();
    };
    const syncConfirmControl = () => {
      syncSendSurface();
      const confirm = element.querySelector?.('[data-letter-action="confirm-send"]');
      if (confirm) { confirm.disabled = Boolean(ui.sending || ![2, 5, 6, 10].includes(controller.state().replyEnergyCost)||!Stationery.unlocked('envelopes',ENVELOPE_COLORS[ui.envelopeColor],controller.state())); confirm.textContent = ui.sending ? '正在寄出…' : '确认寄信'; }
      element.querySelectorAll?.('[data-delivery-mode], [data-letter-action="choose-seal"]')?.forEach(control => { control.disabled = Boolean(ui.sending||control.dataset?.stationeryLocked==='true'); });
      const reader = element.querySelector?.('.x-letter-reader');
      if (reader) reader.inert = Boolean(ui.sheet && !waitingForComposition);
      syncEditingLock(controller.state());
    };
    let visibleVoiceBody = '';
    const draw = (state, kind) => {
      if (disposed) return;
      // 新季度第一次进来：先让用户选一本书皮（每个季度只主动弹一次）。
      const changedOwner = visibleOwner !== ownerKey(state);
      if(!changedOwner&&kind==='incoming'){
        const row=element.querySelector?.('[data-letter-incoming]');if(row){row.outerHTML=incomingRow(state);return;}
      }
      const voiceBody=JSON.stringify(state.paper?.blocks || []);
      if (changedOwner || visiblePaperId !== state.paper?.paperId || state.paper?.hiddenAt || visibleVoiceBody !== voiceBody) {
        clearBoundary(); player?.close(); ui.toolsOpen = false;
      }
      visibleVoiceBody=voiceBody;
      if (changedOwner) {
        ui.answers = {}; ui.answerOptionIndices = {};
        sheetReturn = null; sheetTrigger = null; toolsScrollTop = 0; ui.newDraftBusy = false;
        bookCoverScrollLeft = null;
        cancelSendExit(); cancelEnvelopeMotion(); cancelSealScroll(); sealCarousel = null; envelopeTouch = null; ui.sendOpen = false; draftReturn = null; lastEditingPosition = null;
        stopTurnSound();
        activeTurn = null;
        turnRequestId++; navigating = false;
        cancelTurn(); composingIds.clear(); compositionTargets.clear(); deferredDraw = false; afterComposition = null; gesture = null; ui.sending = false; waitingForComposition = false; submittingSend = false; sendRequestSeq++;
        ui.sheet = ''; ui.bookQuarter = null; ui.bookCoverOpen = false; ui.bookView = readBookView(state); lastTextBlockId = null; suppressBookClick = false;
      }
      if (!changedOwner && ui.sendOpen && sendVisual) {
        const attempt = state.sendAttempt;
        if (attempt?.phase === 'sent') sendVisual.committed = true;
        if (sendVisual.committed && state.paper?.paperId !== sendVisual.sourcePaperId && state.paper?.state === 'draft' ||
          !attempt && state.paper?.paperId === sendVisual.sourcePaperId && state.paper?.state === 'sent') sendVisual.outcome = 'sent';
        syncSendSurface(); finishSendSurface(); return;
      }
      if (ui.sheet && gesture?.kind !== 'books') { cancelTurn(); gesture = null; }
      if (turnLayer && !changedOwner) {
        if (turnLayer.paperId === state.paper?.paperId && !ui.sheet) { syncEditingLock(state); return; }
        cancelTurn();
      }
      if (!changedOwner && visiblePaperId && visiblePaperId !== state.paper?.paperId && /^turn-(next|previous)$/.test(kind || '') && !ui.sheet) {
        if (startPaperTurn(state, kind)) { gesture = null; return; }
      }
      // Consume a crossing only after the new page is installed. Otherwise the
      // animation's final redraw clears the badge before the reader can see it.
      const crossing = state.bookCrossing;
      if (!changedOwner && crossing && crossing.seq !== shownCrossingSeq && Date.now() - crossing.at < 3000) {
        shownCrossingSeq = crossing.seq;
        showBoundary(`已进入${quarterLabel(crossing.to)}`, 1600);
      } else if (crossing) shownCrossingSeq = crossing.seq;
      if (!changedOwner && sendExit) return;
      const confirmedSendCommitted = false; // The departure and authoritative outcome are independent now.
      if (!changedOwner && ui.sendOpen && state.paper?.state === 'draft') {
        if (state.paper?.localSurfaceId === visiblePaperId) visiblePaperId = state.paper.paperId;
        syncSendSurface(); syncEditingLock(state); return;
      }
      syncEditingLock(state);
      syncRecoveryChrome(state);
      if (!changedOwner && kind === 'reply') {
        if (element.querySelector?.('[data-letter-document-status]')) return;
      }
      if (!changedOwner && !confirmedSendCommitted && (kind === 'status' || kind === 'navigation')) {
        if(state.paper?.localSurfaceId===visiblePaperId)visiblePaperId=state.paper.paperId;
        const status = element.querySelector('.x-letter-status');
        if (status) {
          if (state.status === '已保存' || state.status === '保存失败，请重试') ui.notice = '';
          if (boundaryMessage(state.status)) { showBoundary(state.status === '当前已经是最新一页了' ? '当前已经是最后一封了' : state.status); status.textContent = ui.notice || ''; }
          else status.textContent = visibleStatus(state.status || ui.notice, state);
          return;
        }
      }
      if (!changedOwner && !confirmedSendCommitted && composingIds.size && visiblePaperId === state.paper?.paperId) { deferredDraw = true; return; }
      const previousId = visiblePaperId;
      const samePaper = !changedOwner && previousId && previousId === state.paper?.paperId;
      const playerNode = samePaper && ui.player?.visible ? element.querySelector?.('[data-letter-player]') : null;
      const scroll = samePaper ? element.querySelector?.('.x-letter-paper-scroll') : null;
      const scrollTop = scroll?.scrollTop;
      const booksScrollTop = ui.sheet === 'books' && !changedOwner ? element.querySelector?.('[data-books-body]')?.scrollTop : null;
      const pickerPositions = changedOwner ? [] : Array.from(element.querySelectorAll?.('[data-letter-picker]') || [])
        .map(row=>({id:row.dataset.letterPicker,left:row.scrollLeft}));
      const bookPickerPosition = pickerPositions.find(position=>position.id === 'book-cover');
      if (Number.isFinite(bookPickerPosition?.left)) bookCoverScrollLeft = bookPickerPosition.left;
      else if (!changedOwner && Number.isFinite(bookCoverScrollLeft)) pickerPositions.push({id:'book-cover',left:bookCoverScrollLeft});
      const sheetScrollTop = ui.sheet && !changedOwner ? element.querySelector?.('.x-letter-sheet:not([hidden])')?.scrollTop : null;
      const booksControl = ui.sheet && !changedOwner ? element.querySelector?.('.x-letter-sheet:not([hidden]) button:focus') : null;
      const booksFocus = booksControl?.dataset?.letterAction ? { ...booksControl.dataset } : null;
      const active = samePaper && state.paper?.state === 'draft' && !ui.sheet && !state.editLocked && !ui.sending
        ? element.querySelector?.('[data-block-field]:focus') : null;
      const caret = active?.dataset?.blockId && active?.dataset?.blockField ? {
        blockId: active.dataset.blockId, field: active.dataset.blockField, start: active.selectionStart,
        end: active.selectionEnd, direction: active.selectionDirection, scrollTop: active.scrollTop
      } : null;
      if (visiblePaperId && visiblePaperId !== state.paper?.paperId) {
        lastEditingPosition = null;
        cancelTurn(); gesture = null;
        if (!player) voice()?.stopLetterVoice?.(); viewGeneration++;
        ui.selectedBlockId = null; ui.blockId = null; ui.answers = {}; ui.answerOptionIndices = {}; ui.notice = ''; ui.sending = false; waitingForComposition = false; submittingSend = false; sendRequestSeq++; afterComposition = null; ui.voiceSelectMode = false;
      }
      visibleOwner = ownerKey(state);
      visiblePaperId = state.paper?.paperId || null;
      element.innerHTML = render(state, ui);
      syncSendSurface();
      pickerPositions.forEach(({id,left})=>{
        const row = element.querySelector?.(`[data-letter-picker="${id}"]`);
        if (row && Number.isFinite(left)) row.scrollLeft = left;
      });
      if (playerNode) element.querySelector?.('[data-letter-player]')?.replaceWith?.(playerNode);
      if (transientBoundary) { const badge = element.querySelector?.('[data-letter-boundary]'); if (badge) { badge.textContent = transientBoundary; badge.hidden = false; } }
      syncPlayer();
      fitInlineTexts(); syncEditingLock(state);
      element.querySelectorAll?.('[data-letter-action="load-image"][data-attachment-id]')?.forEach?.(node =>
        Promise.resolve().then(() => controller.loadImage?.(node.dataset.attachmentId)).catch(() => {}));
      if (ui.sheet && (booksFocus || ui.sheet === 'books' && kind === 'books')) {
        const action = booksFocus?.letterAction || 'close-sheet';
        const selector = `.x-letter-sheet:not([hidden]) [data-letter-action="${escape(action)}"]${booksFocus?.quarter ? `[data-quarter="${escape(booksFocus.quarter)}"]` : ''}${booksFocus?.templateId ? `[data-template-id="${escape(booksFocus.templateId)}"]` : ''}`;
        const matched = element.querySelector?.(selector);
        const control = matched && !matched.disabled && !matched.closest?.('[hidden]') ? matched
          : element.querySelector?.('.x-letter-sheet:not([hidden]) [data-letter-action="close-sheet"]');
        control?.focus?.({ preventScroll: true });
      }
      if (caret) {
        const field = element.querySelector?.(`[data-block-id="${caret.blockId}"][data-block-field="${caret.field}"]`);
        field?.focus?.({ preventScroll: true });
        if (Number.isInteger(caret.start) && Number.isInteger(caret.end)) field?.setSelectionRange?.(caret.start, caret.end, caret.direction);
        if (field && Number.isFinite(caret.scrollTop)) field.scrollTop = caret.scrollTop;
      }
      if (samePaper && Number.isFinite(scrollTop)) {
        const nextScroll = element.querySelector?.('.x-letter-paper-scroll'); if (nextScroll) nextScroll.scrollTop = scrollTop;
      }
      if (Number.isFinite(booksScrollTop)) { const nextBooks = element.querySelector?.('[data-books-body]'); if (nextBooks) nextBooks.scrollTop = booksScrollTop; }
      if (Number.isFinite(sheetScrollTop)) { const nextSheet = element.querySelector?.('.x-letter-sheet:not([hidden])'); if (nextSheet) nextSheet.scrollTop = sheetScrollTop; }
    };
    syncHeight();
    viewport?.addEventListener?.('resize', syncHeight);
    viewport?.addEventListener?.('scroll', syncHeight);
    root.addEventListener?.('resize', syncHeight);
    controller.setOnChange(draw); draw(controller.state());
    const closeSheet = () => {
      if (ui.sending && !waitingForComposition) return;
      if (waitingForComposition) { ui.sending = false; waitingForComposition = false; syncConfirmControl(); }
      const returning = sheetReturn && ui.sheet !== 'more' ? sheetReturn : null;
      sheetReturn = null; ui.sheet = returning?.sheet || ''; ui.bookCoverOpen = false; afterComposition = null; draw(controller.state());
      if (composingIds.size) { syncSheetInPlace(); return; }
      if (returning) { const drawer = element.querySelector?.('.x-letter-sheet'); if (drawer) drawer.scrollTop = toolsScrollTop; }
      const action = returning?.action || sheetTrigger || 'open-more';
      const trigger = element.querySelector?.(`[data-letter-action="${action}"]`);
      (trigger && !trigger.disabled && !trigger.closest?.('[hidden]') ? trigger : element.querySelector?.('[data-letter-action="open-more"]'))?.focus?.({ preventScroll: true });
    };
    const resumeWriting = () => {
      if (!ui.sendOpen || ui.sending && !waitingForComposition || sendExit) return;
      ui.sendOpen = false; ui.sending = false; waitingForComposition = false; afterComposition = null; ui.sendError = '';
      cancelSealScroll(); sealCarousel = null; envelopeTouch = null; settleEnvelope(); syncSendSurface(); syncEditingLock(controller.state());
      const saved = draftReturn; draftReturn = null;
      if (saved?.owner !== ownerKey(controller.state())) return;
      const scroll = element.querySelector?.('.x-letter-paper-scroll'); if (scroll) scroll.scrollTop = saved.scrollTop;
      const field = saved.blockId && element.querySelector?.(`[data-block-id="${saved.blockId}"][data-block-field="${saved.field}"]`);
      field?.focus?.({ preventScroll: true });
      if (Number.isInteger(saved.start) && Number.isInteger(saved.end)) field?.setSelectionRange?.(saved.start, saved.end, saved.direction);
    };
    const rememberEditingPosition = field => {
      if (!field?.dataset?.blockId || !field.dataset.blockField || controller.state().paper?.state !== 'draft') return;
      lastEditingPosition = { owner: ownerKey(controller.state()), paperId: controller.state().paper.paperId,
        scrollTop: element.querySelector?.('.x-letter-paper-scroll')?.scrollTop || 0,
        blockId: field.dataset.blockId, field: field.dataset.blockField,
        start: field.selectionStart, end: field.selectionEnd, direction: field.selectionDirection };
    };
    const openSend = () => {
      if (ui.sendOpen || controller.state().paper?.state !== 'draft') return;
      cancelTurn(); gesture = null; ui.toolsOpen = false; player?.close();
      const field = element.querySelector?.('[data-block-field]:focus');
      rememberEditingPosition(field);
      const scroll = element.querySelector?.('.x-letter-paper-scroll');
      draftReturn = lastEditingPosition?.owner === ownerKey(controller.state()) && lastEditingPosition.paperId === controller.state().paper.paperId
        ? { ...lastEditingPosition, scrollTop: scroll?.scrollTop || 0 } : { owner: ownerKey(controller.state()), scrollTop: scroll?.scrollTop || 0,
        blockId: field?.dataset?.blockId || lastTextBlockId, field: field?.dataset?.blockField || 'text',
        start: field?.selectionStart, end: field?.selectionEnd, direction: field?.selectionDirection };
      ui.sheet = ''; ui.sendOpen = true; ui.sending = false; ui.sendError = ''; ui.sendPhase = 'selecting'; ui.now = Date.now(); ui.sealStamped = false;
      ui.sendMode = controller.state().replyMode;
      ui.sendDeliveryMode = 'immediate'; ui.sentSealStyle = controller.state().paper.sentSealStyle || SEALS[0];
      if(!Stationery.unlocked('seals',ui.sentSealStyle,controller.state()))ui.sentSealStyle=SEALS[0];
      ui.envelopeColor = Math.max(0, ENVELOPE_COLORS.indexOf(STYLE_SETS[bookCover(controller.state())]?.envelope || 'ivory'));
      if(!Stationery.unlocked('envelopes',ENVELOPE_COLORS[ui.envelopeColor],controller.state()))ui.envelopeColor=0;
      syncSheetInPlace(); syncSendSurface(); updateSendChoices();
      const surface = element.querySelector?.('[data-letter-send-surface]');
      if (!surface) { element.innerHTML = render(controller.state(), ui); syncSendSurface(); } // Non-DOM host fallback.
      if (!composingIds.size) element.querySelector?.('[data-letter-action="resume-writing"]')?.focus?.({ preventScroll: true });
    };
    const submitConfirmedSend = async (settings, retry = false) => {
      if (disposed || !ui.sendOpen) return;
      const sendToken = ++sendRequestSeq, sendOwner = ownerKey(controller.state());
      ui.sending = true; waitingForComposition = false; submittingSend = true; ui.sendError = ''; syncConfirmControl();
      sendVisual = { owner: sendOwner, sourcePaperId: controller.state().paper?.paperId, departed: false, outcome: null };
      playLetterSound('send');
      startSendExit();
      try {
        if (retry) await controller.retrySend();
        else await controller.sendAndReply({ ...settings, advanceToWriting: false });
        if (!disposed && sendToken === sendRequestSeq && sendVisual && ownerKey(controller.state()) === sendOwner) {
          const state = controller.state();
          if (sendVisual.committed || state.sendAttempt?.phase === 'sent' || state.paper?.state === 'sent') { sendVisual.outcome = 'sent'; finishSendSurface(); }
        }
      }
      catch (error) {
        if (disposed || sendToken !== sendRequestSeq || ownerKey(controller.state()) !== sendOwner) return;
        if (!disposed && ownerKey(controller.state()) === sendOwner && controller.state().paper?.state === 'draft') {
          ui.sendError = error.message || '寄出失败，请重试'; ui.notice = ui.sendError;
          if (sendVisual) sendVisual.outcome = 'failed';
          syncSendSurface(); finishSendSurface();
        }
        throw error;
      } finally {
        if (!disposed && sendToken === sendRequestSeq && !sendExit && !sendVisual) {
          ui.sending = false; submittingSend = false; syncConfirmControl();
        }
      }
    };
    // 盖章和寄出的小音效：用浏览器现场合成，不需要音频文件；设备静音或不支持时什么都不做。
    let soundContext = null;
    const playLetterSound = kind => {
      try {
        const Context = root.AudioContext || root.webkitAudioContext; if (!Context) return;
        soundContext = soundContext || new Context();
        if (soundContext.state === 'suspended') void soundContext.resume();
        const context = soundContext, start = context.currentTime, length = kind === 'stamp' ? 0.2 : 0.5;
        const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * length), context.sampleRate), samples = buffer.getChannelData(0);
        for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
        const noise = context.createBufferSource(); noise.buffer = buffer;
        const filter = context.createBiquadFilter(), noiseGain = context.createGain();
        noise.connect(filter); filter.connect(noiseGain); noiseGain.connect(context.destination);
        if (kind === 'stamp') {
          // 印章落下：一声低沉的“咚”加一点纸面的闷响。
          filter.type = 'lowpass'; filter.frequency.value = 900;
          noiseGain.gain.setValueAtTime(0.30, start); noiseGain.gain.exponentialRampToValueAtTime(0.001, start + 0.12);
          const thump = context.createOscillator(), thumpGain = context.createGain();
          thump.type = 'sine'; thump.frequency.setValueAtTime(150, start); thump.frequency.exponentialRampToValueAtTime(55, start + 0.14);
          thumpGain.gain.setValueAtTime(0.72, start); thumpGain.gain.exponentialRampToValueAtTime(0.001, start + 0.18);
          thump.connect(thumpGain); thumpGain.connect(context.destination); thump.start(start); thump.stop(start + 0.2);
        } else {
          // 信划出去：一阵由低到高的“嗖”。
          filter.type = 'bandpass'; filter.Q.value = 0.8;
          filter.frequency.setValueAtTime(500, start); filter.frequency.exponentialRampToValueAtTime(3200, start + 0.4);
          noiseGain.gain.setValueAtTime(0.001, start); noiseGain.gain.exponentialRampToValueAtTime(0.16, start + 0.12); noiseGain.gain.exponentialRampToValueAtTime(0.001, start + 0.48);
        }
        noise.start(start); noise.stop(start + length);
      } catch (_) { /* 没有声音不影响寄信。 */ }
    };
    const stampSeal = () => {
      if (disposed || !ui.sendOpen || ui.sending || sendExit || ui.sealStamped) return;
      if(!Stationery.unlocked('envelopes',ENVELOPE_COLORS[ui.envelopeColor],controller.state())){notify('尚未解锁');return;}
      // 先把滑到一半的邮章定下来，盖下去的就是眼前这一枚；盖完不能再换。
      if (sealCarousel) { finishSealScroll(sealCarousel); centerSeal(); }
      cancelSealScroll();
      ui.sealStamped = true; syncSendSurface(); updateSendChoices();
      const seal = element.querySelector?.('[data-envelope-seal]');
      if (seal?.classList) { seal.classList.remove('is-stamping'); void seal.offsetWidth; seal.classList.add('is-stamping'); }
      const paperFace = element.querySelector?.('[data-envelope-base]');
      if (paperFace?.classList) { paperFace.classList.remove('is-stamping'); void paperFace.offsetWidth; paperFace.classList.add('is-stamping'); }
      playLetterSound('stamp');
      try { root.navigator?.vibrate?.(18); } catch (_) { /* 不支持震动的设备忽略。 */ }
    };
    const confirmSend = () => {
      if (disposed || !ui.sendOpen || ui.sending || sendExit) return;
      if(!Stationery.unlocked('envelopes',ENVELOPE_COLORS[ui.envelopeColor],controller.state())||!Stationery.unlocked('seals',ui.sentSealStyle,controller.state())){notify('尚未解锁');return;}
      if (!ui.sealStamped) { notify('先在信封上盖好邮章，再把信划出去'); return; }
      const state = controller.state();
      if (![2, 5, 6, 10].includes(state.replyEnergyCost) || !['card', 'ai'].includes(state.replyMode)) return;
      if (state.replyMode !== ui.sendMode) { syncSendSurface(); updateSendChoices(); return; }
      // Capture the visible snap choice before cancelling its pending scroll-end update.
      if (sealCarousel) { finishSealScroll(sealCarousel); centerSeal(); }
      cancelSealScroll();
      // Omitting stampId preserves any existing draft postage; removing its picker must never clear history.
      const settings = { deliveryMode: ui.sendDeliveryMode, sentSealStyle: ui.sentSealStyle, expectedMode: state.replyMode };
      waitingForComposition = composingIds.size > 0; ui.sending = true; syncConfirmControl();
      if (waitingForComposition) { afterComposition = () => submitConfirmedSend(settings); return; }
      return submitConfirmedSend(settings);
    };
    const selectBook = quarter => {
      if (!bookKeys(controller.state(), Date.now()).includes(quarter)) return;
      ui.bookQuarter = quarter; ui.bookCoverOpen = false; draw(controller.state()); centerBook();
    };
    const shiftBook = direction => {
      const keys = bookKeys(controller.state(), Date.now()), index = keys.indexOf(ui.bookQuarter);
      selectBook(keys[Math.max(0, Math.min(keys.length - 1, index + direction))]);
    };
    const run = operation => {
      const owner = ownerKey(controller.state());
      return Promise.resolve().then(() => !disposed && operation()).catch(error => {
        if (disposed || owner !== ownerKey(controller.state())) return;
        if (ui.sheet === 'more') { ui.notice = error.message || '操作失败，请重试'; syncEditingLock(controller.state()); }
        notify(error.message || '操作失败');
      });
    };
    const turnPage = async direction => {
      const state = controller.state();
      const draftReturn=direction==='previous'&&state.paper?.state==='draft'&&state.canPrevious;
      if (navigating || state.navigationBusy || turnLayer || ui.sheet || ui.sendOpen || ui.voiceSelectMode) return false;
      if (!(direction === 'next' ? state.canNext : state.canPrevious)) { boundaryNotice(direction); return false; }
      if (state.paper?.state !== 'sent' && !(state.paper?.state === 'draft' && (draftReturn || state.canNext || state.canPrevious))) return false;
      const beforeOwner = ownerKey(state), requestId = ++turnRequestId;
      navigating = true; cancelTurn(); syncEditingLock(state); ui.notice = '';
      activeTurn = { owner: beforeOwner, paperId: state.paper.paperId, direction, requestId };
      try { return await controller[direction](); }
      finally {
        if (activeTurn?.requestId === requestId) activeTurn = null;
        if (requestId === turnRequestId) navigating = false;
        if (requestId === turnRequestId && !disposed && ownerKey(controller.state()) === beforeOwner) {
          syncEditingLock(controller.state());
        }
      }
    };
    async function openVoice() {
      const original = controller.state();
      if (!original.paper || original.paper.hiddenAt || original.paper.hidden) return;
      if (!player) throw new Error('朗读播放器模块未加载，请更新前端文件');
      if (player.state().visible) return true;
      const paper=controller.prepareReadAloud ? await controller.prepareReadAloud() : original.paper;
      if (!paper || disposed || ownerKey(original)!==ownerKey(controller.state()) || controller.state().paper?.paperId!==paper.paperId) return false;
      if(!element.querySelector?.('[data-letter-player]'))draw(controller.state());
      return player.open({ ...paper, userId: paper.userId || original.owner.userId,
        dreamId: paper.dreamId || original.owner.dreamId });
    }
    const onClick = event => {
      if (disposed) return;
      if (ui.toolsOpen && !event.target.closest?.('.x-letter-tools-anchor')) {
        ui.toolsOpen = false;
        const popup = element.querySelector?.('[data-letter-tools]'); if (popup) popup.hidden = true;
        element.querySelector?.('[data-letter-action="toggle-tools"]')?.setAttribute?.('aria-expanded', 'false');
      }
      const target = event.target.closest?.('[data-letter-action]'); if (!target || !element.contains(target)) return;
      const action = target.dataset.letterAction; const paperId = target.dataset.paperId; const blockId = target.dataset.blockId;
      if (turnLayer && action !== 'back') return;
      if (suppressBookClick) {
        const syntheticTouch = Date.now() <= suppressBookClick && (event.pointerType === 'touch' || event.sourceCapabilities?.firesTouchEvents);
        suppressBookClick = false;
        if (syntheticTouch && ['open-book', 'preview-book'].includes(action)) return;
      }
      const c = controller;
      if (target.disabled) return;
      if (action === 'unseal-letter') {
        if (ui.unsealing) return;
        const id = target.dataset.paperId; ui.unsealing = id;
        target.disabled = true; target.closest?.('[data-letter-receive-surface]')?.classList?.add('is-opening');
        const finish = () => { if (disposed || ui.unsealing !== id) return; ui.unsealing = null; c.unsealIncoming(id); };
        if (reducedMotion()) finish(); else delay(finish, 650);
        return;
      }
      if (target.dataset.stationeryLocked === 'next' || action === 'unlock-early') {
        event.preventDefault?.(); event.stopPropagation?.();
        if (target.dataset.stationeryLocked === 'next' || target.dataset.lock === 'next') openUnlockDialog(target.dataset.stationeryKind);
        return;
      }
      if (ui.sendOpen && !['back', 'resume-writing', 'confirm-send', 'choose-delivery', 'toggle-delivery', 'choose-seal', 'stamp-seal'].includes(action)) return;
      if ((ui.sending || c.state().editLocked || ui.newDraftBusy) && ['new-draft', 'save', 'send', 'add-text', 'write-here', 'add-image', 'confirm-question', 'choose-paper', 'choose-stamp', 'text-before', 'text-after', 'delete-block', 'move-up', 'move-down', 'edit-question'].includes(action)) return;
      if (ui.sheet && !['close-sheet', 'back'].includes(action) && !target.closest?.('.x-letter-sheet')) return;
      const openSheet = name => {
        const fromTools = ui.sheet === 'more';
        if (name === 'more') { sheetReturn = null; sheetTrigger = 'open-more'; }
        else if (ui.sheet === 'more') {
          toolsScrollTop = element.querySelector?.('.x-letter-sheet')?.scrollTop || 0;
          sheetReturn = { sheet: 'more', action }; sheetTrigger = 'open-more';
        } else if (!ui.sheet) { sheetReturn = null; sheetTrigger = action; }
        ui.sheet = name; ui.toolsOpen = false;
        if (name === 'books') { ui.bookQuarter = target.dataset.quarter || (c.state().monthlyReady ? c.state().bookKey || c.state().currentMonthKey : c.state().quarterKey || c.state().paper?.quarterKey || currentQuarterKey(Date.now())); ui.bookCoverOpen = false; if (fromTools) ui.bookView = 'single'; }
        draw(c.state()); if (name === 'books') centerBook();
        element.querySelector?.('.x-letter-sheet:not([hidden]) [data-letter-action="close-sheet"]')?.focus?.();
        if (name === 'books') return c.refreshBooksIfStale?.();
        if (name === 'favorites') return c.openFavorites?.();
      };
      const navigate = async operation => {
        cancelTurn();
        const priorSheet = ui.sheet, owner = ownerKey(c.state());
        try { await operation(); if (!disposed && owner === ownerKey(c.state())) { ui.sheet = ''; sheetReturn = null; draw(c.state()); } }
        catch (error) { if (!disposed && owner === ownerKey(c.state())) ui.sheet = priorSheet; throw error; }
      };
      const actions = { back: async () => {
          const partition=ownerKey(c.state());
          if(c.prepareDeparture && !await c.prepareDeparture())return;
          if(disposed || ownerKey(c.state())!==partition)return;
          cancelSendExit(); cancelEnvelopeMotion(); cancelSealScroll(); sealCarousel = null; envelopeTouch = null; ui.sendOpen = false;
          afterComposition = null; deferredDraw = false; ui.sending = false; waitingForComposition = false; submittingSend = false; sendRequestSeq++; ui.sheet = '';
          syncSheetInPlace(); syncConfirmControl();
          if (options.onBack) options.onBack(); else if (root.location) root.location.hash = '#x-world';
        },
        'toggle-tools': () => {
          if (!c.state().paper || c.state().paper.state === 'draft' && (c.state().editLocked || ui.sending)) return;
          ui.toolsOpen = !ui.toolsOpen;
          const popup = element.querySelector?.('[data-letter-tools]'); if (popup) popup.hidden = !ui.toolsOpen;
          target.setAttribute?.('aria-expanded', String(ui.toolsOpen));
        },
        'open-books': () => openSheet('books'), 'open-more': () => openSheet('more'), 'open-paper-sheet': () => openSheet('paper'),
        'open-status-details': () => { if (documentState(c.state()).detail) return openSheet('status-details'); },
        'open-question-sheet': () => openSheet('question'), 'close-sheet': closeSheet, 'open-favorites': () => openSheet('favorites'),
        'pick-cover': async () => {
          const owner = ownerKey(c.state());
          await c.selectCover(target.dataset.templateId, c.state().quarterKey);
          if (!disposed && ownerKey(c.state()) === owner && ui.sheet === 'cover-pick') draw(c.state());
        },
        'ask-delete': () => openSheet('delete-confirm'), 'confirm-delete': () => navigate(() => c.deletePaper()),
        'toggle-proactive': () => c.setProactive(!c.state().proactive?.on),
        'collect-incoming':()=>c.collectIncoming(), 'view-incoming':()=>navigate(()=>c.viewIncoming()), 'refresh-incoming':()=>c.refreshIncoming(true),
        'check-pending-incoming':()=>c.checkPendingIncoming(),'resume-pending-incoming':()=>c.resumePendingIncoming(),'dismiss-pending-incoming':()=>c.dismissPendingIncoming(),'view-recovered-incoming':()=>navigate(()=>c.viewRecoveredIncoming()),
        'new-draft': async () => {
          if (ui.newDraftBusy || c.state().sendAttempt?.phase === 'uncertain') return;
          const owner = ownerKey(c.state()); ui.newDraftBusy = true; ui.notice = ''; syncEditingLock(c.state());
          try { await navigate(() => c.newDraft({ preserveCurrent: true })); }
          finally { if (!disposed && owner === ownerKey(c.state())) { ui.newDraftBusy = false; syncEditingLock(c.state()); } }
        }, 'open-paper': () => navigate(() => c.openPaper(paperId)),
        'write-latest':()=>navigate(()=>c.writeLatest()),'claim-second-book':()=>c.claimSecondBook(),
        'open-legacy': () => navigate(() => c.openPaper(paperId, { legacy: true })), previous: () => turnPage('previous'), next: () => turnPage('next'),
        'from-newest': () => navigate(() => c.fromNewest()),
        'open-book': () => navigate(() => (c.selectBook || c.selectQuarter)(target.dataset.quarter)),
        'preview-book': () => selectBook(target.dataset.quarter),
        'book-prev': () => shiftBook(-1), 'book-next': () => shiftBook(1),
        'books-toggle-view': () => { ui.bookView = ui.bookView === 'grid' ? 'single' : 'grid'; saveBookView(); draw(c.state()); centerBook(); },
        'close-cover-popup': () => { ui.bookCoverOpen = false; draw(c.state()); },
        'books-single': () => { ui.bookView = 'single'; saveBookView(); draw(c.state()); },
        'books-grid': () => { ui.bookView = 'grid'; saveBookView(); draw(c.state()); centerBook(); },
        'book-more': () => {
          const selected = target.dataset.quarter || ui.bookQuarter;
          if (quarterOrder(selected) > quarterOrder(currentQuarterKey(Date.now()))) return;
          if (ui.bookQuarter !== selected) ui.bookCoverOpen = false;
          ui.bookQuarter = selected; ui.bookCoverOpen = !ui.bookCoverOpen; draw(c.state());
        },
        'load-more-books': async () => { await c.loadMoreBooks(); centerBook(); },
        'choose-cover': () => c.selectCover(target.dataset.templateId, target.dataset.quarter),
        'choose-paper': () => { if (c.state().paper?.state === 'sent') return c.setSentTemplate(target.dataset.templateId); c.setTemplate(target.dataset.templateId); c.scheduleSave(); },
        'choose-stamp': () => { c.setStamp(target.dataset.stampId || null); c.scheduleSave(); },
        'bookmark-paper': () => c.toggleBookmark('__paper__'),
        'toggle-paper-bookmark': async () => {
          if (c.state().paper?.state !== 'sent') return;
          const sourceOwner = ownerKey(c.state()), sourcePaperId = c.state().paper.paperId;
          await c.toggleBookmark('__paper__');
          if (!disposed && ui.sheet === 'favorites' && ownerKey(c.state()) === sourceOwner && c.state().paper?.paperId === sourcePaperId)
            await c.openFavorites?.();
        },
        'load-more-favorites': () => c.openFavorites?.(true),
        'open-favorite': () => navigate(() => c.openPaper(paperId, { legacy: target.dataset.legacySource === 'true' })),
        'choose-delivery': () => { if (ui.sending) return; ui.sendDeliveryMode = target.dataset.deliveryMode; updateSendChoices(); },
        'toggle-delivery': () => { if (ui.sending || !ui.sendOpen || c.state().replyMode !== 'card') return; ui.sendDeliveryMode = ui.sendDeliveryMode === 'within_24h' ? 'immediate' : 'within_24h'; updateSendChoices(); },
        'stamp-seal': () => stampSeal(),
        'choose-seal': () => { if (ui.sending || ui.sealStamped || !SEALS.includes(target.dataset.sealStyle)||!Stationery.unlocked('seals',target.dataset.sealStyle,c.state())) return; cancelSealScroll(); ui.sentSealStyle = target.dataset.sealStyle; updateSendChoices(); centerSeal(); },
        'resume-writing': resumeWriting,
        'retry-send': () => {
          if (ui.sending || !controller.retrySend) return;
          if (c.state().paper?.state === 'sent') return c.retrySend();
          openSend();
          return submitConfirmedSend(null, true);
        },
        'retry-reply': () => c.retryReply?.(), 'check-reply': () => c.checkReply?.(),
        'block-more': () => {
          const item = c.state().paper?.blocks?.find(row => row.blockId === blockId);
          if (!item || c.state().paper?.state !== 'draft') return;
          ui.blockId = blockId; ui.blockType = item.type; openSheet('block');
        },
        'text-before': () => { ui.sheet = ''; const id = c.addBlock('text', {}, { nearBlockId: ui.blockId, before: true }); c.scheduleSave(); focusText(id); },
        'text-after': () => { ui.sheet = ''; const id = c.addBlock('text', {}, { nearBlockId: ui.blockId, before: false }); c.scheduleSave(); focusText(id); },
        'edit-question': () => { ui.selectedBlockId = ui.blockId; ui.sheet = ''; draw(c.state()); element.querySelector?.(`[data-block-field="prompt"][data-block-id="${ui.blockId}"]`)?.focus?.(); },
        'voice-select': async () => {
          await openVoice();
          const scroll = element.querySelector?.('.x-letter-paper-scroll');
          if (scroll) scroll.scrollTop = scroll.scrollHeight;
        },
        'voice-play': async () => { if (await openVoice()) return player?.toggle(target); },
        chain: async () => { await c.openChain(); openSheet('relations'); },
        'open-parent': () => navigate(() => c.openRelation(paperId)),
        'open-relation': () => navigate(() => c.openRelation(paperId)), 'load-more': () => c.loadMore(),
        'expand-legacy': () => c.expandLegacy(), 'load-more-legacy': () => c.loadMoreLegacy(),
        'expand-drafts': () => c.expandDrafts(), 'load-more-drafts': () => c.loadMoreDrafts(),
        'load-more-chain': () => c.loadMoreChain(), 'add-text': () => {
          const texts = c.state().paper?.blocks?.filter(item => item.type === 'text') || [];
          const chosen = texts.find(item => item.blockId === lastTextBlockId) || texts.at(-1);
          if (chosen) return focusText(chosen.blockId);
          const id = c.addBlock('text'); c.scheduleSave(); focusText(id);
        },
        'write-here': () => {
          if (c.state().paper?.state !== 'draft') return;
          const blocks = c.state().paper?.blocks || [];
          if (blocks.at(-1)?.type === 'text') return focusText(blocks.at(-1).blockId);
          const id = c.addBlock('text'); c.scheduleSave(); focusText(id);
        },
        'add-image': () => pickImage(),
        'confirm-question': () => {
          const prompt = element.querySelector('[data-new-question-prompt]')?.value?.trim();
          const questionType = element.querySelector('[data-new-question-type]')?.value || 'open';
          const optionsList = element.querySelector('[data-new-question-options]')?.value?.split(/\r?\n/).map(value => value.trim()).filter(Boolean) || [];
          if (!prompt) throw new Error('请先写下问题');
          if (['single', 'multi'].includes(questionType) && optionsList.length < 2) throw new Error('请至少填写两个选项');
          c.addBlock('question', { prompt, questionType, ...(questionType === 'open' ? {} : { options: questionType === 'boolean' ? ['是', '否'] : optionsList }) });
          c.scheduleSave(); ui.sheet = ''; draw(c.state());
        },
        'write-reply': async () => {
          const source = c.state().paper, owner = c.state().owner;
          if (source?.state !== 'sent' || source.authorType !== 'dream' || source.legacySource) return;
          const selected = (source.blocks || []).filter(item => item.type === 'question' && item.questionId &&
            (Array.isArray(ui.answers[item.questionId]) ? ui.answers[item.questionId].length : String(ui.answers[item.questionId] || '').trim().length));
          const values = Object.fromEntries(selected.map(item => [item.questionId, ui.answers[item.questionId]]));
          await c.newDraft({ relationType: 'reply', parentPaperId: source.paperId });
          const current = c.state();
          if (current.owner?.userId !== owner?.userId || current.owner?.dreamId !== owner?.dreamId ||
            current.paper?.state !== 'draft' || current.paper?.parentPaperId !== source.paperId) return;
          for (const item of selected) c.addBlock('answer', { sourcePaperId: source.paperId,
            sourceQuestionId: item.questionId, sourceQuestionVersion: item.version,
            promptSnapshot: item.prompt, value: values[item.questionId] });
          if (selected.length) { c.scheduleSave(); ui.notice = '回答已放进草稿，尚未寄出'; draw(c.state()); }
        },
        'move-up': () => { c.moveBlock(blockId, -1); c.scheduleSave(); },
        'move-down': () => { c.moveBlock(blockId, 1); c.scheduleSave(); },
        'delete-block': () => { ui.sheet = ''; ui.selectedBlockId = null; c.deleteBlock(blockId || ui.blockId); c.scheduleSave(); }, save: () => c.saveDraft(),
        send: () => { if (!ui.sending && !c.state().editLocked) openSend(); },
        'confirm-send': confirmSend,
        correction: () => navigate(() => c.createCorrection()), hide: () => c.toggleHidden(), bookmark: () => c.toggleBookmark(blockId),
        'load-image': () => c.loadImage(target.dataset.attachmentId) };
      if (actions[action]) {
        if (target.closest?.('[data-letter-tools]')) {
          ui.toolsOpen = false;
          const popup = element.querySelector?.('[data-letter-tools]'); if (popup) popup.hidden = true;
          element.querySelector?.('[data-letter-action="toggle-tools"]')?.setAttribute?.('aria-expanded', 'false');
        }
        if (action === 'back') { afterComposition = null; Promise.resolve(actions[action]()).catch(error=>notify(error.message || '保存失败，请重试')); return; }
        if (action === 'confirm-send') { Promise.resolve(actions[action]()).catch(error => notify(error.message || '操作失败')); return; }
        if (action === 'send' || action === 'resume-writing' || action === 'close-sheet' || action === 'choose-delivery' || action === 'toggle-delivery' || action === 'choose-seal' || action.startsWith('envelope-') || action.startsWith('postage-')) return run(actions[action]);
        if (action === 'confirm-send' && composingIds.size) return;
        if (composingIds.size && !['collect-incoming','refresh-incoming','check-pending-incoming','resume-pending-incoming','dismiss-pending-incoming'].includes(action)) { afterComposition = actions[action]; return; }
        run(actions[action]);
      }
    };
    element.addEventListener('click', onClick);
    const IMAGE_FAIL = '图片插入失败，请重试';
    const friendlyImageError = error => {
      const text = String(error?.message || '');
      if (/最多\s*\d+\s*张图片/.test(text)) return text;
      if (/太大|too large/i.test(text)) return '图片太大啦，请换一张小一点的图片';
      if (/不可修改|正在保存|请稍候|待确认/.test(text)) return text;
      if (/登录|SESSION/i.test(`${text}${error?.code || ''}`)) return '请先登录后再插入图片';
      return IMAGE_FAIL;
    };
    const captureImageAnchor = () => {
      const state = controller.state();
      const pos = lastEditingPosition;
      const blocks = state.paper?.blocks || [];
      const ownPos = pos && pos.owner === ownerKey(state) && pos.paperId === state.paper?.paperId && blocks.some(item => item.blockId === pos.blockId) ? pos : null;
      const blockId = ownPos?.blockId || (blocks.some(item => item.blockId === lastTextBlockId) ? lastTextBlockId : null);
      return { owner: ownerKey(state), paperId: state.paper?.paperId, blockId, splitAt: ownPos && Number.isInteger(ownPos.start) ? ownPos.start : null };
    };
    const pickImage = () => {
      const anchor = captureImageAnchor();
      const input = element.ownerDocument?.createElement?.('input');
      // A detached picker survives full re-renders of the letter surface while the system dialog is open.
      if (!input) return element.querySelector('[data-letter-image-input]')?.click();
      input.type = 'file'; input.accept = 'image/jpeg,image/png,image/webp'; input.hidden = true;
      // 挂到 body（不在信纸重绘范围内），兼容要求 input 在文档内才能弹出选择器的移动端浏览器。
      const host = element.ownerDocument?.body;
      host?.appendChild?.(input);
      input.addEventListener('change', () => { const file = input.files?.[0]; input.value = ''; input.remove?.(); if (file) insertImageFile(file, anchor); }, { once: true });
      input.addEventListener('cancel', () => input.remove?.(), { once: true });
      input.click();
    };
    const insertImageFile = async (file, anchor) => {
      try {
        const state = controller.state();
        if (state.paper?.state !== 'draft') throw new Error('已寄出信笺不可修改');
        if (!uploadQueue) throw new Error(IMAGE_FAIL);
        if (!/^image\/(jpeg|png|webp)$/.test(file.type || '')) throw new Error('请选择 JPG、PNG 或 WebP 图片');
        if ((state.paper.blocks || []).filter(item => item.type === 'image').length >= 3) throw new Error('一封信最多 3 张图片');
        const result = await uploadQueue.upload(file, { dreamId: state.owner?.dreamId,
          requestId: `letter-image:${Date.now()}:${Math.random().toString(36).slice(2)}` });
        if (disposed) return;
        const now = controller.state();
        if (now.paper?.paperId !== anchor.paperId || ownerKey(now) !== anchor.owner) throw new Error(IMAGE_FAIL);
        const near = now.paper.blocks.some(item => item.blockId === anchor.blockId) ? anchor.blockId : null;
        const previewUrl = root.URL?.createObjectURL?.(file) || '';
        try {
          controller.addBlock('image', { attachmentId: result?.attachmentId, fileID: result?.fileID, alt: '', previewUrl },
            near ? { nearBlockId: near, before: false, splitAt: anchor.splitAt } : null);
        } catch (error) { if (previewUrl) root.URL?.revokeObjectURL?.(previewUrl); throw error; }
        controller.scheduleSave();
      } catch (error) {
        if (disposed) return;
        const message = friendlyImageError(error);
        if (ui.sheet === 'more') { ui.notice = message; syncEditingLock(controller.state()); }
        notify(message);
      }
    };
    const onChange = event => {
      if (disposed) return;
      const target = event.target;
      if (target.matches('[data-answer-question]')) {
        const questionId = target.dataset.answerQuestion;
        if (target.type === 'checkbox' || target.type === 'radio') {
          const question = controller.state().paper?.blocks?.find(item => item.type === 'question' && item.questionId === questionId);
          if (!question) return;
          const options = question.questionType === 'boolean' ? (question.options?.length ? question.options : ['是', '否']) : question.options || [];
          const index = target.dataset.answerOptionIndex === undefined ? options.indexOf(target.value) : Number(target.dataset.answerOptionIndex);
          if (!Number.isInteger(index) || index < 0 || index >= options.length) return;
          if (target.type === 'radio' && target.checked === false) return;
          const prior = answerOptionIndices({ ...question, options }, ui);
          const indices = target.type === 'radio' ? [index] : target.checked ? [...prior.filter(item => item !== index), index] : prior.filter(item => item !== index);
          ui.answerOptionIndices[questionId] = indices;
          ui.answers[questionId] = target.type === 'checkbox' ? options.filter((_, i) => indices.includes(i)) : options[index];
        } else ui.answers[questionId] = target.value;
        const hint = element.querySelector('.x-letter-answer-hint');
        if (hint) hint.textContent = '已选择，尚未寄出；点「写回信」继续';
        return;
      }
      if (target.matches('[data-letter-quarter]')) return run(() => controller.selectQuarter(target.value));
      if (target.matches('[data-letter-cover]')) return run(() => controller.selectCover(target.value));
      if (target.matches('[data-letter-template]')) return run(() => { controller.setTemplate(target.value); controller.scheduleSave(); });
      if (target.matches('[data-letter-stamp]')) return run(() => { controller.setStamp(target.value || null); controller.scheduleSave(); });
      if (target.matches('[data-letter-image-input]')) {
        const file = target.files?.[0]; target.value = '';
        if (file) return insertImageFile(file, captureImageAnchor());
      }
    };
    element.addEventListener('change', onChange);
    const onInput = event => {
      if (disposed) return;
      const target = event.target;
      if (target.matches('[data-answer-question]')) {
        if (target.type === 'checkbox' || target.type === 'radio') return;
        ui.answers[target.dataset.answerQuestion] = target.value;
        const hint = element.querySelector('.x-letter-answer-hint');
        if (hint) hint.textContent = '已填写，尚未寄出；点「写回信」继续';
        return;
      }
      if (target.matches('[data-block-field]')) try {
        rememberEditingPosition(target);
        if (target.matches('[data-block-field="text"]')) fitInlineTexts();
        if (event.isComposing || composingIds.has(target.dataset.blockId)) return;
        if (controller.state().paper?.blocks?.find(item => item.blockId === target.dataset.blockId)?.[target.dataset.blockField] === target.value) return;
        controller.updateBlock(target.dataset.blockId, { [target.dataset.blockField]: target.value });
        controller.scheduleSave();
      } catch (error) { notify(error.message || '输入失败'); }
    };
    element.addEventListener('input', onInput);
    const onFocusIn = event => {
      rememberEditingPosition(event.target);
      if (event.target?.matches?.('[data-block-field="text"]')) lastTextBlockId = event.target.dataset.blockId;
    };
    const onFocusOut = event => rememberEditingPosition(event.target);
    const onCompositionStart = event => {
      if (!event.target?.matches?.('[data-block-field]')) return;
      composingIds.add(event.target.dataset.blockId); compositionTargets.set(event.target.dataset.blockId, event.target);
      controller.beginComposition?.();
    };
    const onCompositionEnd = event => {
      if (!event.target?.matches?.('[data-block-field]')) return;
      if (compositionTargets.get(event.target.dataset.blockId) !== event.target) return;
      composingIds.delete(event.target.dataset.blockId);
      compositionTargets.delete(event.target.dataset.blockId);
      rememberEditingPosition(event.target);
      try {
        if (controller.state().paper?.blocks?.find(item => item.blockId === event.target.dataset.blockId)?.[event.target.dataset.blockField] !== event.target.value) {
          controller.updateBlock(event.target.dataset.blockId, { [event.target.dataset.blockField]: event.target.value }); controller.scheduleSave();
        }
      }
      catch (error) { notify(error.message || '输入失败'); }
      finally {
        if (!composingIds.size) {
          controller.endComposition?.();
          if (deferredDraw) { deferredDraw = false; draw(controller.state()); }
          const pending = afterComposition; afterComposition = null; if (pending) run(pending);
        }
      }
    };
    const finishSealScroll = carousel => {
      cancelSealScroll();
      if (disposed || !ui.sendOpen || ui.sending || ui.sealStamped || sendExit || carousel !== sealCarousel) return;
      const bounds = carousel.getBoundingClientRect?.(); if (!bounds) return;
      const center = (bounds.left + bounds.right) / 2;
      const active = [...(carousel.querySelectorAll?.('[data-seal-style]') || [])].reduce((chosen, item) => {
        const rect = item.getBoundingClientRect?.(); if (!rect || !SEALS.includes(item.dataset.sealStyle)) return chosen;
        const distance = Math.abs((rect.left + rect.right) / 2 - center);
        return !chosen || distance < chosen.distance ? { item, distance } : chosen;
      }, null)?.item;
      if (active && active.dataset.sealStyle !== ui.sentSealStyle&&Stationery.unlocked('seals',active.dataset.sealStyle,controller.state())) { ui.sentSealStyle = active.dataset.sealStyle; updateSendChoices(); }
    };
    const onSealScrollEnd = event => { if (event.target === sealCarousel) finishSealScroll(event.target); };
    const onBookScroll = event => {
      if (event.target === sealCarousel && ui.sendOpen && !ui.sending) {
        cancelSealScroll();
        const carousel = sealCarousel, sourceOwner = ownerKey(controller.state());
        sealScrollTimer = delay(() => { sealScrollTimer = null; if (sourceOwner === ownerKey(controller.state())) finishSealScroll(carousel); }, 120);
        return;
      }
      if (disposed || ui.sheet !== 'books' || !event.target?.matches?.('[data-book-carousel]')) return;
      const carousel = event.target, bounds = carousel.getBoundingClientRect?.();
      if (!bounds) return;
      const center = (bounds.left + bounds.right) / 2;
      const cards = [...(carousel.querySelectorAll?.('[data-book-quarter]') || [])];
      const active = cards.reduce((chosen, card) => {
        const rect = card.getBoundingClientRect?.();
        if (!rect) return chosen;
        const distance = Math.abs((rect.left + rect.right) / 2 - center);
        return !chosen || distance < chosen.distance ? { card, distance } : chosen;
      }, null)?.card;
      if (!active || active.dataset.bookQuarter === ui.bookQuarter) return;
      ui.bookQuarter = active.dataset.bookQuarter;
      for (const card of cards) {
        const selected = card === active;
        if (selected) card.setAttribute?.('data-book-active', ''); else card.removeAttribute?.('data-book-active');
        card.classList?.toggle?.('is-selected', selected);
      }
      const settings = element.querySelector?.('[data-book-cover-settings]');
      if (settings) settings.innerHTML = coverSettings(controller.state(), ui.bookQuarter);
      const keys = bookKeys(controller.state(), Date.now()), index = keys.indexOf(ui.bookQuarter);
      const previous = element.querySelector?.('[data-letter-action="book-prev"]'), next = element.querySelector?.('[data-letter-action="book-next"]');
      if (previous) previous.disabled = index <= 0; if (next) next.disabled = index >= keys.length - 1;
    };
    const hasSelection = () => {
      const selection = root.getSelection?.();
      return selection?.isCollapsed === false || Boolean(String(selection || '').length);
    };
    const startEnvelopeGesture = (target, x, y, pointerId) => {
      if (disposed || !ui.sendOpen || ui.sending || sendExit || hasSelection()) return false;
      const node = target?.closest?.('[data-letter-envelope]');
      if (!node || target.closest?.('button')) return false;
      const lift = readEnvelopeLift(node);
      cancelEnvelopeMotion();
      if (node.style) node.style.transform = lift ? `translateY(${lift}px)` : '';
      if (node.dataset) node.dataset.envelopeMotion = 'dragging';
      const bounds = element.querySelector?.('.x-letter-app')?.getBoundingClientRect?.(), rect = node.getBoundingClientRect?.();
      const travel = bounds && rect ? Math.max(0, rect.bottom - bounds.top) : null;
      const available = bounds ? Math.max(48, y - bounds.top - 8) : null;
      const gain = Number.isFinite(travel) && available ? Math.max(1, travel / available) : 1;
      envelopeTouch = { node, x, y, lift, gain, pointerId, owner: ownerKey(controller.state()), axis: null };
      return true;
    };
    const moveEnvelopeGesture = (x, y) => {
      const gesture = envelopeTouch; if (!gesture) return;
      const dx = x - gesture.x, dy = y - gesture.y;
      if (!gesture.axis && Math.max(Math.abs(dx), Math.abs(dy)) >= 12) {
        gesture.axis = Math.abs(dx) > 1.6 * Math.abs(dy) ? 'x' : Math.abs(dy) > 1.6 * Math.abs(dx) ? 'y' : 'cancelled';
      }
      if (gesture.node.style) gesture.node.style.transform = gesture.axis === 'y' ? `translateY(${Math.min(0, gesture.lift + dy * gesture.gain)}px)` : gesture.lift ? `translateY(${gesture.lift}px)` : '';
      if (gesture.axis !== 'y' || -dy < 48 || Math.abs(dy) <= 1.6 * Math.abs(dx) || hasSelection()) return;
      const bounds = element.querySelector?.('.x-letter-app')?.getBoundingClientRect?.(), rect = gesture.node.getBoundingClientRect?.();
      if (!bounds || !rect || rect.bottom > bounds.top || gesture.owner !== ownerKey(controller.state())) return;
      // A whole envelope outside the APP is the confirmation; releasing later must not spring it back or submit twice.
      const result = confirmSend();
      if (ui.sending) {
        envelopeTouch = null;
        try { if (gesture.pointerId !== 'touch') gesture.node.releasePointerCapture?.(gesture.pointerId); } catch (_) { /* Browser may have released it. */ }
      } else settleEnvelope();
      Promise.resolve(result).catch(error => notify(error.message || '操作失败'));
    };
    const endEnvelopeGesture = (x, y, cancelled = false) => {
      const gesture = envelopeTouch; if (!gesture) return;
      if (!cancelled) moveEnvelopeGesture(x, y);
      // The final release coordinates may complete the exit and consume this gesture.
      // Do not run the ordinary release/cancel return path after confirmation has latched.
      if (envelopeTouch !== gesture) return;
      envelopeTouch = null;
      try { if (gesture.pointerId !== 'touch') gesture.node.releasePointerCapture?.(gesture.pointerId); } catch (_) { /* Already released by the browser. */ }
      if (cancelled || disposed || !ui.sendOpen || ui.sending || gesture.owner !== ownerKey(controller.state()) || hasSelection()) { settleEnvelope(); return; }
      const dx = x - gesture.x, dy = y - gesture.y;
      const bounds = element.querySelector?.('.x-letter-app')?.getBoundingClientRect?.(), rect = gesture.node.getBoundingClientRect?.();
      // Recheck released geometry: keyboard/viewport changes must not authorize a send against stale bounds.
      const sendDistance = bounds && rect ? Math.max(48, (rect.bottom - bounds.top - gesture.lift) / gesture.gain) : null;
      const direction = envelopeGesture(dx, dy, sendDistance);
      if (gesture.axis === 'cancelled') { settleEnvelope(); return; }
      if (direction === 'next' || direction === 'previous') {
        if (gesture.axis && gesture.axis !== 'x') { settleEnvelope(); return; }
        if (gesture.node.style) gesture.node.style.transform = '';
        shiftEnvelopeColor(direction === 'next' ? 1 : -1);
      } else if (direction === 'send' && (!gesture.axis || gesture.axis === 'y') && rect && bounds && rect.bottom <= bounds.top) {
        const result = confirmSend();
        if (!ui.sending) settleEnvelope();
        Promise.resolve(result).catch(error => notify(error.message || '操作失败'));
      } else settleEnvelope();
    };
    const onEnvelopePointerDown = event => {
      if (event.isPrimary === false || event.button != null && event.button !== 0) return;
      if (startEnvelopeGesture(event.target, event.clientX, event.clientY, event.pointerId)) {
        try { envelopeTouch.node.setPointerCapture?.(event.pointerId); } catch (_) { /* Touch fallback remains available. */ }
      }
    };
    const onEnvelopePointerMove = event => {
      if (envelopeTouch?.pointerId === event.pointerId) moveEnvelopeGesture(event.clientX, event.clientY);
    };
    const onEnvelopePointerEnd = event => {
      if (envelopeTouch?.pointerId === event.pointerId) endEnvelopeGesture(event.clientX, event.clientY, event.type === 'pointercancel');
    };
    const onTouchStart = event => {
      gesture = null; const state = controller.state();
      suppressBookClick = false;
      if (ui.sendOpen) {
        if (!root.PointerEvent && event.touches?.length === 1) {
          const touch = event.touches[0]; startEnvelopeGesture(event.target, touch.clientX, touch.clientY, 'touch');
        } else if (event.touches?.length > 1) endEnvelopeGesture(0, 0, true);
        return;
      }
      if (!disposed && ui.sheet === 'books' && ui.bookView === 'single' && event.touches?.length === 1 &&
        !hasSelection() && event.target?.closest?.('[data-book-single]') && !event.target.closest?.('[data-letter-picker],input,textarea,select,a,label')) {
        const touch = event.touches[0];
        gesture = { kind: 'books', x: touch.clientX, y: touch.clientY, owner: ownerKey(state), quarter: ui.bookQuarter }; return;
      }
      const canSwipe = state.paper?.state === 'sent' || state.paper?.state === 'draft' && state.canPrevious;
      if (disposed || ui.sheet || ui.voiceSelectMode || composingIds.size || turnLayer || navigating || state.navigationBusy || !canSwipe ||
        event.touches?.length !== 1 || hasSelection() || !event.target?.closest?.('.x-letter-reader,.x-letter-head,.x-letter-paper,.x-letter-paper-scroll') ||
        event.target.closest?.('textarea,input,select,button,a,label,[contenteditable="true"],[data-answer-question],.x-letter-question,.x-letter-sheet')) return;
      const touch = event.touches[0], width = root.visualViewport?.width || root.innerWidth || 1024;
      if (touch.clientX < 24 || touch.clientX > width - 24) return;
      gesture = { x: touch.clientX, y: touch.clientY, paperId: state.paper.paperId, owner: ownerKey(state) };
    };
    const onTouchMove = event => {
      if (envelopeTouch?.pointerId === 'touch') {
        if (event.touches?.length !== 1) { endEnvelopeGesture(0, 0, true); return; }
        const touch = event.touches[0]; moveEnvelopeGesture(touch.clientX, touch.clientY);
        if (envelopeTouch && event.cancelable) event.preventDefault?.();
        return;
      }
      if (event.touches?.length !== 1) { gesture = null; return; }
      if (!gesture) return;
      const touch = event.touches[0], delta = touch.clientX - gesture.x, dx = Math.abs(delta), dy = Math.abs(touch.clientY - gesture.y);
      // 手指有一点上下抖动不取消翻篇手势；明显是竖向滚动时才放弃。
      if (dy >= 18 && dy > 1.4 * dx || hasSelection()) gesture = null;
    };
    const onTouchEnd = event => {
      if (envelopeTouch?.pointerId === 'touch') {
        const touch = event.changedTouches?.[0];
        endEnvelopeGesture(touch?.clientX || 0, touch?.clientY || 0, Boolean(event.touches?.length || event.changedTouches?.length !== 1)); return;
      }
      const start = gesture; gesture = null;
      if (!start || disposed || composingIds.size || event.touches?.length || event.changedTouches?.length !== 1 || hasSelection()) return;
      const state = controller.state(), touch = event.changedTouches[0];
      if (start.kind === 'books') {
        if (ui.sheet !== 'books' || ui.bookView !== 'single' || ownerKey(state) !== start.owner || ui.bookQuarter !== start.quarter) return;
        const dx = touch.clientX - start.x, dy = touch.clientY - start.y;
        if (Math.abs(dx) >= 48 && Math.abs(dx) > 1.5 * Math.abs(dy)) { suppressBookClick = Date.now() + 400; shiftBook(dx < 0 ? 1 : -1); }
        return;
      }
      if (state.paper?.paperId !== start.paperId || ownerKey(state) !== start.owner || ui.sheet || ui.voiceSelectMode) { cancelTurn(); return; }
      const dx = touch.clientX - start.x, dy = touch.clientY - start.y;
      if (Math.abs(dx) >= 28 && Math.abs(dx) > 1.15 * Math.abs(dy)) run(() => turnPage(dx < 0 ? 'next' : 'previous'));
    };
    const onTouchCancel = () => { gesture = null; endEnvelopeGesture(0, 0, true); };
    const onKeyDown = event => {
      if (ui.sendOpen && event.key === 'Escape') { event.preventDefault?.(); resumeWriting(); return; }
      if (ui.sendOpen && event.target?.matches?.('[data-letter-envelope]') && ['ArrowLeft','ArrowRight'].includes(event.key)) {
        event.preventDefault?.(); shiftEnvelopeColor(event.key === 'ArrowRight' ? 1 : -1); return;
      }
      if (event.key === 'Escape' && ui.toolsOpen) {
        ui.toolsOpen = false;
        const popup = element.querySelector?.('[data-letter-tools]'); if (popup) popup.hidden = true;
        const trigger = element.querySelector?.('[data-letter-action="toggle-tools"]'); trigger?.setAttribute?.('aria-expanded', 'false'); trigger?.focus?.();
      }
      else if (event.key === 'Escape' && ui.sheet) { event.preventDefault?.(); closeSheet(); }
      else if (event.key === 'Tab' && ui.sheet) {
        const sheet = element.querySelector?.('.x-letter-sheet:not([hidden])');
        const controls = [...(sheet?.querySelectorAll?.('button:not([disabled]), textarea, select, input, [tabindex="0"]') || [])]
          .filter(control => !control.closest?.('[hidden]'));
        if (!controls.length) return;
        const first = controls[0], last = controls.at(-1), active = element.ownerDocument?.activeElement || root.document?.activeElement;
        const outside = typeof sheet?.contains === 'function' ? !sheet.contains(active) : !controls.includes(active);
        if (outside) { event.preventDefault?.(); (event.shiftKey ? last : first).focus?.(); }
        else if (event.shiftKey && active === first) { event.preventDefault?.(); last.focus?.(); }
        else if (!event.shiftKey && active === last) { event.preventDefault?.(); first.focus?.(); }
      }
    };
    element.addEventListener('focusin', onFocusIn);
    element.addEventListener('focusout', onFocusOut);
    element.addEventListener('compositionstart', onCompositionStart);
    element.addEventListener('compositionend', onCompositionEnd);
    element.addEventListener('keydown', onKeyDown);
    element.addEventListener('scroll', onBookScroll, true);
    element.addEventListener('scrollend', onSealScrollEnd, true);
    element.addEventListener('touchstart', onTouchStart, { passive: true });
    element.addEventListener('touchmove', onTouchMove, { passive: false });
    element.addEventListener('touchend', onTouchEnd, { passive: true });
    element.addEventListener('touchcancel', onTouchCancel, { passive: true });
    element.addEventListener('pointerdown', onEnvelopePointerDown);
    element.addEventListener('pointermove', onEnvelopePointerMove);
    element.addEventListener('pointerup', onEnvelopePointerEnd);
    element.addEventListener('pointercancel', onEnvelopePointerEnd);
    return Object.freeze({ draw, dispose: () => {
      if (disposed) return;
      afterComposition = null; ui.sending = false; waitingForComposition = false; ui.sheet = '';
      disposed = true; closeUnlockDialog();
      cancelSendExit(); cancelEnvelopeMotion(); cancelSealScroll(); sealCarousel = null; envelopeTouch = null; draftReturn = null; ui.sendOpen = false;
      for (const target of [...compositionTargets.values()]) onCompositionEnd({ target });
      viewGeneration++; turnRequestId++; activeTurn = null;
      cancelTurn(); gesture = null; afterComposition = null; compositionTargets.clear(); composingIds.clear();
      ui.answers = {}; ui.answerOptionIndices = {}; ui.sheet = ''; ui.selectedBlockId = null;
      clearBoundary(); if (player) player.dispose(); else voice()?.stopLetterVoice?.();
      stopTurnSound(); turnAudio?.removeAttribute?.('src'); turnAudio?.load?.(); turnAudio = null;
      element.removeEventListener?.('click', onClick);
      element.removeEventListener?.('change', onChange);
      element.removeEventListener?.('input', onInput);
      element.removeEventListener?.('focusin', onFocusIn);
      element.removeEventListener?.('focusout', onFocusOut);
      element.removeEventListener?.('compositionstart', onCompositionStart);
      element.removeEventListener?.('compositionend', onCompositionEnd);
      element.removeEventListener?.('keydown', onKeyDown);
      element.removeEventListener?.('scroll', onBookScroll, true);
      element.removeEventListener?.('scrollend', onSealScrollEnd, true);
      element.removeEventListener?.('touchstart', onTouchStart);
      element.removeEventListener?.('touchmove', onTouchMove);
      element.removeEventListener?.('touchend', onTouchEnd);
      element.removeEventListener?.('touchcancel', onTouchCancel);
      element.removeEventListener?.('pointerdown', onEnvelopePointerDown);
      element.removeEventListener?.('pointermove', onEnvelopePointerMove);
      element.removeEventListener?.('pointerup', onEnvelopePointerEnd);
      element.removeEventListener?.('pointercancel', onEnvelopePointerEnd);
      viewport?.removeEventListener?.('resize', syncHeight);
      viewport?.removeEventListener?.('scroll', syncHeight);
      root.removeEventListener?.('resize', syncHeight);
      panel?.style?.removeProperty?.('--x-letter-available-height');
      controller.dispose();
    } });
  }
  return Object.freeze({ render, mount, envelopeGesture });
});
