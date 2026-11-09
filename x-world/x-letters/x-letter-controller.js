((root, factory) => {
  const api = factory(root || {});
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SHEXXLettersController = api;
})(typeof window !== 'undefined' ? window : globalThis, root => {
  'use strict';
  const Stationery = root.SHEXXLettersStationery || (typeof require === 'function' ? require('./x-letter-stationery') : null);
  const IncomingStatus = root.SHEXXLettersIncomingStatus || (typeof require === 'function' ? require('./x-letter-incoming-status') : null);
  const PAPER_TEMPLATES = Object.freeze(Stationery.papers.map(item=>item.id));
  const COVER_TEMPLATES = Object.freeze(Stationery.covers.map(item=>item.id));
  const STAMPS = Object.freeze([null, 'stamp-default-1']);
  const SEALS = Object.freeze(Stationery.seals.map(item=>item.id));
  const DEFAULT_QUARTER = () => { const now = new Date(Date.now() + 8 * 3600 * 1000); return `${now.getUTCFullYear()}-Q${Math.floor(now.getUTCMonth() / 3) + 1}`; };
  // Only expires a cosmetic loading preview; archive boundaries and month access remain server-authoritative.
  const PREVIEW_MONTH = () => new Date(Date.now() + 8 * 3600000).toISOString().slice(0,7);
  const id = () => typeof root.crypto?.randomUUID === 'function' ? root.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const requestId = () => `letter-ui:${id()}`;
  const clone = value => JSON.parse(JSON.stringify(value));
  function validate(blocks) {
    if (blocks.length > 20) throw new Error('一封信最多 20 个内容块');
    if (blocks.filter(block => block.type === 'image').length > 3) throw new Error('一封信最多 3 张图片');
    if (blocks.filter(block => block.type === 'question').length > 20) throw new Error('一封信最多 20 个问题');
    const text = blocks.filter(block => block.type === 'text');
    if (text.some(block => String(block.text || '').length > 1200)) throw new Error('单段文字最多 1200 字');
    if (text.reduce((sum, block) => sum + String(block.text || '').length, 0) > 3000) throw new Error('普通文字合计最多 3000 字');
  }
  function createController(options = {}) {
    const api = options.api || root.SHEXXLettersAPI;
    const missingIncoming = () => ({available:false,dailyAvailable:false,hasUnread:false,capabilities:{},error:'收信组件尚未加载，请刷新页面'});
    const incomingStatus = options.incomingStatus || IncomingStatus?.createStore({api}) || {
      snapshot:missingIncoming,refresh:async()=>missingIncoming(),subscribe:()=>()=>{}};
    let incomingRequest = null;
    const core = options.core || root.SHEXXLettersCore;
    const currentOwner = options.currentOwner || (() => null);
    const currentReplyMode = () => {
      const mode = options.currentReplyMode ? options.currentReplyMode() : 'card';
      return ['ai', 'card'].includes(mode) ? mode : null;
    };
    const notify = options.notify || (() => {});
    const stopVoice = options.stopVoice || (() => root.SHEXVoice?.stopLetterVoice?.());
    const revokeMedia = options.revokeMedia || (url => { if (String(url).startsWith('blob:')) root.URL?.revokeObjectURL?.(url); });
    const cache = options.cache || core?.createCache?.();
    const data = { owner: null, books: [], booksCursor: null, papers: [], paper: null, chain: [], legacyPapers: [], quarterKey: '', cursor: null,
      legacyCursor: null, chainCursor: null, legacyExpanded: false, legacyTruncated: false, drafts: [], draftsExpanded: false, draftsCursor: null,
      mode: 'read', status: '', busy: false, media: {}, bookmarkIds: {}, coverPreview: '' };
    data.continuousReady = false; data.capabilityWarning = ''; data.newestKnown = false;
    data.monthlyReady = false; data.cutoff = null; data.bookKey = ''; data.currentMonthKey = '';
    data.stationeryUnlock=null;data.claimingBook=false;
    const sealedIncoming=new Set();
    const sealKey=(owner,paperId)=>JSON.stringify([owner?.userId||'',owner?.dreamId||'',paperId]);
    const readingKey = () => data.monthlyReady ? data.bookKey : data.quarterKey;
    const keyOf = book => data.monthlyReady ? book.bookKey : book.quarterKey;
    const monthlyRows = result => (result.items || []).filter(book => book.bookKey === 'archive' || /^\d{4}-(?:0[1-9]|1[0-2])$/.test(book.bookKey)).slice(0, 21);
    function applyStationeryUnlock(result){
      const incoming=result.stationeryUnlock;if(!incoming||![1,2].includes(incoming.stage))return;
      // A slower directory response cannot undo a confirmed claim or early unlock in this account session.
      const current=data.stationeryUnlock;
      const early=(current?.early?.length||0)>(incoming.early?.length||0)?current.early:incoming.early;
      data.stationeryUnlock=current?.stage===2?{...incoming,early,stage:2,canClaimSecond:false}:{...incoming,early};
    }
    function paperMonthlyKey(paper) {
      if (!data.monthlyReady) return null;
      const created = paper?.createdAt, visible = paper?.visibilityAt;
      if (paper?.state === 'draft') return Number.isFinite(created) && created > 0
        ? created < data.cutoff ? 'archive' : new Date(created + 8 * 3600000).toISOString().slice(0, 7) : null;
      if (paper?.state !== 'sent') return null;
      if (paper.legacySource && created === 0 && visible == null) return 'archive';
      if (typeof created !== 'number' || !Number.isFinite(created) || created <= 0 || typeof visible !== 'number' || !Number.isFinite(visible) || visible <= 0) return null;
      const time = Math.max(created, visible);
      return time < data.cutoff ? 'archive' : new Date(time + 8 * 3600000).toISOString().slice(0, 7);
    }
    function readPage(input) {
      if (data.monthlyReady) {
        const {bookKey, quarterKey, continuousBook, ...rest} = input;
        return api.listMonthlyPapers({...rest, bookKey: bookKey || quarterKey || data.bookKey, includeHidden: true, ...draftPaging()});
      }
      return api.listPapers({...input, ...draftPaging()});
    }
    const draftPaging = () => data.capabilities?.draftBookPaging === 1 ? {includeDrafts:true} : {};
    function readBooks(input) { return data.monthlyReady ? api.listMonthlyBooks(input) : api.listBooks(input); }
    data.capabilities = {}; data.favorites = []; data.favoritesCursor = null; data.favoritesLoading = false;
    data.favoritesError = ''; data.reply = { status: 'idle', label: '', busy: false }; data.sendAttempt = null;
    const sendContexts = new Map();
    let generation = 0;
    let navigation = 0;
    let saveTimer = null;
    let pendingSave = Promise.resolve();
    let autosavePending = null;
    let autosaveRunning = false;
    const savingSnapshots = new Map();
    const savingContents = new Map();
    const readingQueues = new Map(); // Per owner: one issued write and one coalesced latest target; settled queues are released.
    let savedSignature = '';
    const draftSignatures = new Map();
    let stagedDraft = null;
    let windowPages = [];
    let pageMetadata = new Map(); // At most 100 page positions, independently of the 240-summary window.
    const writeLocks = new Map();
    let neighborBusy = false, draftsLoading = false;
    let composition = null;
    let booksLoading = false, booksRefresh = null, booksRevision = 0, booksPaged = false;
    let bookCounts = new Map();
    data.booksStale = false; data.booksRefreshing = false; data.booksError = '';
    let writingDraft = null;
    let writingReturn = null;
    let bookClaim=null,latestWriting=null;
    const allocations = new Map();
    const localFlushes = new Map();
    let draftPreservation = null;
    const pendingNewDrafts = new Map(); // Current owner only; unresolved requests must never be evicted for another source.
    const preservationCurrent = operation => Boolean(operation && operation.epoch === generation && operation.token === navigation
      && same(operation.selected) && data.paper === operation.paper);
    let onChange = options.onChange || (() => {});
    function markOpeningStage(error, stage) {
      if (error && typeof error === 'object') try { if (!error.openingStage) error.openingStage = stage; } catch (_) {}
      return error;
    }
    const emit = kind => {
      let snapshot;
      try { snapshot = state(); } catch (error) { throw markOpeningStage(error, 'frontend_state'); }
      try { onChange(snapshot, kind); } catch (error) { throw markOpeningStage(error, 'view_render'); }
    };
    const unsubscribeIncoming = incomingStatus.subscribe(selected => { if(same(selected)) emit('incoming'); });
    let autoOpenAfterOpen = null;
    const autoOpenedIncoming = new Set();
    // Opens an unread letter from TA once per session so its envelope is the first thing shown.
    // At opening this wins over the saved draft (it stays saved); after an explicit 收信 it never pulls you away from writing.
    // 打开 X信件：今天的来信还没领就自动领（会员免费，其他账号照常 2 X能量），然后直接停在信封上。
    async function receiveAtOpen(selected) {
      if (options.autoReceive === false) return autoOpenIncoming(selected, true);
      const status = incomingStatus.snapshot(selected), op = status.dailyOperation;
      const due = currentReplyMode() === 'card' && status.available && status.capabilities?.dailyCardClaim === 1 && status.capabilities?.cardBilling === 2
        && (status.dailyAvailable || op?.operationId && op.status !== 'completed' && op.status !== 'retryable_failed');
      if (due) {
        try { await collectIncoming({ atOpen: true }); }
        catch (error) {
          if (!same(selected)) return;
          data.status = error?.code === 'ENERGY_NOT_ENOUGH' ? 'X能量不足，今日来信暂未送达，也没有扣费' : '今日来信暂未送达，请稍后重试';
          emit('status');
        }
      }
      if (same(selected)) await autoOpenIncoming(selected, true);
    }
    async function autoOpenIncoming(selected, atOpen) {
      const status = incomingStatus.snapshot(selected), paperId = status.unreadPaperId;
      if (!status.hasUnread || !paperId || !same(selected)) return;
      const key = sealKey(selected, paperId);
      if (autoOpenedIncoming.has(key)) return;
      if (data.paper?.paperId === paperId) { autoOpenedIncoming.add(key); return; }
      const writing = data.paper?.state === 'draft' && (data.paper.blocks || []).some(block => block.type !== 'text' || String(block.text || '').trim());
      if (data.busy || data.sendAttempt || !atOpen && writing) return;
      autoOpenedIncoming.add(key);
      try { await openPaper(paperId); } catch (_) { autoOpenedIncoming.delete(key); }
    }
    async function refreshIncoming(force=false) {
      const selected=ensureOwner();return incomingStatus.refresh(selected,{force});
    }
    function pendingIncoming(){
      if(!data.owner||!same(data.owner))return [];
      const current=incomingStatus.snapshot(data.owner).dailyOperation?.operationId;
      return (api.pendingFor?.(data.owner.dreamId)||[]).filter(row=>row.action==='requestIncomingLetter'&&row.operationId&&row.operationId!==current);
    }
    async function checkPendingIncoming(){
      const selected=ensureOwner(),epoch=generation,pending=pendingIncoming()[0];if(!pending)return;
      const result=await api.getOperation({dreamId:selected.dreamId,operationId:pending.operationId});
      if(epoch!==generation||!same(selected))return;
      data.incomingRecovery={...result,operationId:pending.operationId};emit('incoming');return result;
    }
    function resumePendingIncoming(){
      const selected=ensureOwner(),saved=data.incomingRecovery,epoch=generation;if(!saved?.operationId)return Promise.resolve();
      if(saved.status==='completed')return Promise.resolve(saved);
      if(![0,2,5,6,10].includes(saved.energyCost))return Promise.reject(new Error('旧收信费用尚未确认，请重新查询'));
      if(incomingRequest?.userId===selected.userId&&incomingRequest?.dreamId===selected.dreamId)return incomingRequest.promise;
      const operation={...selected,promise:null};operation.promise=(async()=>{
        let result;
        try{result=await api.resumeOperation({dreamId:selected.dreamId,operationId:saved.operationId,requestId:`letter-incoming-resume:${saved.operationId}`});}
        catch(error){
          if(epoch!==generation||!same(selected))return;
          if(/NOT_FOUND|INVALID_OPERATION|OPERATION_IMMUTABLE|EXPIRED/.test(String(error?.code||''))){api.discardPendingOperation?.({dreamId:selected.dreamId,operationId:saved.operationId});data.incomingRecovery=null;data.status='这封旧来信已失效，已清除';emit('incoming');emit('status');return;}
          throw new Error(/X能量|能量不足|ENERGY/i.test(`${error?.message||''}${error?.code||''}`)?'X能量不足，暂时收不了这封':'暂时没能继续收这封，请稍后再试');
        }
        if(epoch!==generation||!same(selected))return;
        data.incomingRecovery={...saved,...result};booksRevision++;data.booksStale=true;
        // 点了要有反馈：没完成就说明原因；任务已失效就从本机清掉，不再一直挂着。
        if(result?.status!=='completed'){
          if(['waiting_delivery','claimed','generating','charging','pending'].includes(result?.status))data.status='这封来信还在路上，稍后再来看看';
          else if(result?.status==='retryable_failed')data.status='这封来信暂时没收成功，可以稍后再试';
          else{api.discardPendingOperation?.({dreamId:selected.dreamId,operationId:saved.operationId});data.incomingRecovery=null;data.status='这封旧来信已失效，已清除';}
        }
        await incomingStatus.refresh(selected,{force:true,afterMutation:true});
        if(epoch===generation&&same(selected)){emit('incoming');emit('status');}return result;
      })().finally(()=>{if(incomingRequest===operation){incomingRequest=null;if(epoch===generation&&same(selected))emit('incoming');}});
      incomingRequest=operation;emit('incoming');return operation.promise;
    }
    function dismissPendingIncoming(){
      const selected=ensureOwner(),saved=data.incomingRecovery||{operationId:pendingIncoming()[0]?.operationId};
      if(saved?.operationId)api.discardPendingOperation?.({dreamId:selected.dreamId,operationId:saved.operationId});
      data.incomingRecovery=null;data.status='已清除这封旧收信';emit('incoming');emit('status');
    }
    function viewRecoveredIncoming(){const saved=data.incomingRecovery;if(saved?.status==='completed'&&saved.resultPaperId)return openPaper(saved.resultPaperId);}
    function collectIncoming({ atOpen = false } = {}) {
      const selected=ensureOwner();if(incomingRequest?.userId===selected.userId&&incomingRequest?.dreamId===selected.dreamId)return incomingRequest.promise;
      const epoch=generation, operation={...selected,promise:null};
      operation.promise=(async()=>{
        let status=incomingStatus.snapshot(selected);
        if(!status.available)status=await refreshIncoming(true);
        if(!same(selected)||epoch!==generation)return;
        if(currentReplyMode()!=='card'||!status.available||status.capabilities?.dailyCardClaim!==1||status.capabilities?.cardBilling!==2)throw new Error(status.error||'每日收信需要更新后台 shexXLetters');
        const saved=status.dailyOperation;
        if(!status.dailyAvailable&&!saved?.operationId)return;
        if(saved?.status==='completed')return;
        const pending=api.pendingFor?.(selected.dreamId)?.find(row=>row.action==='requestIncomingLetter'&&row.payload?.purpose==='daily_card'&&row.requestId.startsWith(`letter-daily:${status.dateKey}:`));
        const result=saved?.operationId
          ? await api.resumeOperation({dreamId:selected.dreamId,operationId:saved.operationId,requestId:`letter-incoming-resume:${saved.operationId}`})
          : await api.requestIncomingLetter(pending?.payload||{dreamId:selected.dreamId,purpose:'daily_card',deliveryMode:'immediate',requestId:`letter-daily:${status.dateKey}:${id()}`});
        if(!same(selected)||epoch!==generation)return;
        booksRevision++;data.booksStale=true;
        await incomingStatus.refresh(selected,{force:true,afterMutation:true});
        if(!same(selected)||epoch!==generation)return;
        if(result.status==='completed'){data.status='';emit('incoming');await autoOpenIncoming(selected,atOpen);return result;}
        data.status=result.status==='completed'?'来信已收到，点击“查看来信”阅读':result.status==='retryable_failed'?'收信未完成，可点击重试收信':'来信正在准备，可点击继续收信';emit('incoming');return result;
      })().finally(()=>{if(incomingRequest===operation){incomingRequest=null;if(same(selected)&&epoch===generation)emit('incoming');}});
      incomingRequest=operation;emit('incoming');return operation.promise;
    }
    async function viewIncoming(){const status=incomingStatus.snapshot(ensureOwner());if(status.hasUnread&&status.unreadPaperId)return openPaper(status.unreadPaperId);}
    const replyModule = options.replyModule || root.SHEXXLettersReplyFlow || (typeof require === 'function' ? require('./x-letter-reply-flow') : null);
    const replyFlow = replyModule?.createReplyFlow({ api, currentOwner, mode: currentReplyMode,
      onChange: value => {
        data.reply = value;
        if (value.sourcePaperId && same(data.owner)) {
          const context = loadSendContext(data.owner, value.sourcePaperId);
          if (context?.phase === 'sent' && value.status === 'completed') updateSendContext(data.owner, context, { replyStage: 'completed' });
        }
        emit('reply');
      },
      onComplete: async result => {
        if (!same(result.owner)) return;
        booksRevision++; data.booksStale = true;
        // Opening only this completed reply never walks an entire book. Do not steal the view after the reader moved on.
        if (data.paper?.paperId === result.sourcePaperId) await openPaper(result.resultPaperId);
      } });
    let confirming = false;
    // 一套一套的风格：选了哪本书皮，新写的信默认用同一套的信纸和邮章（用户仍可自己换）。没配套的书皮用原来的默认。
    const STYLE_SETS = Stationery.styleSets;
    const styleSet = () => { const set = STYLE_SETS[data.coverPreview] || {}; return { paper: set.paper&&Stationery.unlocked('papers',set.paper,data)?set.paper:PAPER_TEMPLATES[0], seal: set.seal&&Stationery.unlocked('seals',set.seal,data)?set.seal:SEALS[0] }; };
    // 新季度还没寄出第一封信时云端没有书册，选好的书皮先记在本机，等书册建好后自动保存到云端。
    const coverPickKey = quarterKey => data.owner ? `shex_x_letter_cover_pick_v1:${data.owner.userId}:${data.owner.dreamId}:${quarterKey}` : '';
    function readCoverPick(quarterKey) {
      try { const value = root.localStorage?.getItem(coverPickKey(quarterKey)); return COVER_TEMPLATES.includes(value) ? value : null; } catch (_) { return null; }
    }
    function writeCoverPick(quarterKey, value) {
      try { if (value) root.localStorage?.setItem(coverPickKey(quarterKey), value); else root.localStorage?.removeItem(coverPickKey(quarterKey)); } catch (_) {}
    }
    function resolveCover(quarterKey) {
      if (data.monthlyReady) {
        const resolved = data.books.find(item => item.bookKey === quarterKey)?.coverTemplateId || COVER_TEMPLATES[0];
        if (quarterKey === data.currentMonthKey) rememberOpeningCover(resolved, quarterKey);
        return resolved;
      }
      const book = data.books.find(item => item.quarterKey === quarterKey), pick = readCoverPick(quarterKey);
      if (book && !book.legacyOnly && pick) {
        if (pick !== book.coverTemplateId) { void selectCover(pick, quarterKey).then(() => writeCoverPick(quarterKey, null)).catch(() => {}); return pick; }
        writeCoverPick(quarterKey, null);
      }
      const resolved = pick || book?.coverTemplateId || COVER_TEMPLATES[0];
      // 记住当前季度的书皮：下次进信笺时，数据还没读回来就能先把这本书皮显示出来。
      if (quarterKey === DEFAULT_QUARTER()) rememberOpeningCover(resolved);
      return resolved;
    }
    const openingCoverKey = () => data.owner ? `shex_x_letter_opening_cover_v1:${data.owner.userId}:${data.owner.dreamId}` : '';
    function rememberOpeningCover(value, key = DEFAULT_QUARTER()) {
      try {
        const preview = `${key}|${value}`;
        if (COVER_TEMPLATES.includes(value) && root.localStorage?.getItem(openingCoverKey()) !== preview)
          root.localStorage?.setItem(openingCoverKey(), preview);
      } catch (_) {}
    }
    function readOpeningCover(monthly = false) {
      try { const [key, cover] = String(root.localStorage?.getItem(openingCoverKey()) || '').split('|'); return key === (monthly ? PREVIEW_MONTH() : DEFAULT_QUARTER()) && COVER_TEMPLATES.includes(cover) ? cover : ''; } catch (_) { return ''; }
    }
    function needsCoverPick() {
      return false;
    }
    const coverChosenKey = quarterKey => data.owner ? `shex_x_letter_cover_chosen_v1:${data.owner.userId}:${data.owner.dreamId}:${quarterKey}` : '';
    function coverPicks() {
      const picks = {};
      for (const key of new Set([...data.books.map(book => book.quarterKey), data.quarterKey, DEFAULT_QUARTER()])) {
        const pick = key ? readCoverPick(key) : null; if (pick) picks[key] = pick;
      }
      return picks;
    }
    // 字卡只通过收信按钮领取；AI 既有明确开启设置继续生效，未设置保持关闭。
    const HOUR = 3600000, PROACTIVE_WAITING = ['claimed', 'billed', 'generating'];
    const proactiveKey = selected => `shex_x_letter_proactive_v1:${selected.userId}:${selected.dreamId}`;
    function readProactive(selected = data.owner) {
      if (!selected) return {};
      try { const value = JSON.parse(root.localStorage?.getItem(proactiveKey(selected)) || '{}'); return value && typeof value === 'object' ? value : {}; }
      catch (_) { return {}; }
    }
    function writeProactive(selected, patch) {
      const next = { ...readProactive(selected), ...patch };
      try { root.localStorage?.setItem(proactiveKey(selected), JSON.stringify(next)); } catch (_) {}
      return next;
    }
    const beijingDay = time => new Date(time + 8 * HOUR).toISOString().slice(0, 10);
    function setProactive(on) {
      const selected = ensureOwner();
      writeProactive(selected, on ? { on: true, nextAt: readProactive(selected).nextAt || Date.now() } : { on: false });
      emit();
    }
    let proactiveRunning = false;
    async function maybeRequestIncoming() {
      const selected = data.owner, mode = currentReplyMode(), startedAt = Date.now(), epoch = generation;
      if (!selected || mode !== 'ai' || proactiveRunning || typeof api.requestIncomingLetter !== 'function') return;
      const saved = readProactive(selected);
      const latest = data.papers.filter(item => item.authorType === 'dream' && item.relationType !== 'reply' && !item.legacySource)
        .reduce((max, item) => Math.max(max, Number(item.sentAt || item.createdAt) || 0), 0);
      let requestId;
        if (!saved.on) return;
        if (saved.pendingId) requestId = saved.pendingId;
        else {
          if (startedAt < (Number(saved.nextAt) || 0) || latest && startedAt - latest < 48 * HOUR) return;
          requestId = `letter-proactive:${Math.floor(startedAt / 1000)}`;
          writeProactive(selected, { pendingId: requestId });
        }
      proactiveRunning = true;
      try {
        const payload = { dreamId: selected.dreamId, requestId, deliveryMode: 'immediate' };
        let result = await api.requestIncomingLetter(payload);
        for (let round = 0; round < 10 && epoch === generation && same(selected) && PROACTIVE_WAITING.includes(result?.status) && typeof api.call === 'function'; round++) {
          await new Promise(resolve => root.setTimeout(resolve, 15000));
          if (epoch !== generation || !same(selected)) return;
          result = await api.call('requestIncomingLetter', payload, { skipOperationLookup: true });
        }
        if (epoch !== generation || !same(selected)) return;
        if (result?.status === 'completed' && result.resultPaperId) {
          writeProactive(selected, { pendingId: null, last: Date.now(), nextAt: Date.now() + (48 + Math.random() * 24) * HOUR });
          booksRevision++; data.booksStale = true;
          notify('TA 给你写了一封信');
          const writing = data.paper?.state === 'draft' && (data.paper.blocks || []).some(block => block.type !== 'text' || String(block.text || '').trim());
          if (!writing) await openPaper(result.resultPaperId);
        } else if (mode === 'ai' && result?.status === 'failed') {
          writeProactive(selected, { pendingId: null, nextAt: Date.now() + 6 * HOUR });
        }
      } catch (_) { /* 主动来信失败不打扰用户，下次进入信笺时用同一个请求号接着处理。 */ }
      finally { proactiveRunning = false; }
    }
    const state = () => ({ ...data, ...readingPosition(), sealedIncoming: sealedPaperIds(), replyMode: currentReplyMode(), proactive: { on: Boolean(readProactive().on) }, needsCoverPick: needsCoverPick(),
      coverPicks: coverPicks(),
      incoming: {...incomingStatus.snapshot(data.owner), busy:Boolean(incomingRequest&&incomingRequest.userId===data.owner?.userId&&incomingRequest.dreamId===data.owner?.dreamId)},
      pendingIncomingCount:pendingIncoming().length,
      replyEnergyCost: currentReplyMode() === 'ai' ? 6 : currentReplyMode() === 'card' && data.capabilities.cardBilling===2 ? 2 : null, favorites: [...data.favorites],
      reply: { ...data.reply }, sendAttempt: data.sendAttempt ? { ...data.sendAttempt } : null, capabilities: { ...data.capabilities },
      editLocked: Boolean(preservationCurrent(draftPreservation) || writeLocks.get(data.paper?.paperId) || confirming && data.paper?.state === 'draft' || data.sendAttempt?.phase === 'uncertain'), navigationBusy: neighborBusy,
      owner: data.owner ? { ...data.owner } : null, drafts: [...data.drafts],
      books: [...data.books], papers: [...data.papers], chain: [...data.chain], legacyPapers: [...data.legacyPapers],
      paper: data.paper ? clone(data.paper) : null, media: { ...data.media }, bookmarkIds: { ...data.bookmarkIds } });
    function owner() {
      const value = currentOwner();
      if (!value?.userId || !value?.dreamId) throw new Error('请先登录并选择梦角');
      return { userId: String(value.userId), dreamId: String(value.dreamId), dreamName: String(value.dreamName || '梦角') };
    }
    const same = (target = data.owner) => { const fresh = currentOwner(); return target && fresh?.userId === target.userId && fresh?.dreamId === target.dreamId; };
    const sendKey = (selected, paperId) => JSON.stringify([selected.userId, selected.dreamId, paperId]);
    function loadSendContext(selected, paperId) {
      if (!selected || !same(selected)) return null;
      const key = sendKey(selected, paperId);
      return sendContexts.get(key) || api.sendContext?.(selected.dreamId, paperId) || null;
    }
    function showSendContext(context) {
      data.sendAttempt = context ? { paperId: context.paperId, phase: context.phase,
        message: context.phase === 'uncertain' ? '寄出结果待确认，请重试核实' : context.phase === 'failed' ? context.failureMessage || '未寄出，请重试' : context.phase === 'sent' ? '已寄出' : '正在寄出…',
        canRetry: ['failed', 'uncertain'].includes(context.phase) || context.phase === 'sent' && context.replyStage === 'ready',
        replyPending: context.phase === 'sent' && context.replyStage !== 'completed' } : null;
    }
    function rememberSendContext(key, context) {
      sendContexts.set(key, context);
      while (sendContexts.size > 50) sendContexts.delete(sendContexts.keys().next().value);
    }
    function updateSendContext(selected, context, patch = {}) {
      const next = { ...context, ...patch, userId: selected.userId, dreamId: selected.dreamId };
      if (!same(selected)) return next;
      const key = sendKey(selected, next.paperId);
      // Durable settings precede every cloud side effect. This journal contains no draft content.
      try { api.stageSendContext?.(next); }
      catch (error) {
        const failed = { ...next, phase: next.phase === 'sent' ? 'sent' : next.sendIssued ? 'uncertain' : 'failed',
          failureStage: 'recovery_storage', failureMessage: '本机恢复记录保存失败，请检查存储空间后重试' };
        rememberSendContext(key, failed);
        if (data.paper?.paperId === next.paperId) { showSendContext(failed); data.status = data.sendAttempt.message; emit('status'); }
        throw error;
      }
      rememberSendContext(key, next);
      if (next.previousPaperId) sendContexts.delete(sendKey(selected, next.previousPaperId));
      if (data.paper?.paperId === next.paperId) showSendContext(next);
      return next;
    }
    function captureSendIntent(selected, settings = {}, withReply = true) {
      const paper = data.paper, previous = loadSendContext(selected, paper.paperId);
      return updateSendContext(selected, previous || { paperId: paper.paperId, sendRequestId: requestId(), replyRequestId: `letter-reply:${paper.paperId}`,
        localQuarterKey: paper.localDraft ? paper.quarterKey : '',
        deliveryMode: settings.deliveryMode || 'immediate', expectedMode: settings.expectedMode || currentReplyMode(),
        sentSealStyle: settings.sentSealStyle || paper.sentSealStyle || SEALS[0], stampId: settings.stampId === undefined ? paper.stampId || null : settings.stampId,
        advanceToWriting: settings.advanceToWriting === true, replyStage: withReply ? 'ready' : 'completed' }, { phase: 'sending', sendIssued: false, failureMessage: '', failureStage: '' });
    }
    function sendFailureMessage(error, stage) {
      if (stage === 'allocation') return '草稿建立失败，寄出选择已保留，请重试';
      if (stage === 'recovery_storage') return '本机恢复记录保存失败，请检查存储空间后重试';
      const known = ['后台尚未更新寄出确认，请先更新 shexXLetters', '回复模块尚未加载，请更新前端文件', '上一封回复仍在处理中，请稍后再寄出',
        '正在确认费用，请稍后再寄出', '回复模式已改变，请重新确认费用', '邮章无效', '寄出状态章无效', '当前模式不支持这个回复时间'];
      if (known.includes(error?.message)) return error.message;
      if (['SEND_CONTEXT_LIMIT', 'LOCAL_DRAFT_LIMIT', 'PENDING_LIMIT'].includes(error?.code)) return '本机恢复记录空间已满，请释放存储空间后重试';
      return /^[A-Z][A-Z0-9_]{0,79}$/.test(error?.code || '') ? `未寄出，请重试（${error.code}）` : '未寄出，请重试';
    }
    function failSendIntent(selected, paperId, error, stage) {
      const context = loadSendContext(selected, data.paper?.paperId) || loadSendContext(selected, paperId);
      if (!context || !same(selected) || ['sent', 'uncertain'].includes(context.phase)) return;
      try { updateSendContext(selected, context, { phase: context.phase === 'sending' && context.sendIssued ? 'uncertain' : 'failed',
        failureMessage: sendFailureMessage(error, stage || context.failureStage) }); } catch (_) { /* Keep memory retry when storage is unavailable. */ }
      if (data.paper?.paperId === context.paperId) { data.status = data.sendAttempt.message; emit('status'); }
    }
    function validateReplyIntent(context, needsDraft = true) {
      if (context.replyStage === 'completed') return;
      if (needsDraft && data.capabilities.sentSealStyle !== 1) throw new Error('后台尚未更新寄出确认，请先更新 shexXLetters');
      if (!replyFlow) throw new Error('回复模块尚未加载，请更新前端文件');
      if (replyFlow.state().busy) throw new Error('上一封回复仍在处理中，请稍后再寄出');
      const mode = currentReplyMode();
      if (!mode) throw new Error('正在确认费用，请稍后再寄出');
      if (needsDraft && mode==='card' && data.capabilities.cardBilling!==2) throw new Error('字卡回信费用需要更新后台 shexXLetters');
      if (context.expectedMode && context.expectedMode !== mode) throw new Error('回复模式已改变，请重新确认费用');
      if (!STAMPS.includes(context.stampId)) throw new Error('邮章无效');
      if (!SEALS.includes(context.sentSealStyle)) throw new Error('寄出状态章无效');
      if (!['immediate', 'within_24h'].includes(context.deliveryMode) || mode === 'ai' && context.deliveryMode !== 'immediate')
        throw new Error('当前模式不支持这个回复时间');
    }
    function clearMedia() {
      for (const url of Object.values(data.media)) revokeMedia(url);
      data.media = {};
    }
    function readingPosition() {
      const formal = data.paper?.state === 'sent' && (data.monthlyReady ? paperMonthlyKey(data.paper) === data.bookKey || data.papers.some(p => p.paperId === data.paper.paperId) : data.paper.quarterKey === data.quarterKey);
      const mixed = data.capabilities.draftBookPaging === 1;
      const inBook = formal || mixed && data.paper?.state === 'draft' && !data.paper.localDraft &&
        (data.monthlyReady ? paperMonthlyKey(data.paper) === data.bookKey : data.paper.quarterKey === data.quarterKey);
      const page = formal && windowPages.find(row => row.items.some(item => item.paperId === data.paper.paperId));
      const local = page ? page.items.findIndex(item => item.paperId === data.paper.paperId) : -1;
      const newestPosition = page && Number.isInteger(page.offset) ? page.offset + local + 1 : null;
      // Storage stays newest-first; the reader counts chronologically from the oldest letter.
      // A complete retained window proves its actual total without any extra history read.
      let total = null, offset = 0;
      if (data.newestKnown && windowPages[0]?.pageNo === 0 && !data.cursor && windowPages.length) {
        const complete = windowPages.every((row, index) => {
          if (row.pageNo !== index || row.offset !== offset || row.booksRevision !== booksRevision) return false;
          offset += row.items.length; return true;
        });
        if (complete) total = offset;
      }
      if (total === null && !data.booksStale && data.continuousReady) total = bookCounts.get(readingKey()) ?? null;
      const lowerBound = Math.max(0, ...windowPages.filter(row => Number.isInteger(row.offset)).map(row => row.offset + row.items.length));
      const paperPosition = !mixed && Number.isInteger(newestPosition) && Number.isInteger(total) && total >= lowerBound && total >= newestPosition
        ? total - newestPosition + 1 : null;
      const index = data.papers.findIndex(item => item.paperId === data.paper?.paperId);
      return { paperPosition, positionLimited: Boolean(newestPosition && index === 0 && page.pageNo > 0 && !pageMetadata.has(page.pageNo - 1)),
        canPrevious: data.paper?.state === 'draft' && !inBook ? Boolean(writingReturn || mixed && data.papers.length) : Boolean(inBook &&
          (data.continuousReady || index >= 0 && (index < data.papers.length - 1 || data.cursor))),
        canNext: Boolean(inBook && (data.continuousReady || index >= 0 &&
          (index > 0 || data.newestKnown || Boolean(page && pageMetadata.has(page.pageNo - 1))))) };
    }
    function rememberBookCounts(result, replace = false) {
      if (replace || result.duePending) bookCounts.clear();
      if (result.capabilities?.continuousQuarterBook !== 1 || result.duePending) return;
      for (const book of (result.items || []).slice(0, data.monthlyReady ? 21 : 20)) {
        if (book.dreamId === data.owner?.dreamId && Number.isInteger(book.paperCount) && book.paperCount >= 0)
          bookCounts.set(keyOf(book), book.paperCount);
      }
    }
    function storePage(pageNo, cursor, result, prepend = false) {
      setTimeout(prefetchNeighbors, 0);
      const page = { pageNo, cursor, nextCursor: result.nextCursor || null, booksRevision,
        items: (result.items || []).slice(0, 24) };
      const previous = pageMetadata.get(pageNo), prior = pageMetadata.get(pageNo - 1);
      const contents = JSON.stringify(page.items.map(item => item.paperId));
      const changed = previous && (previous.contents !== contents || previous.nextCursor !== page.nextCursor);
      page.offset = pageNo === 0 ? 0 : changed ? null : previous?.offset ??
        (Number.isInteger(prior?.offset) ? prior.offset + prior.count : null);
      if (changed) {
        for (const [number, meta] of pageMetadata) if (number > pageNo) meta.offset = null;
        for (const row of windowPages) if (row.pageNo > pageNo) row.offset = null;
      }
      pageMetadata.set(pageNo, { cursor, nextCursor: page.nextCursor, offset: page.offset, count: page.items.length, contents });
      while (pageMetadata.size > 100) {
        const numbers = [...pageMetadata.keys()].sort((a, b) => a - b);
        pageMetadata.delete(prepend ? numbers.at(-1) : numbers[0]);
      }
      windowPages = windowPages.filter(row => row.pageNo !== pageNo);
      if (prepend) windowPages.unshift(page); else windowPages.push(page);
      while (windowPages.reduce((total, item) => total + item.items.length, 0) > 240) {
        if (prepend) windowPages.pop(); else windowPages.shift();
      }
      data.papers = windowPages.flatMap(item => item.items);
      data.cursor = windowPages.at(-1)?.nextCursor || null;
      data.newestKnown = windowPages[0]?.pageNo === 0;
      for (const item of page.items) cache?.put(data.owner.userId, data.owner.dreamId, 'summaries', item.paperId, item);
    }
    const signature = paper => JSON.stringify([paper?.paperTemplateId, paper?.stampId || null, paper?.sentSealStyle || SEALS[0], paper?.blocks || []]);
    const unsettledDifferent = paper => [...savingContents.values()].some(item=>item.paperId===paper.paperId&&item.signature!==signature(paper));
    const stagedMatches = () => stagedDraft && data.paper?.paperId === stagedDraft.paperId
      && signature(data.paper) === signature(stagedDraft);
    function draftSnapshot() {
      if (data.paper?.state !== 'draft' || !data.owner) return null;
      validate(data.paper.blocks || []);
      return { dreamId: data.owner.dreamId, paperId: data.paper.paperId, paperTemplateId: data.paper.paperTemplateId,
        stampId: data.paper.stampId || null, sentSealStyle: data.paper.sentSealStyle || SEALS[0], blocks: clone(data.paper.blocks || []), requestId: requestId() };
    }
    function persistDirty() {
      if (data.sendAttempt?.phase === 'uncertain' || data.sendAttempt?.phase === 'sent') return;
      const dirty = data.paper?.state === 'draft' && (signature(data.paper) !== savedSignature || unsettledDifferent(data.paper));
      const authorized = same(data.owner);
      if (dirty && authorized && data.paper.localDraft) {
        const preview = data.paper, selected = data.owner;
        if (signature(preview) !== savedSignature && !localFlushes.has(preview)) {
          const flush=allocateDraft(preview, selected).then(() => {
            if (same(selected) && !preview.localDraft) return saveDraft(data.paper===preview&&stagedMatches()?stagedDraft:snapshotFor(preview, selected), false);
          }).catch(() => {}).finally(()=>localFlushes.delete(preview));
          localFlushes.set(preview,flush);
        }
        if (saveTimer) clearTimeout(saveTimer); saveTimer = null;
        return;
      }
      const snapshot = dirty && authorized && !writeLocks.get(data.paper.paperId) ? (stagedMatches() ? stagedDraft : draftSnapshot()) : null;
      const queued = snapshot && savingSnapshots.has(snapshot.requestId);
      if (snapshot && !queued) api.stageWrite?.('saveDraft', snapshot);
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = null;
      if (snapshot && !queued) void saveDraft(snapshot, true).catch(() => {});
    }
    function checkpointDirty() {
      if (!same(data.owner) || data.paper?.state !== 'draft') return;
      if(signature(data.paper)===savedSignature&&!unsettledDifferent(data.paper)){
        if(!data.paper.localDraft)api.clearStagedDraftSnapshot?.({dreamId:data.owner.dreamId,paperId:data.paper.paperId});
        stagedDraft=null;return;
      }
      if (data.paper.localDraft) {
        const selected=data.owner;
        api.stageLocalDraftSnapshot?.({dreamId:data.owner.dreamId, paper:clone(data.paper)});
        void allocateDraft(data.paper, selected).catch(error => { if (same(selected)) { data.status = '草稿建立失败，文字保留在本机，请重试'; emit('status'); } });
        return;
      }
      const snapshot = draftSnapshot();
      if (api.stageDraftSnapshot) api.stageDraftSnapshot(snapshot);
      stagedDraft = snapshot;
    }
    function navValid(token, selected, paperId, quarterKey) {
      return token === navigation && same(selected) && data.owner?.dreamId === selected.dreamId &&
        (!paperId || data.paper?.paperId === paperId) && (!quarterKey || readingKey() === quarterKey);
    }
    function reset(nextOwner) {
      persistDirty();
      replyFlow?.reset();
      stopVoice();
      for (const queue of readingQueues.values()) queue.pending = null;
      generation++;
      incomingRequest=null;
      data.incomingRecovery=null;
      draftPreservation = null; pendingNewDrafts.clear();
      paperReads.clear();
      autosavePending = null;
      navigation++;
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = null;
      clearMedia();
      Object.assign(data, { owner: nextOwner, books: [], booksCursor: null, papers: [], paper: null, chain: [], legacyPapers: [],
        quarterKey: '', cursor: null, legacyCursor: null, chainCursor: null, legacyExpanded: false, legacyTruncated: false, mode: 'read', status: '',
        busy: false, bookmarkIds: {}, coverPreview: '', drafts: [], draftsExpanded: false, draftsCursor: null, sendAttempt: null });
      savedSignature = '';
      stagedDraft = null;
      windowPages = []; pageMetadata = new Map(); writeLocks.clear(); neighborBusy = false; draftsLoading = false;
      writingDraft = null; writingReturn = null; data.continuousReady = false; data.capabilityWarning = ''; data.newestKnown = false;
      draftSignatures.clear();
      sendContexts.clear();
      endComposition();
      booksLoading = false; booksRefresh = null; booksRevision = 0; booksPaged = false;
      bookCounts = new Map();
      data.booksStale = false; data.booksRefreshing = false; data.booksError = '';
      data.capabilities = {}; data.favorites = []; data.favoritesCursor = null; data.favoritesError = ''; data.favoritesLoading = false;
      data.monthlyReady = false; data.cutoff = null; data.bookKey = ''; data.currentMonthKey = '';
      data.stationeryUnlock=null;data.claimingBook=false;bookClaim=null;latestWriting=null;
      emit();
    }
    function openingFailure(error, phase = 'frontend_open') {
      const stages = { shared_client: '共享客户端', cloudbase_initialize: 'CloudBase 初始化',
        cloudbase_auth: 'CloudBase 鉴权', call_function: '云函数调用', cloud_response: '云端响应',
        frontend_state: '前端状态', view_render: '页面渲染', monthly_data: '前端书册数据',
        book_selection: '书册内容处理', incoming_status: '来信状态处理', quarter_books: '季度书册读取',
        quarter_selection: '季度书册处理', frontend_open: '前端打开流程' };
      const stageKey = error?.openingStage || error?.stage || (error?.definitive ? 'cloud_response' : phase);
      const stage = stages[stageKey] || stages.frontend_open;
      const rawCode = String(error?.code || '');
      const code = /^(?:(?:CLOUDBASE|X_LETTERS|DREAM|SESSION)_[A-Z0-9_]{1,64}|MISSING_ENV|UNKNOWN_ACTION|FUNCTION_NOT_FOUND)$/.test(rawCode)
        ? rawCode : 'X_LETTERS_OPEN_FAILED';
      const cloudCauses = new Set(['MONTHLY_QUERY_UNAVAILABLE','MONTHLY_LAYOUT_INVALID','MONTHLY_COUNT_INVALID',
        'MONTHLY_COUNT_RETRY','RESPONSE_TOO_LARGE','PAPER_NOT_FOUND','SESSION_EXPIRED','DREAM_NOT_FOUND']);
      const type = error?.definitive ? 'CloudResponse' : ['TypeError','ReferenceError','SyntaxError','RangeError'].includes(error?.name)
        ? error.name : 'Error';
      const cause = error?.definitive ? (cloudCauses.has(rawCode) ? rawCode : 'CLOUD_RESPONSE_ERROR')
        : stageKey === 'view_render' ? 'VIEW_RENDER_ERROR' : stageKey === 'frontend_state' ? 'FRONTEND_STATE_ERROR'
        : stageKey === 'monthly_data' ? 'FRONTEND_DATA_ERROR' : stageKey === 'book_selection' ? 'BOOK_SELECTION_ERROR'
        : stageKey === 'incoming_status' ? 'INCOMING_STATUS_ERROR' : 'FRONTEND_OPEN_ERROR';
      const detail = !error?.definitive && type !== 'Error' ? String(error?.message || '').replace(/\s+/g, ' ').slice(0, 80) : '';
      return `X信笺打开失败（阶段：${stage}；错误码：${code}；类型：${type}；原因：${cause}${detail ? `；详情：${detail}` : ''}）`;
    }
    function ensureOwner() {
      const fresh = owner();
      if (!data.owner || fresh.userId !== data.owner.userId || fresh.dreamId !== data.owner.dreamId) reset(fresh);
      return fresh;
    }
    async function open({ paperId: initialPaperId = null } = {}) {
      const selected = ensureOwner(); const epoch = generation;
      let phase = 'frontend_open';
      if (typeof api.openMonthlyBooks === 'function') {
        if (!data.coverPreview) data.coverPreview = readOpeningCover(true);
        data.busy = true; emit();
        try {
          await pendingSave.catch(() => {});
          if (api.resumePending) try { await api.resumePending(selected.dreamId, {actions:['saveDraft','claimSecondMonthlyBook']}); } catch(error) { notify(error.message || '待办稍后重试'); }
          if (epoch !== generation || !same(selected)) return;
          let result;
          try { result = await api.openMonthlyBooks({dreamId:selected.dreamId,includeDrafts:true}); }
          catch(error) { if (error.code !== 'UNKNOWN_ACTION') throw error; }
          if (epoch !== generation || !same(selected)) return;
          phase = 'monthly_data';
          if (result?.capabilities?.monthlyBooks === 1) {
            if (!Number.isFinite(result.cutoff) || result.cutoff <= 0 || !/^\d{4}-(?:0[1-9]|1[0-2])$/.test(result.bookKey) || !result.firstPage)
              throw new Error('月册响应无效，请重试');
            data.monthlyReady = true; data.cutoff = result.cutoff; data.currentMonthKey = result.bookKey;
            applyStationeryUnlock(result);
            data.books = monthlyRows(result); data.capabilities = {...result.capabilities}; data.booksCursor = result.nextCursor || null;
            data.booksStale = false; data.booksError = ''; booksPaged = false; rememberBookCounts(result, true);
            if (!data.paper) { data.bookKey = result.bookKey; data.coverPreview = resolveCover(result.bookKey); }
            phase = 'book_selection';
            if (initialPaperId) await openPaper(initialPaperId);
            else await selectBook(result.bookKey, {preferLastRead:true, preloaded:result.firstPage});
            phase = 'incoming_status';
            if (!initialPaperId && epoch === generation && same(selected)) { await refreshIncoming(); autoOpenAfterOpen = { selected, epoch }; }
            if (!initialPaperId && epoch === generation && same(selected)) void maybeRequestIncoming();
            return;
          }
          data.monthlyReady = false; data.cutoff = null; data.bookKey = ''; data.currentMonthKey = '';
          data.coverPreview = readOpeningCover() || readCoverPick(DEFAULT_QUARTER()) || '';
          data.capabilityWarning = '月册需要更新 shexXLetters；当前使用季度兼容阅读';
        } catch(error) { if(epoch === generation && same(selected)) {data.status = openingFailure(error, phase); notify(data.status); emit();} return; }
        finally {
          if(epoch === generation) {data.busy = false; emit();}
          const pending = autoOpenAfterOpen; autoOpenAfterOpen = null;
          if (pending && pending.epoch === generation && same(pending.selected)) void receiveAtOpen(pending.selected);
        }
      }
      if (!data.coverPreview) data.coverPreview = readOpeningCover() || readCoverPick(DEFAULT_QUARTER()) || '';
      data.busy = true; emit();
      // 书册列表和最新一页信一进来就同时去读，不排队等，进入页面更快。
      const guessQuarter = DEFAULT_QUARTER();
      const earlyBooks = api.listBooks({ dreamId: selected.dreamId, limit: 20, continuousBook: true }).catch(() => null);
      const earlyPapers = api.listPapers({ dreamId: selected.dreamId, quarterKey: guessQuarter, state: 'sent', limit: 24, includeHidden: true, continuousBook: true, direction: 'older', includeDrafts:true }).catch(() => null);
      try {
        await pendingSave.catch(() => {});
        if (api.resumePending) try { await api.resumePending(selected.dreamId, { actions: ['saveDraft'] }); }
        catch (error) { notify(error.message || '待保存草稿稍后重试'); }
        if (epoch !== generation || !same(selected)) return;
        phase = 'quarter_books';
        const result = await earlyBooks || await api.listBooks({ dreamId: selected.dreamId, limit: 20, continuousBook: true });
        if (epoch !== generation || !same(selected)) return;
        data.books = (result.items || []).slice(0, 20);
        data.capabilities = { ...result.capabilities };
        rememberBookCounts(result, true);
        data.booksCursor = result.nextCursor || null;
        data.booksStale = false; data.booksError = ''; booksPaged = false;
        const firstQuarter = data.books[0]?.quarterKey || DEFAULT_QUARTER();
        phase = 'quarter_selection';
        if (initialPaperId) await openPaper(initialPaperId);
        else await selectQuarter(firstQuarter, { preferLastRead: true, preloaded: firstQuarter === guessQuarter ? earlyPapers : null });
        phase = 'incoming_status';
        if (!initialPaperId && epoch === generation && same(selected)) { await refreshIncoming(); autoOpenAfterOpen = { selected, epoch }; }
        if (epoch === generation && same(selected)) void maybeRequestIncoming();
      } catch (error) { if (epoch === generation && same(selected)) { data.status = openingFailure(error, phase); notify(data.status); emit(); } }
      finally {
        if (epoch === generation) { data.busy = false; emit(); }
        // TA 有未读来信：一进 X信件就直接翻到那封信的信封，不用再去下面点“查看来信”。
        const pending = autoOpenAfterOpen; autoOpenAfterOpen = null;
        if (pending && pending.epoch === generation && same(pending.selected)) void receiveAtOpen(pending.selected);
      }
    }
    async function loadMoreBooks() {
      const selected = ensureOwner(), epoch = generation, cursor = data.booksCursor;
      if (!cursor || booksLoading) return false;
      booksLoading = true;
      try {
        const result = await readBooks({ dreamId: selected.dreamId, cursor, limit: 20, continuousBook: true });
        if (epoch !== generation || !same(selected) || data.booksCursor !== cursor) return false;
        const seen = new Set(data.books.map(book => book.bookId));
        for (const book of (data.monthlyReady ? monthlyRows(result) : (result.items || []).slice(0, 20))) if (!seen.has(book.bookId)) {
          data.books.push(book); seen.add(book.bookId);
        }
        data.booksCursor = result.nextCursor || null;
        booksPaged = true;
        rememberBookCounts(result);
        if(data.monthlyReady)applyStationeryUnlock(result);
        emit(); return true;
      } finally { booksLoading = false; }
    }
    function refreshBooksIfStale() {
      const selected = ensureOwner(), epoch = generation;
      if (booksRefresh) return booksRefresh;
      if (!data.booksStale) return Promise.resolve(false);
      const revision = booksRevision;
      data.booksRefreshing = true; data.booksError = '';
      const refresh = Promise.resolve().then(async () => {
        if (epoch !== generation || !same(selected)) return false;
        try {
          const result = await readBooks({ dreamId: selected.dreamId, limit: 20, continuousBook: true });
          if (epoch !== generation || !same(selected)) return false;
          const items = data.monthlyReady ? monthlyRows(result) : (result.items || []).slice(0, 20), seen = new Set(items.map(book => book.bookId));
          // This request has no directory cursor: only its authoritative head can advance the unlocked month.
          if(data.monthlyReady && result.capabilities?.monthlyBooks === 1 && result.cutoff === data.cutoff) {
            const head=items.find(book=>book.bookKey !== 'archive');
            if(head && head.bookKey > data.currentMonthKey) data.currentMonthKey=head.bookKey;
          }
          // Keep explicitly loaded older metadata, not bodies. An existing tail
          // cursor still follows that tail even when a new head book is inserted.
          data.books = [...items, ...data.books.filter(book => !seen.has(book.bookId))];
          data.capabilities = { ...result.capabilities };
          if(data.monthlyReady)applyStationeryUnlock(result);
          rememberBookCounts(result, true);
          if (!booksPaged) data.booksCursor = result.nextCursor || null;
          data.booksStale = revision !== booksRevision;
          return true;
        } catch (error) {
          if (epoch === generation && same(selected)) data.booksError = `书册刷新失败，请重新打开重试。${openingFailure(error)}`;
          return false;
        } finally {
          if (epoch === generation && same(selected)) { data.booksRefreshing = false; emit('books'); }
          if (booksRefresh === refresh) booksRefresh = null;
        }
      });
      booksRefresh = refresh; emit('books');
      return refresh;
    }
    async function selectQuarter(quarterKey, { preferLastRead = false, preloaded = null } = {}) {
      if (data.monthlyReady) return selectBook(quarterKey, {preferLastRead, preloaded});
      const selected = ensureOwner(); const epoch = generation;
      if (!/^(?:\d{4}-Q[1-4]|undated)$/.test(String(quarterKey))) throw new Error('季度无效');
      if (quarterKey !== 'undated' && quarterKey > DEFAULT_QUARTER()) throw new Error('这个季度尚未解锁');
      return withSavedDraft(selected, async token => {
      emit('navigation');
      const result = preloaded && await preloaded || await readPage({ dreamId: selected.dreamId, quarterKey, state: 'sent', limit: 24, includeHidden: true, continuousBook: true, direction: 'older' });
      if (epoch !== generation || !navValid(token, selected)) return;
      const last = preferLastRead ? data.books.find(book => book.quarterKey === quarterKey)?.lastReadPaperId : null;
      const first = last ? { paperId: last } : result.items?.[0];
      const paper = first ? await fetchPaper(selected, first.paperId, Boolean(first.legacySource || String(first.paperId).startsWith('legacy:'))) : null;
      if (composition) await composition.promise;
      if (epoch !== generation || !navValid(token, selected)) return;
      persistDirty();
      clearMedia(); data.quarterKey = quarterKey; windowPages = []; pageMetadata = new Map();
      data.continuousReady = result.capabilities?.continuousQuarterBook === 1;
      data.capabilityWarning = '月册需要更新 shexXLetters；当前使用季度兼容阅读' + (data.continuousReady ? '' : '；统一旧信需更新后台');
      data.newestKnown = true;
      data.papers = []; data.cursor = null; data.chain = []; data.chainCursor = null;
      data.legacyExpanded = false; data.legacyTruncated = false; data.legacyPapers = []; data.legacyCursor = null;
      data.drafts = []; data.draftsExpanded = false; data.draftsCursor = null;
      data.coverPreview = resolveCover(quarterKey);
      storePage(0, null, result); installPaper(paper); emit();
      if (paper) void rememberRead(selected, paper, quarterKey);
      else { writingReturn=null;openWritingSurface(); }
      });
    }
    async function selectBook(bookKey, {preferLastRead = false, preloaded = null} = {}) {
      if (!data.monthlyReady) return selectQuarter(bookKey, {preferLastRead, preloaded});
      const selected = ensureOwner(), epoch = generation;
      if (bookKey !== 'archive' && (!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(bookKey) || bookKey < new Date(data.cutoff + 8 * 3600000).toISOString().slice(0,7))) throw new Error('月份无效');
      if (bookKey !== 'archive' && bookKey > data.currentMonthKey) throw new Error('这个月份尚未解锁');
      return withSavedDraft(selected, async token => {
      emit('navigation');
      const result = preloaded || await readPage({dreamId:selected.dreamId,bookKey,limit:24,includeHidden:true,direction:'older'});
      if(epoch !== generation || !navValid(token, selected)) return;
      if (result.bookKey && result.bookKey !== bookKey) throw new Error('书册目录不一致，请重新打开书册');
      const last = preferLastRead ? data.books.find(book=>book.bookKey===bookKey)?.lastReadPaperId : null;
      let paper = null;
      if (last) {
        const summary = result.items?.find(p=>p.paperId===last);
        try { paper = await fetchPaper(selected,last,Boolean(summary?.legacySource || /^[a-f0-9]{64}$/.test(last))); }
        catch (error) { if (error.code !== 'PAPER_NOT_FOUND') throw error; }
        // A stale pointer is not evidence that this book is empty. Keep the stored
        // record intact, but never install another month's body under this cover.
        if (paper && paperMonthlyKey(paper) !== bookKey) paper = null;
      }
      if(epoch !== generation || !navValid(token, selected)) return;
      if (!paper && result.items?.[0]) {
        const first = result.items[0];
        paper = await fetchPaper(selected,first.paperId,Boolean(first.legacySource));
        if (paperMonthlyKey(paper) !== bookKey) throw new Error('这封信的书册尚未确认，请重新打开书册');
      }
      if (!paper && (result.hasMore || result.nextCursor)) throw new Error('书册目录尚未完整返回，请重试');
      if(composition) await composition.promise;
      if(epoch !== generation || !navValid(token, selected)) return;
      persistDirty(); clearMedia(); data.bookKey = bookKey;
      // The draft contract remains a quarter; archive must never reach draft APIs.
      data.quarterKey = bookKey === 'archive' ? `${data.currentMonthKey.slice(0,4)}-Q${Math.ceil(Number(data.currentMonthKey.slice(5))/3)}` : `${bookKey.slice(0,4)}-Q${Math.ceil(Number(bookKey.slice(5))/3)}`;
      windowPages=[]; pageMetadata=new Map(); data.papers=[]; data.cursor=null; data.chain=[]; data.chainCursor=null;
      data.drafts=[]; data.draftsExpanded=false; data.draftsCursor=null; data.legacyExpanded=false; data.legacyPapers=[]; data.legacyCursor=null;
      data.continuousReady=true; data.capabilityWarning=''; data.coverPreview=resolveCover(bookKey);
      storePage(0,null,result); installPaper(paper); emit();
      if(paper) void rememberRead(selected,paper,bookKey);
      else {writingReturn=null; openWritingSurface();}
      });
    }
    async function loadMore() {
      const selected = ensureOwner(); const epoch = generation;
      if (!data.cursor) return false;
      const token = navigation, quarterKey = readingKey(), cursor = data.cursor;
      const pageNo = (windowPages.at(-1)?.pageNo ?? -1) + 1;
      const result = await readPage({ dreamId: selected.dreamId, quarterKey,
        cursor, state: 'sent', limit: 24, includeHidden: true, continuousBook: true, direction: 'older' });
      if (epoch !== generation || !navValid(token, selected, null, quarterKey) || data.cursor !== cursor) return false;
      storePage(pageNo, cursor, result);
      emit(); return true;
    }
    async function loadPreviousPage() {
      const selected = ensureOwner(), first = windowPages[0];
      if (!first || first.pageNo <= 0) return false;
      const token = navigation, quarterKey = readingKey(), pageNo = first.pageNo - 1;
      if (!pageMetadata.has(pageNo)) { data.status = '目录位置尚未确认，请重新打开此季度书册'; emit('status'); return false; }
      const cursor = pageMetadata.get(pageNo).cursor;
      const result = await readPage({ dreamId: selected.dreamId, quarterKey,
        ...(cursor ? { cursor } : {}), state: 'sent', limit: 24, includeHidden: true, continuousBook: true, direction: 'older' });
      if (!navValid(token, selected, null, quarterKey) || windowPages[0]?.pageNo !== first.pageNo) return false;
      storePage(pageNo, cursor, result, true); emit(); return true;
    }
    const paperReads = new Map();
    async function fetchPaper(selected, paperId, legacy = false) {
      if (legacy) return (await api.getLegacyPaper({ dreamId: selected.dreamId, paperId, continuousBook: true })).paper;
      const cached = cache?.get(selected.userId, selected.dreamId, 'fullPapers', paperId);
      if(cached) return clone(cached);
      const key=JSON.stringify([generation,selected.userId,selected.dreamId,paperId]);
      let pending=paperReads.get(key);
      if(!pending) {pending=Promise.resolve().then(()=>api.getPaper({dreamId:selected.dreamId,paperId}));paperReads.set(key,pending);}
      try {return clone(await pending);}
      finally {if(paperReads.get(key)===pending) paperReads.delete(key);}
    }
    // 翻篇卡顿的主要原因：每翻一篇都要等云端把那一篇取回来。这里在当前篇显示后，
    // 先把前后相邻的两篇悄悄取好放进缓存，真正翻的时候直接用，不再等网络。
    const prefetchingPapers = new Set();
    function prefetchNeighbors() {
      const selected = data.owner, paperId = data.paper?.paperId, epoch = generation;
      if (!cache || !selected || !paperId || data.paper.localDraft || !Array.isArray(data.papers)) return;
      const index = data.papers.findIndex(item => item.paperId === paperId);
      if (index < 0) return;
      [data.papers[index - 1], data.papers[index + 1]].forEach(item => {
        if (!item || item.legacySource || prefetchingPapers.has(item.paperId)) return;
        if (cache.get(selected.userId, selected.dreamId, 'fullPapers', item.paperId)) return;
        prefetchingPapers.add(item.paperId);
        Promise.resolve().then(() => fetchPaper(selected, item.paperId)).then(paper => {
          if (epoch === generation && paper?.paperId === item.paperId && !cache.get(selected.userId, selected.dreamId, 'fullPapers', item.paperId))
            cache.put(selected.userId, selected.dreamId, 'fullPapers', item.paperId, clone(paper));
        }).catch(() => {}).finally(() => prefetchingPapers.delete(item.paperId));
      });
    }
    function installPaper(paper) {
      stopVoice();
      setTimeout(prefetchNeighbors, 0);
      data.paper = paper; data.status = ''; data.chain = []; data.chainCursor = null;
      // Seal before the first draw so an unread letter from TA never flashes its body before the envelope.
      if (paper?.state==='sent'&&paper.authorType==='dream'&&!paper.hiddenAt&&!paper.legacySource&&data.owner&&
        (paper.incomingUnread===true||paper.incomingUnread==null&&incomingStatus.snapshot(data.owner).unreadPaperId===paper.paperId))
        sealedIncoming.add(sealKey(data.owner,paper.paperId));
      data.mode = paper?.state === 'draft' ? 'edit' : 'read';
      savedSignature = paper?.state === 'draft' ? draftSignatures.get(paper.paperId) || signature(paper) : ''; stagedDraft = null;
      if(paper?.state==='draft')draftSignatures.set(paper.paperId,savedSignature);
      if(paper?.state==='draft')writingDraft=paper;
      const context = paper && !paper.legacySource ? loadSendContext(data.owner, paper.paperId) : null;
      if (context) {
        const phase = paper.state === 'sent' ? 'sent' : context.phase === 'sending' ? context.sendIssued ? 'uncertain' : 'failed' : context.phase;
        const pendingReply = phase === 'sent' && api.pendingFor?.(data.owner.dreamId)?.some(item => item.action === 'requestDreamReply' && item.payload?.sourcePaperId === paper.paperId);
        // Closing between local intent and API staging leaves no reply operation: offer explicit recovery of the stable ID.
        const replyStage = phase === 'sent' && context.replyStage === 'requested' && !pendingReply ? 'ready' : context.replyStage;
        showSendContext(updateSendContext(data.owner, context, { phase, replyStage }));
      } else showSendContext(null);
      data.bookmarkIds = Object.fromEntries((paper?.bookmarks || []).filter(item => item?.blockId && item?.bookmarkId)
        .map(item => [item.blockId, item.bookmarkId]));
      if (paper && !paper.legacySource) cache?.put(data.owner.userId, data.owner.dreamId, 'fullPapers', paper.paperId, clone(paper));
      if (paper?.state === 'sent' && paper.authorType === 'user' && !paper.legacySource && !paper.hiddenAt)
        void replyFlow?.recover(paper.paperId);
    }
    // 连续翻页跨过两本信笺集的边界时，给视图一个轻提示（同一本内部翻信不提示）。
    let bookCrossingSeq = 0;
    function markBookCrossing(before, direction) {
      const after = readingKey();
      if (!before || !after || before === after || !['next', 'previous'].includes(direction)) return;
      data.bookCrossing = { seq: ++bookCrossingSeq, direction, from: before, to: after, at: Date.now() };
    }
    function enterPaperQuarter(paper) {
      if (data.monthlyReady) {
        if(paper.quarterKey) data.quarterKey=paper.quarterKey;
        const bookKey=paperMonthlyKey(paper);
        if(!bookKey || bookKey===data.bookKey) return;
        data.bookKey=bookKey; data.papers=[]; data.cursor=null; windowPages=[]; pageMetadata=new Map();
        data.coverPreview=resolveCover(bookKey); data.drafts=[]; data.draftsCursor=null; data.draftsExpanded=false;
        return;
      }
      if (!paper.quarterKey || paper.quarterKey === data.quarterKey) return;
      data.quarterKey = paper.quarterKey; data.papers = []; data.cursor = null; windowPages = []; pageMetadata = new Map();
      data.drafts = []; data.draftsCursor = null; data.draftsExpanded = false;
      data.coverPreview = resolveCover(paper.quarterKey);
    }
    function readingTargetValid(epoch, selected, paperId, quarterKey) {
      return epoch === generation && same(selected) && data.owner?.userId === selected.userId &&
        data.owner?.dreamId === selected.dreamId && data.paper?.paperId === paperId && readingKey() === quarterKey;
    }
    function sealedPaperIds(){const prefix=sealKey(data.owner,'').slice(0,-3);return [...sealedIncoming].filter(key=>key.startsWith(prefix)).map(key=>JSON.parse(key)[2]);}
    function unsealIncoming(paperId){if(sealedIncoming.delete(sealKey(data.owner,paperId)))emit();return true;}
    function rememberRead(selected, paper, quarterKey) {
      const book = data.books.find(item => keyOf(item) === quarterKey);
      if (paper.localDraft || !['sent','draft'].includes(paper.state) || paper.state === 'draft' && data.capabilities.draftBookPaging !== 1 || (data.monthlyReady ? paperMonthlyKey(paper) !== quarterKey : !book || paper.legacySource)) return;
      const key = JSON.stringify([selected.userId, selected.dreamId]);
      let queue = readingQueues.get(key);
      // An issued write may still change a formerly saved position, including after A→B→A.
      const ackIncoming=data.capabilities.incomingReadAck===1&&paper.state==='sent'&&paper.authorType==='dream'&&!paper.hiddenAt&&
        (paper.incomingUnread===true||paper.incomingUnread==null&&incomingStatus.snapshot(selected).unreadPaperId===paper.paperId);
      // An unread letter from TA first arrives as a sealed envelope; it stays sealed in this session until opened.
      if(ackIncoming&&!paper.legacySource)sealedIncoming.add(sealKey(selected,paper.paperId));
      if (!queue?.active && book?.lastReadPaperId === paper.paperId && !ackIncoming) return;
      if (!queue) { queue = { active: false, pending: null }; readingQueues.set(key, queue); }
      queue.pending = { selected, paperId: paper.paperId, quarterKey, monthly:data.monthlyReady, epoch: generation, ackIncoming };
      if (!queue.active) void flushReadingQueue(key, queue);
    }
    async function flushReadingQueue(key, queue) {
      queue.active = true;
      try {
        while (queue.pending) {
          const { selected, paperId, quarterKey, monthly, epoch, ackIncoming } = queue.pending;
          queue.pending = null;
          if (!readingTargetValid(epoch, selected, paperId, quarterKey)) continue;
          try {
            await api[monthly ? 'saveMonthlyLastRead' : 'saveLastRead']({ dreamId: selected.dreamId, paperId, ...(monthly ? {bookKey:quarterKey}:{}), ...draftPaging(), ...(ackIncoming?{ackIncoming:true}:{}), requestId: requestId() });
            // Metadata tracks the committed remote value even if a newer target is already queued.
            if (epoch === generation && same(selected)) {
              const book = data.books.find(item => keyOf(item) === quarterKey);
              if (book) book.lastReadPaperId = paperId;
              if(ackIncoming){
                if(data.paper?.paperId===paperId)data.paper.incomingUnread=false;
                const cached=cache?.get(selected.userId,selected.dreamId,'fullPapers',paperId);
                if(cached)cache.put(selected.userId,selected.dreamId,'fullPapers',paperId,{...cached,incomingUnread:false});
                for(const item of data.papers)if(item.paperId===paperId)item.incomingUnread=false;
                incomingStatus.acknowledge?.(selected,paperId);
                void incomingStatus.refresh(selected,{force:true,afterMutation:true});
              }
            }
          } catch (error) {
            if (readingTargetValid(epoch, selected, paperId, quarterKey)) {
              data.status = '信已打开，阅读位置未保存，可稍后重试'; emit('status');
            }
          }
        }
      } finally {
        queue.active = false;
        if (readingQueues.get(key) === queue) readingQueues.delete(key);
      }
    }
    async function openPaper(paperId, { legacy = false, direction = null } = {}) {
      const selected = ensureOwner(); const epoch = generation;
      return withSavedDraft(selected, async token => {
      const quarterKey = readingKey();
      emit('navigation');
      const previousId = data.paper?.paperId;
      legacy = legacy || Boolean(data.papers.find(item => item.paperId === paperId)?.legacySource);
      const paper = await fetchPaper(selected, paperId, legacy);
      if (composition) await composition.promise;
      if (epoch !== generation || !navValid(token, selected, null, quarterKey)) return;
      persistDirty();
      // A relation can cross books. Display its real quarter without fetching a history directory.
      const bookBefore = readingKey();
      if (!legacy || data.continuousReady) enterPaperQuarter(paper);
      if (direction) markBookCrossing(bookBefore, direction);
      clearMedia(); installPaper(paper); emit(direction && previousId !== paperId ? `turn-${direction}` : undefined);
      void rememberRead(selected, paper, readingKey()); return true;
      });
    }
    async function locateCurrent() {
      const paperId = data.paper?.paperId;
      if (!paperId) return -1;
      return data.papers.findIndex(item => item.paperId === paperId);
    }
    async function next() {
      if (neighborBusy) return false;
      if (!readingPosition().canNext) { data.status = data.capabilityWarning; emit('status'); return false; }
      neighborBusy = true; const epoch = generation;
      try {
      const paperId = data.paper.paperId;
      let index = await locateCurrent();
      if (data.paper?.paperId !== paperId) return;
      if (index > 0) return await openPaper(data.papers[index - 1].paperId, { direction: 'next' });
      if (index === 0 && windowPages[0]?.pageNo > 0 && pageMetadata.has(windowPages[0].pageNo-1)) {
        if(!await loadPreviousPage())return false;
        if(data.paper?.paperId!==paperId)return false;
        index=data.papers.findIndex(item=>item.paperId===paperId);
        if(index>0)return await openPaper(data.papers[index-1].paperId,{direction:'next'});
      }
      if (index === 0 && data.newestKnown && !data.booksStale) {
        const crossed = await crossBook('newer');
        if (crossed !== null) return crossed;
        return openWritingSurface();
      }
      return await anchorNeighbor('newer');
      } finally { if (epoch === generation) { neighborBusy = false; emit('status'); } }
    }
    async function previous() {
      if (data.paper?.state === 'draft' && (data.paper.localDraft || data.capabilities.draftBookPaging !== 1) && (writingReturn || data.papers[0])) {
        const target = data.capabilities.draftBookPaging === 1 && data.paper.localDraft ? data.papers[0] || writingReturn : writingReturn;
        return await openPaper(target.paperId, { legacy: Boolean(target.legacySource), direction: 'previous' });
      }
      if (neighborBusy || !readingPosition().canPrevious) { if (!data.continuousReady) { data.status = data.capabilityWarning; emit('status'); } return false; }
      neighborBusy = true; const epoch = generation;
      try {
      const paperId = data.paper?.paperId;
      let index = await locateCurrent();
      if (data.paper?.paperId !== paperId) return;
      if (index >= 0 && index < data.papers.length - 1) return await openPaper(data.papers[index + 1].paperId, { direction: 'previous' });
      if (index >= 0 && data.cursor) {
        if (!await loadMore()) return false;
        index = data.papers.findIndex(item => item.paperId === paperId);
        if (index >= 0 && data.papers[index + 1]) return await openPaper(data.papers[index + 1].paperId, { direction: 'previous' });
      }
      return await anchorNeighbor('older');
      } finally { if (epoch === generation) { neighborBusy = false; emit('status'); } }
    }
    async function anchorNeighbor(direction) {
      if (!data.continuousReady) { data.status = data.capabilityWarning; emit('status'); return false; }
      const selected = ensureOwner(), token = navigation, epoch = generation, current = data.paper, quarterKey = readingKey();
      if(data.monthlyReady && paperMonthlyKey(current)!==quarterKey) {data.status='这封信的月份尚未确认，请重新打开书册';emit('status');return false;}
      const result = await readPage({dreamId:selected.dreamId,quarterKey,state:'sent',continuousBook:true,
        direction,anchorPaperId:current.paperId,...(current.legacySource ? {anchorLegacy:true}:{}),limit:24,includeHidden:true});
      if (epoch !== generation || !navValid(token,selected,current.paperId,quarterKey)) return false;
      if (result.capabilities?.continuousQuarterBook !== 1) { data.continuousReady=false;data.capabilityWarning='统一旧信需更新 shexXLetters';data.status=data.capabilityWarning;emit('status');return false; }
      const items=(result.items||[]).slice(0,24);
      const target=direction==='older'?items[0]:items.at(-1);
      if (!target) {
        if (result.hasMore || result.nextCursor) { data.status = '暂时无法确定相邻信件，请重试'; emit('status'); return false; }
        // 本册翻到头：连续翻进相邻的一本信笺集（只有最新一本的末尾才是空白新信页）。
        const crossed = await crossBook(direction);
        if (crossed !== null) return crossed;
        if (direction === 'newer') return openWritingSurface();
        if (!result.hasMore && !result.nextCursor) { data.status = '当前已经是第一封了'; emit('status'); }
        return false;
      }
      const paper=await fetchPaper(selected,target.paperId,Boolean(target.legacySource));
      if (composition) await composition.promise;
      if (epoch !== generation || !navValid(token,selected,current.paperId,quarterKey)) return false;
      const currentIndex=data.papers.findIndex(item=>item.paperId===current.paperId);
      const currentSummary=data.papers[currentIndex]||{paperId:current.paperId,createdAt:current.createdAt,legacySource:current.legacySource};
      // An anchor outside this window has no proven adjacency to the previous newest directory.
      const contiguous=currentIndex>=0?data.papers:[];
      const knownNewestId=currentIndex>=0&&data.newestKnown?data.papers[0]?.paperId:null;
      const merged=core?.mergePage?.(contiguous,[currentSummary,...items])||[...items,currentSummary];
      const retained=direction==='older'?merged.slice(-240):merged.slice(0,240);
      windowPages=[{pageNo:0,cursor:null,nextCursor:direction==='older'?result.nextCursor||null:null,items:retained,offset:null}];pageMetadata=new Map();
      data.papers=retained;data.cursor=windowPages[0].nextCursor;
      // Only a complete newer-side result proves the start of the newest-first directory.
      data.newestKnown=Boolean(knownNewestId && retained[0]?.paperId===knownNewestId)||Boolean(direction==='newer' && !result.hasMore && !result.nextCursor);
      return openPaper(paper.paperId,{legacy:Boolean(paper.legacySource),direction:direction==='older'?'previous':'next'});
    }
    // 月册连续阅读：从一本的边界翻进相邻一本。返回 null 表示没有可进入的相邻书册（调用方走原边界逻辑）。
    const bookOrder = key => key === 'archive' ? '0000-00' : key;
    async function crossBook(direction) {
      if (!data.monthlyReady || !['older', 'newer'].includes(direction)) return null;
      const current = readingKey();
      if (direction === 'newer' && current === data.currentMonthKey) return null;
      const keys = [...new Set((data.books || []).filter(book => book?.bookKey && book.bookKey !== current &&
        !(Number.isInteger(book.paperCount) && book.paperCount <= 0)).map(book => book.bookKey))]
        .filter(key => key === 'archive' || key <= data.currentMonthKey).sort((a, b) => bookOrder(a) < bookOrder(b) ? -1 : 1);
      const target = direction === 'older' ? keys.filter(key => bookOrder(key) < bookOrder(current)).at(-1) : keys.find(key => bookOrder(key) > bookOrder(current));
      // Archive is appended even to partial directory pages. It cannot prove
      // adjacency across the monthly entries that have not been loaded yet.
      if (data.booksCursor && (!target || target === 'archive' || current === 'archive'
        || !data.books.some(book => book.bookKey === current))) {
        throw new Error('书册目录尚未加载完整，请在书架加载更多后重试');
      }
      if (!target) {
        return null;
      }
      const selected = ensureOwner(), epoch = generation;
      return withSavedDraft(selected, async token => {
        const pages = [];
        let result = await readPage({ dreamId: selected.dreamId, quarterKey: target, limit: 24, includeHidden: true, direction: 'older' });
        if (result.bookKey && result.bookKey !== target) throw new Error('书册目录不一致，请重新打开书册');
        pages.push({ cursor: null, result });
        // 向后翻进更新的一本时要落在它最早的一封；目录是新到旧，最多读 10 页（240 封）。
        while (direction === 'newer' && result.nextCursor && pages.length < 10) {
          if (epoch !== generation || !navValid(token, selected)) return false;
          const cursor = result.nextCursor;
          result = await readPage({ dreamId: selected.dreamId, quarterKey: target, cursor, limit: 24, includeHidden: true, direction: 'older' });
          if (result.bookKey && result.bookKey !== target) throw new Error('书册目录不一致，请重新打开书册');
          pages.push({ cursor, result });
        }
        if (epoch !== generation || !navValid(token, selected)) return false;
        if (direction === 'newer' && (result.nextCursor || result.hasMore)) throw new Error('书册目录尚未确认起点，请重新打开目标书册');
        const items = pages.flatMap(page => page.result.items || []);
        const first = direction === 'older' ? items[0] : items.at(-1);
        if (!first) {
          if (target === 'archive' && result.bookKey === target && result.hasMore === false && !result.nextCursor) return null;
          throw new Error('书册目录暂未返回信件，请重试');
        }
        const paper = await fetchPaper(selected, first.paperId, Boolean(first.legacySource));
        if (paperMonthlyKey(paper) !== target) throw new Error('这封信的书册尚未确认，请重新打开书册');
        if (composition) await composition.promise;
        if (epoch !== generation || !navValid(token, selected)) return false;
        const before = readingKey();
        persistDirty(); clearMedia(); data.bookKey = target;
        data.quarterKey = target === 'archive' ? `${data.currentMonthKey.slice(0,4)}-Q${Math.ceil(Number(data.currentMonthKey.slice(5))/3)}` : `${target.slice(0,4)}-Q${Math.ceil(Number(target.slice(5))/3)}`;
        windowPages = []; pageMetadata = new Map(); data.papers = []; data.cursor = null; data.chain = []; data.chainCursor = null;
        data.drafts = []; data.draftsExpanded = false; data.draftsCursor = null; data.coverPreview = resolveCover(target);
        pages.forEach((page, pageNo) => storePage(pageNo, page.cursor, page.result));
        installPaper(paper); markBookCrossing(before, direction === 'older' ? 'previous' : 'next');
        emit(direction === 'older' ? 'turn-previous' : 'turn-next');
        void rememberRead(selected, paper, target);
        return true;
      });
    }
    function openWritingSurface() {
      // 书册里最后一封是已保存草稿时，允许再向后翻出 1 页空白新信页；空白页本身（localDraft）不能再往后翻。
      const fromDraft = data.paper?.state === 'draft';
      if (fromDraft && (data.paper.localDraft || data.capabilities.draftBookPaging !== 1)) return false;
      const bookBefore = readingKey();
      writingReturn=data.paper?clone(data.paper):writingReturn;
      persistDirty();++navigation;clearMedia();
      // 空白页在用户真正输入之前不分配草稿；不能复用刚才那封已保存草稿。
      if (fromDraft && writingDraft === data.paper) writingDraft = null;
      if (!writingDraft || writingDraft.state !== 'draft') {
        const intent = api.localSendContext?.(data.owner.dreamId, data.quarterKey);
        writingDraft=api.localDraftSnapshot?.(data.owner.dreamId,data.quarterKey)||{paperId:intent?.paperId || `local:${id()}`,dreamId:data.owner.dreamId,quarterKey:data.quarterKey,state:'draft',authorType:'user',
          localDraft:true,paperTemplateId:styleSet().paper,sentSealStyle:styleSet().seal,stampId:null,blocks:[{blockId:id(),type:'text',text:''}]};
        writingDraft.localSurfaceId=writingDraft.paperId;
        // 还没动笔的空白草稿跟着当前书皮的那一套走。
        if(writingDraft.localDraft&&writingDraft.paperTemplateId===PAPER_TEMPLATES[0]&&!(writingDraft.blocks||[]).some(block=>block.type!=='text'||String(block.text||'').trim())){writingDraft.paperTemplateId=styleSet().paper;writingDraft.sentSealStyle=styleSet().seal;}
      }
      installPaper(writingDraft);enterPaperQuarter(writingDraft);markBookCrossing(bookBefore,'next');data.status='';emit('turn-next');return true;
    }
    const snapshotFor=(paper,selected)=>({dreamId:selected.dreamId,paperId:paper.paperId,paperTemplateId:paper.paperTemplateId,
      stampId:paper.stampId||null,sentSealStyle:paper.sentSealStyle||SEALS[0],blocks:clone(paper.blocks||[]),requestId:requestId()});
    async function allocateDraft(preview=data.paper,selected=data.owner) {
      if (!preview?.localDraft) return preview;
      if (allocations.has(preview)) return allocations.get(preview);
      const epoch=generation,localId=preview.paperId;
      const payload=preview.allocationPayload||{dreamId:selected.dreamId,paperTemplateId:preview.paperTemplateId,stampId:preview.stampId||null,sentSealStyle:preview.sentSealStyle||SEALS[0],
        blocks:clone(preview.blocks),relationType:'letter',parentPaperId:null,requestId:requestId()};
      preview.allocationPayload=payload;api.stageLocalDraftSnapshot?.({dreamId:selected.dreamId,paper:clone(preview)});
      const work=(async()=>{
        const result=await api.createDraft(payload);
        if(epoch!==generation||!same(selected))return null;
        const initialSignature=signature(payload);
        // The response represents the first create snapshot; the native input may already contain newer text.
        const liveContent={blocks:preview.blocks,paperTemplateId:preview.paperTemplateId,stampId:preview.stampId,sentSealStyle:preview.sentSealStyle||SEALS[0]};
        Object.assign(preview,result,liveContent,{paperId:result.paperId,quarterKey:result.quarterKey||preview.quarterKey,rootPaperId:result.rootPaperId||result.paperId,localDraft:false});delete preview.allocationPayload;
        rememberSavedDraft(preview);
        draftSignatures.delete(localId);draftSignatures.set(preview.paperId,initialSignature);
        if(data.paper===preview){enterPaperQuarter(preview);savedSignature=initialSignature;checkpointDirty();emit('status');}
        else if(signature(preview)!==initialSignature)api.stageDraftSnapshot?.(snapshotFor(preview,selected));
        // Only release the original local text after its newer content has a durable save checkpoint.
        api.clearLocalDraftSnapshot?.({dreamId:selected.dreamId,paperId:localId});
        const intent = loadSendContext(selected, localId);
        if (intent) updateSendContext(selected, intent, { paperId: preview.paperId, replyRequestId: `letter-reply:${preview.paperId}`, previousPaperId: localId });
        return preview;
      })();
      allocations.set(preview,work);
      try{return await work;}finally{allocations.delete(preview);}
    }
    async function fromNewest() { return selectBook(readingKey()); }
    let earlyUnlock=null;
    const STATIONERY_KIND_LABELS={papers:'信纸',seals:'邮章',envelopes:'信封',covers:'书皮'};
    async function unlockStationeryEarly(kind){
      const selected=ensureOwner(),epoch=generation;
      if(earlyUnlock)return earlyUnlock;
      if(!Object.hasOwn(STATIONERY_KIND_LABELS,kind))throw new Error('素材类型无效');
      if(data.stationeryUnlock?.version!==2||typeof api.unlockStationeryEarly!=='function')throw new Error('提前解锁需要更新 shexXLetters');
      const before=Stationery.unlockedCount(kind,data);
      data.unlockingStationery=kind;emit('books');
      const work=(async()=>{
        try{
          const result=await api.unlockStationeryEarly({dreamId:selected.dreamId,kind,requestId:requestId()});
          if(epoch!==generation||!same(selected))return false;
          applyStationeryUnlock(result);
          if(Stationery.unlockedCount(kind,data)<=before)throw new Error('解锁结果未确认，请重试');
          data.status=`已提前解锁新的${STATIONERY_KIND_LABELS[kind]}`;notify(data.status);return true;
        }catch(error){
          if(epoch===generation&&same(selected)){
            data.status=error?.code==='ENERGY_NOT_ENOUGH'?'X能量不足，未解锁，也没有扣费':error?.code==='STATIONERY_ALL_UNLOCKED'?'这一类已经全部解锁':'解锁未确认，请重试';notify(data.status);
          }
          throw error;
        }finally{if(epoch===generation&&same(selected)){data.unlockingStationery='';emit('books');}}
      })();earlyUnlock=work;
      try{return await work;}finally{if(earlyUnlock===work)earlyUnlock=null;}
    }
    async function claimSecondBook(){
      const selected=ensureOwner(),epoch=generation;
      if(bookClaim)return bookClaim;
      if(data.stationeryUnlock?.stage===2)return true;
      if(data.capabilities.monthlyStationeryClaims!==1||typeof api.claimSecondMonthlyBook!=='function')throw new Error('领取书册需要更新 shexXLetters');
      if(!data.stationeryUnlock?.canClaimSecond)throw new Error('下个月才可以领取第二本');
      data.claimingBook=true;data.status='';emit('books');
      const work=(async()=>{
        try{
          const result=await api.claimSecondMonthlyBook({dreamId:selected.dreamId,bookKey:data.stationeryUnlock.secondBookKey,requestId:requestId()});
          if(epoch!==generation||!same(selected))return false;
          if(result.stationeryUnlock?.stage!==2)throw new Error('领取结果未确认，请重试');
          data.stationeryUnlock=result.stationeryUnlock;data.status='第二本已领取，剩余素材已解锁';return true;
        }catch(error){if(epoch===generation&&same(selected)){data.status='领取未确认，请重试；素材暂未解锁';notify(data.status);}throw error;}
        finally{if(epoch===generation&&same(selected)){data.claimingBook=false;emit('books');}}
      })();bookClaim=work;
      try{return await work;}finally{if(bookClaim===work)bookClaim=null;}
    }
    async function writeLatest(){
      const selected=ensureOwner(),epoch=generation;
      if(latestWriting)return latestWriting;
      if(data.paper?.state==='draft')return true;
      const work=(async()=>{
        if(composition)await composition.promise;
        if(epoch!==generation||!same(selected))return false;
        persistDirty();const token=++navigation,returnPaper=data.paper?clone(data.paper):writingReturn;
        const meaningful=p=>p?.state==='draft'&&(p.blocks||[]).some(b=>b.type!=='text'||String(b.text||'').trim());
        const local=api.latestLocalDraftSnapshot?.(selected.dreamId);
        const dirty=meaningful(writingDraft)&&(writingDraft.localDraft||signature(writingDraft)!==(draftSignatures.get(writingDraft.paperId)||signature(writingDraft)));
        let draft=dirty?writingDraft:meaningful(local)?local:null,checkpoint=null;
        if(!draft){
          const saves=(api.pendingFor?.(selected.dreamId)||[]).filter(item=>item.action==='saveDraft'
            &&item.userId===selected.userId&&item.dreamId===selected.dreamId&&item.payload?.dreamId===selected.dreamId
            &&item.payload?.paperId&&!['completed','complete','deleted'].includes(item.status)).sort((a,b)=>b.updatedAt-a.updatedAt);
          if(saves[0]&&typeof api.getPaper==='function'){
            let candidate;
            try{candidate=await api.getPaper({dreamId:selected.dreamId,paperId:saves[0].payload.paperId});}
            catch(error){if(error.code!=='PAPER_NOT_FOUND'||error.definitive!==true)throw error;}
            if(epoch!==generation||!navValid(token,selected))return false;
            if(candidate&&(candidate.paperId!==saves[0].payload.paperId||candidate.userId&&candidate.userId!==selected.userId
              ||candidate.dreamId&&candidate.dreamId!==selected.dreamId))throw new Error('草稿归属无效');
            if(candidate?.state==='draft')draft=candidate;
          }
          if(!draft){
            if(typeof api.getLatestDraft!=='function')throw new Error('打开最新草稿需要更新 shexXLetters');
            try{draft=(await api.getLatestDraft({dreamId:selected.dreamId})).paper;}
            catch(error){if(error.code==='UNKNOWN_ACTION')throw new Error('打开最新草稿需要更新 shexXLetters');throw error;}
          }
          if(epoch!==generation||!navValid(token,selected))return false;
          // Recover only this draft's unresolved save; retain its original identity and request.
          if(draft?.state==='draft'){
            const pending=saves.find(item=>item.payload.paperId===draft.paperId);
            if(pending){
              validate(pending.payload.blocks||[]);checkpoint=clone(pending.payload);
              draftSignatures.set(draft.paperId,signature(draft));
              draft={...draft,paperTemplateId:checkpoint.paperTemplateId,stampId:checkpoint.stampId||null,
                sentSealStyle:checkpoint.sentSealStyle||SEALS[0],blocks:clone(checkpoint.blocks||[])};
            }
          }
        }
        if(epoch!==generation||!navValid(token,selected))return false;
        if(draft&&(draft.state!=='draft'||draft.dreamId&&draft.dreamId!==selected.dreamId||draft.userId&&draft.userId!==selected.userId))throw new Error('草稿归属无效');
        clearMedia();windowPages=[];pageMetadata=new Map();data.papers=[];data.cursor=null;data.drafts=[];data.draftsCursor=null;
        if(data.monthlyReady){data.bookKey=data.currentMonthKey;data.quarterKey=`${data.currentMonthKey.slice(0,4)}-Q${Math.ceil(Number(data.currentMonthKey.slice(5))/3)}`;}
        else data.quarterKey=DEFAULT_QUARTER();
        data.coverPreview=resolveCover(readingKey());writingReturn=returnPaper;
        if(draft){writingDraft=draft;installPaper(draft);if(checkpoint)stagedDraft=checkpoint;enterPaperQuarter(draft);emit('turn-next');}
        else{writingDraft=null;data.paper=null;openWritingSurface();writingReturn=returnPaper;}
        return true;
      })();latestWriting=work;
      try{return await work;}finally{if(latestWriting===work)latestWriting=null;}
    }
    async function expandDrafts() {
      const selected = ensureOwner(), epoch = generation, token = navigation, quarterKey = data.quarterKey, bookKey = readingKey();
      if (draftsLoading) return false;
      draftsLoading = true;
      try {
        const result = await api.listPapers({ dreamId: selected.dreamId, quarterKey, state: 'draft', limit: 24 });
        if (epoch !== generation || !navValid(token, selected, null, bookKey)) return false;
        data.drafts = (result.items || []).slice(0, 24); data.draftsExpanded = true; data.draftsCursor = result.nextCursor || null;
        emit(); return true;
      } finally { if (epoch === generation) draftsLoading = false; }
    }
    async function loadMoreDrafts() {
      const selected = ensureOwner(), epoch = generation, token = navigation, quarterKey = data.quarterKey, bookKey = readingKey(), cursor = data.draftsCursor;
      if (draftsLoading || !cursor || data.drafts.length >= 240) return false;
      draftsLoading = true;
      try {
        const result = await api.listPapers({ dreamId: selected.dreamId, quarterKey, state: 'draft', cursor, limit: Math.min(24, 240 - data.drafts.length) });
        if (epoch !== generation || !navValid(token, selected, null, bookKey) || data.draftsCursor !== cursor) return false;
        const ids = new Set(data.drafts.map(item => item.paperId));
        for (const item of (result.items || []).slice(0, 240 - data.drafts.length)) if (!ids.has(item.paperId)) { data.drafts.push(item); ids.add(item.paperId); }
        data.draftsCursor = data.drafts.length >= 240 ? null : result.nextCursor || null;
        if (data.drafts.length >= 240 && result.nextCursor) data.status = '本册草稿已显示 240 封，请整理后刷新';
        emit(); return true;
      } finally { if (epoch === generation) draftsLoading = false; }
    }
    async function openChain() {
      const selected = ensureOwner(); if (!data.paper || data.paper.legacySource) return;
      const epoch = generation, token = ++navigation, paperId = data.paper.paperId, quarterKey = readingKey();
      const result = await api.getPaperChain({ dreamId: selected.dreamId,
        rootPaperId: data.paper.rootPaperId || paperId, limit: 20 });
      if (epoch !== generation || !navValid(token, selected, paperId, quarterKey)) return;
      data.chain = (result.items || []).map(item => core?.relationNode?.(item) || item);
      data.chainCursor = result.nextCursor || null; emit();
    }
    async function loadMoreChain() {
      const selected = ensureOwner(); if (!data.chainCursor || !data.paper || data.paper.legacySource) return;
      if (data.chain.length >= 50) { data.chainCursor = null; data.status = '关系目录已达 50 封上限'; emit(); return; }
      const token = ++navigation, paperId = data.paper.paperId, quarterKey = readingKey(), cursor = data.chainCursor;
      const result = await api.getPaperChain({ dreamId: selected.dreamId,
        rootPaperId: data.paper.rootPaperId || paperId, cursor, limit: Math.min(20, 50 - data.chain.length) });
      if (!navValid(token, selected, paperId, quarterKey)) return;
      const ids = new Set(data.chain.map(item => item.paperId));
      for (const item of (result.items || []).slice(0, 50 - data.chain.length)) if (!ids.has(item.paperId)) {
        data.chain.push(core?.relationNode?.(item) || item); ids.add(item.paperId);
      }
      data.chainCursor = data.chain.length >= 50 ? null : result.nextCursor || null;
      if (data.chain.length >= 50 && result.nextCursor) data.status = '关系目录已达 50 封上限';
      emit();
    }
    async function openRelation(paperId) { await openPaper(paperId); }
    async function expandLegacy() {
      const selected = ensureOwner(); const epoch = generation, token = ++navigation, paperId = data.paper?.paperId, quarterKey = readingKey();
      const result = await api.listLegacyPapers({ dreamId: selected.dreamId, limit: 24, includeHidden: true });
      if (epoch !== generation || !navValid(token, selected, paperId, quarterKey)) return;
      data.legacyExpanded = true; data.legacyPapers = result.items || []; data.legacyCursor = result.nextCursor || null;
      data.legacyTruncated = Boolean(result.truncatedReason);
      if (result.truncatedReason) data.status = '旧信仅显示有上限的部分记录';
      emit();
    }
    async function loadMoreLegacy() {
      const selected = ensureOwner(); if (!data.legacyCursor) return;
      if (data.legacyPapers.length >= 240) { data.legacyCursor = null; data.status = '旧信目录已达 240 封上限'; emit(); return; }
      const token = ++navigation, paperId = data.paper?.paperId, quarterKey = readingKey(), cursor = data.legacyCursor;
      const result = await api.listLegacyPapers({ dreamId: selected.dreamId, cursor,
        limit: Math.min(24, 240 - data.legacyPapers.length), includeHidden: true });
      if (!navValid(token, selected, paperId, quarterKey)) return;
      const ids = new Set(data.legacyPapers.map(item => item.paperId));
      for (const item of (result.items || []).slice(0, 240 - data.legacyPapers.length)) if (!ids.has(item.paperId)) {
        data.legacyPapers.push(item); ids.add(item.paperId);
      }
      data.legacyCursor = data.legacyPapers.length >= 240 ? null : result.nextCursor || null;
      if (result.truncatedReason) data.legacyTruncated = true;
      if (data.legacyPapers.length >= 240 && result.nextCursor) data.status = '旧信目录已达 240 封上限';
      emit();
    }
    function installNewDraft(result, payload, returnPaper) {
      stopVoice();
      clearMedia(); data.paper = { ...result, ...payload, authorType: 'user', state: 'draft', paperId: result.paperId,
        quarterKey: result.quarterKey || data.quarterKey, rootPaperId: result.rootPaperId || result.paperId };
      enterPaperQuarter(data.paper);
      writingReturn = returnPaper; writingDraft = data.paper;
      rememberSavedDraft(data.paper);
      savedSignature = signature(data.paper); stagedDraft = null; data.mode = 'edit'; data.status = '草稿已建立'; data.sendAttempt = null; emit();
    }
    // Shared success barrier for departure, creation and narration. Hold edits until the selected action finishes.
    async function saveCurrentBeforeAction(operation) {
      if (composition) await composition.promise;
      if (!preservationCurrent(operation)) return false;
      if (saveTimer) clearTimeout(saveTimer); saveTimer = null;
      const prior = operation.paper;
      if (autosavePending?.snapshot.paperId === prior?.paperId) autosavePending = null;
      if (prior?.localDraft && (prior.blocks || []).some(block => block.type !== 'text' || String(block.text || '').trim())) {
        await allocateDraft(prior, operation.selected);
        if (!preservationCurrent(operation)) return false;
        if (prior.localDraft) throw new Error('草稿建立未确认，文字保留在本机，请重试');
      }
      if (prior?.state === 'draft' && !prior.localDraft && (signature(prior) !== savedSignature || unsettledDifferent(prior))) {
        const issued = [...savingContents.entries()].filter(([, item]) => item.paperId === prior.paperId).at(-1);
        const matching = issued?.[1].signature === signature(prior) && savingSnapshots.get(issued[0]);
        await (matching || saveDraft(stagedMatches() ? stagedDraft : draftSnapshot()));
      }
      return preservationCurrent(operation);
    }
    async function withSavedDraft(selected, action) {
      if (preservationCurrent(draftPreservation)) {
        const prior=draftPreservation;
        if(!prior.ready)throw new Error('正在保存旧稿，请稍候');
        prior.cancelAction=true;
        await prior.ready;
        if(prior.epoch!==generation || !same(selected) || data.paper!==prior.paper)return false;
        if(draftPreservation===prior)draftPreservation=null;
      }
      if (data.paper?.state !== 'draft') return action(++navigation);
      const operation = {selected, epoch:generation, token:++navigation, paper:data.paper};
      draftPreservation = operation; emit('status');
      try {
        if (!await saveCurrentBeforeAction(operation)) return false;
        return await action(operation.token);
      } finally {
        if (draftPreservation === operation) {draftPreservation=null; if(operation.epoch===generation && same(selected))emit('status');}
      }
    }
    async function prepareReadAloud() {
      const selected=ensureOwner();
      return withSavedDraft(selected, async () => {
        const paper=data.paper;
        if(!paper || paper.hiddenAt || paper.localDraft || !(paper.state==='sent' || paper.state==='draft' && paper.authorType==='user'))return null;
        return {...clone(paper),userId:paper.userId || selected.userId,dreamId:paper.dreamId || selected.dreamId};
      });
    }
    async function prepareDeparture() {
      const selected=ensureOwner();
      return withSavedDraft(selected,async()=>{stopVoice();return true;});
    }
    function rememberSavedDraft(paper) {
      if(data.capabilities.draftBookPaging!==1 || paper.localDraft || paper.state!=='draft' ||
        (data.monthlyReady ? paperMonthlyKey(paper)!==data.bookKey : paper.quarterKey!==data.quarterKey))return;
      const summary={paperId:paper.paperId,state:'draft',authorType:'user',createdAt:paper.createdAt,visibilityAt:null,
        quarterKey:paper.quarterKey,paperTemplateId:paper.paperTemplateId};
      // The retained window may be deep in history. A newly created head is not proven adjacent to it;
      // nor can its old tail cursor describe a locally trimmed window. Reanchor lazily on the next turn.
      windowPages=[{pageNo:0,cursor:null,nextCursor:null,items:[summary],offset:null}];pageMetadata=new Map();
      data.papers=[summary];data.cursor=null;data.newestKnown=false;
    }
    function preserveAndCreateDraft(selected, relationType, parentPaperId) {
      if (preservationCurrent(draftPreservation)) return draftPreservation.promise;
      if (data.sendAttempt?.phase === 'uncertain') throw new Error('寄出结果待确认，请先重试核实');
      if (writeLocks.get(data.paper?.paperId) || confirming) throw new Error('正在保存或寄出，请稍候');
      let readyResolve,readyReject;
      const ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject;});ready.catch(()=>{});
      const operation = { selected, epoch: generation, token: ++navigation, paper: data.paper, promise: null,ready };
      draftPreservation = operation;
      // Expose the lock before any await. Native composition may still commit its last input before freezing the snapshot.
      const work = Promise.resolve().then(async () => {
        try {
          if (!await saveCurrentBeforeAction(operation)) {readyResolve();return;}
          readyResolve();
          if(operation.cancelAction)return;
          const prior = operation.paper;
          const returnPaper = prior?.state === 'sent' ? clone(prior) : writingReturn;
          const sourceKey = JSON.stringify([selected.userId, selected.dreamId, prior?.paperId || null, relationType, parentPaperId]);
          let attempt = pendingNewDrafts.get(sourceKey);
          if (!attempt) {
            if (pendingNewDrafts.size >= 50) throw Object.assign(new Error('新信恢复记录已满，请先重试未确认的新信'), { code: 'PENDING_LIMIT' });
            attempt = { payload: { dreamId: selected.dreamId, paperTemplateId: styleSet().paper, stampId: null, sentSealStyle: styleSet().seal,
              blocks: [], relationType, parentPaperId, requestId: requestId() } };
            pendingNewDrafts.set(sourceKey, attempt);
          }
          const result = await api.createDraft(attempt.payload);
          if (!preservationCurrent(operation)) return;
          if (composition) await composition.promise;
          if (!preservationCurrent(operation)) return;
          if (!result?.paperId) throw new Error('新信建立未确认，请重试');
          if (pendingNewDrafts.get(sourceKey) === attempt) pendingNewDrafts.delete(sourceKey);
          installNewDraft(result, attempt.payload, returnPaper);
        } catch (error) {
          readyReject(error);
          if (preservationCurrent(operation)) { data.status = '旧稿保存或新信建立失败，旧稿仍保留，请重试'; emit('status'); }
          throw error;
        } finally {
          if (draftPreservation === operation) {
            draftPreservation = null;
            if (operation.epoch === generation && same(selected)) emit('status');
          }
        }
      });
      operation.promise = work;
      emit('status');
      return work;
    }
    async function newDraft({ relationType = 'letter', parentPaperId = null, preserveCurrent = false } = {}) {
      const selected = ensureOwner();
      return preserveAndCreateDraft(selected, relationType, parentPaperId);
    }
    function editable(allowConfirmation = false, allowCompositionInput = false) {
      if (data.paper?.state !== 'draft') throw new Error('已寄出信笺不可修改');
      if (data.sendAttempt?.phase === 'uncertain') throw new Error('寄出结果待确认，请先重试核实');
      if (preservationCurrent(draftPreservation) && !(allowCompositionInput && composition)) throw new Error('正在保存旧稿或建立新信，请稍候');
      if (writeLocks.get(data.paper.paperId) || confirming && !allowConfirmation) throw new Error('正在保存或寄出，请稍候');
    }
    function mutateBlocks(next, statusOnly = false) {
      editable(false, statusOnly); validate(next); stopVoice(); data.paper.blocks = next; data.status = '尚未保存';
      checkpointDirty(); emit(statusOnly ? 'status' : undefined);
    }
    function addBlock(type, values = {}, placement = null) {
      editable();
      const blockId = id();
      let block;
      if (type === 'text') block = { blockId, type, text: String(values.text || '') };
      else if (type === 'image') {
        block = { blockId, type, attachmentId: String(values.attachmentId || ''), fileID: String(values.fileID || ''), alt: String(values.alt || '') };
        if (!block.attachmentId || !block.fileID) throw new Error('图片插入失败，请重试');
      }
      else if (type === 'question') block = { blockId, type, questionId: id(), version: 1,
        questionType: values.questionType || 'open', prompt: String(values.prompt || '') };
      else if (type === 'answer') block = { blockId, type, sourcePaperId: String(values.sourcePaperId || ''),
        sourceQuestionId: String(values.sourceQuestionId || ''), sourceQuestionVersion: Number(values.sourceQuestionVersion || 1),
        promptSnapshot: String(values.promptSnapshot || ''), value: values.value || '' };
      else throw new Error('不支持的内容块');
      if (type === 'question' && block.questionType !== 'open') block.options = values.options || ['选项一', '选项二'];
      const next = [...data.paper.blocks];
      const near = placement?.nearBlockId ? next.findIndex(item => item.blockId === placement.nearBlockId) : -1;
      if (placement?.nearBlockId && near < 0) throw new Error('内容块不存在');
      const anchor = near >= 0 ? next[near] : null;
      const cut = Number(placement?.splitAt);
      if (type === 'image' && anchor?.type === 'text' && Number.isInteger(cut) && cut > 0 && cut < String(anchor.text || '').length) {
        // Caret in the middle of a paragraph: keep the head in place and move the tail after the image.
        const text = String(anchor.text);
        next.splice(near, 1, { ...anchor, text: text.slice(0, cut) }, block, { blockId: id(), type: 'text', text: text.slice(cut) });
      } else next.splice(near < 0 ? next.length : near + (placement.before ? 0 : 1), 0, block);
      mutateBlocks(next);
      if (type === 'image' && values.previewUrl) { data.media[block.attachmentId] = String(values.previewUrl); emit(); }
      return blockId;
    }
    function updateBlock(blockId, patch) {
      editable(false, true); const current = data.paper.blocks.find(block => block.blockId === blockId);
      if (!current) throw new Error('内容块不存在');
      const next = data.paper.blocks.map(block => block.blockId === blockId ? { ...block, ...patch } : block);
      mutateBlocks(next, true);
    }
    function deleteBlock(blockId) { mutateBlocks(data.paper.blocks.filter(block => block.blockId !== blockId)); }
    function moveBlock(blockId, direction) {
      const next = [...data.paper.blocks]; const index = next.findIndex(block => block.blockId === blockId);
      const target = index + (direction < 0 ? -1 : 1);
      if (index < 0 || target < 0 || target >= next.length) return;
      [next[index], next[target]] = [next[target], next[index]]; mutateBlocks(next);
    }
    function setTemplate(value) { editable(); if (!PAPER_TEMPLATES.includes(value)) throw new Error('信纸模板无效'); if(!Stationery.unlocked('papers',value,data))throw new Error('尚未解锁'); data.paper.paperTemplateId = value; data.status = '尚未保存'; checkpointDirty(); emit(); }
    function setStamp(value) { editable(); if (!STAMPS.includes(value)) throw new Error('印章无效'); data.paper.stampId = value; data.status = '尚未保存'; checkpointDirty(); emit(); }
    async function selectCover(value, quarterKey = readingKey()) {
      if (!COVER_TEMPLATES.includes(value)) throw new Error('封面模板无效');
      if(!Stationery.unlocked('covers',value,data))throw new Error('尚未解锁');
      if(data.monthlyReady) {
        const selected=ensureOwner(),epoch=generation;
        const book=data.books.find(item=>item.bookKey===quarterKey);
        if(quarterKey !== 'archive' && quarterKey > data.currentMonthKey) throw new Error('这个月份尚未解锁');
        if(quarterKey !== 'archive' && (!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(quarterKey) || quarterKey < new Date(data.cutoff + 8 * 3600000).toISOString().slice(0,7))) throw new Error('月份无效');
        if(book?.coverTemplateId===value) return;
        let result;
        try { result=await api.saveMonthlyBookCover({dreamId:selected.dreamId,bookKey:quarterKey,coverTemplateId:value,requestId:requestId()}); }
        catch(error) { if(epoch===generation && same(selected)) {data.status='封面保存失败，请重试';notify(data.status);emit('books');} throw error; }
        if(epoch!==generation || !same(selected)) return;
        data.books=data.books.map(item=>item.bookKey===quarterKey?{...item,coverTemplateId:result.coverTemplateId}:item);
        if(!book) data.books.push({bookId:`${selected.dreamId}:${quarterKey}`,dreamId:selected.dreamId,bookKey:quarterKey,coverTemplateId:result.coverTemplateId,paperCount:null});
        if(data.bookKey===quarterKey) data.coverPreview=result.coverTemplateId;
        if(quarterKey===data.currentMonthKey) rememberOpeningCover(result.coverTemplateId,quarterKey);
        emit('books');return;
      }
      if (quarterKey !== 'undated' && quarterKey > DEFAULT_QUARTER()) throw new Error('这个季度尚未解锁');
      const selected = ensureOwner();
      const book = data.books.find(item => item.quarterKey === quarterKey);
      try { root.localStorage?.setItem(coverChosenKey(quarterKey), '1'); } catch (_) {}
      // 还没寄过信的季度、以及只有旧版来信的季度，云端没有书册可存，书皮记在本机。
      if (!book || book.legacyOnly) { writeCoverPick(quarterKey, value); if (data.quarterKey === quarterKey) data.coverPreview = value; if (quarterKey === DEFAULT_QUARTER()) rememberOpeningCover(value); emit('books'); emit(); return; }
      data.status = '封面保存中…'; emit();
      try {
        const result = await api.saveBookCover({ dreamId: selected.dreamId, bookId: book.bookId,
          quarterKey: book.quarterKey, coverTemplateId: value, requestId: requestId() });
        if (!same(selected)) return;
        data.books = data.books.map(item => item.bookId === book.bookId ? { ...item, coverTemplateId: result.coverTemplateId } : item);
        if (data.quarterKey === quarterKey) data.coverPreview = result.coverTemplateId;
        if (quarterKey === DEFAULT_QUARTER()) rememberOpeningCover(result.coverTemplateId);
        data.status = '封面已保存'; emit();
      } catch (error) { data.status = '封面保存失败'; notify(error.message || data.status); emit(); throw error; }
    }
    async function saveDraft(frozenSnapshot = null, alreadyStaged = false) {
      if (!frozenSnapshot && data.paper?.localDraft) {
        const selected=ensureOwner();await allocateDraft(data.paper,selected);
        if(!same(selected)||data.paper?.localDraft)throw new Error('账号或梦角已切换，文字保留在原账号本机草稿');
      }
      if (!frozenSnapshot) editable();
      const selected = data.owner || ensureOwner();
      const snapshot = frozenSnapshot || (stagedMatches() ? stagedDraft : draftSnapshot());
      if (!snapshot) throw new Error('没有可保存的草稿');
      if (autosavePending?.snapshot.paperId === snapshot.paperId) autosavePending = null;
      validate(snapshot.blocks);
      if (!same(selected)) throw new Error('账号或梦角已切换，原草稿仅保留在原账号待办');
      if (savingSnapshots.has(snapshot.requestId)) return savingSnapshots.get(snapshot.requestId);
      if (!alreadyStaged) api.stageWrite?.('saveDraft', snapshot);
      if (data.paper?.paperId === snapshot.paperId) { data.status = '保存中…'; emit('status'); }
      const work = pendingSave.catch(() => {}).then(() => {
        if (!same(selected)) throw new Error('账号或梦角已切换，原草稿仅保留在原账号待办');
        return api.saveDraft(snapshot);
      });
      pendingSave = work;
      savingSnapshots.set(snapshot.requestId, work);
      savingContents.set(snapshot.requestId,{paperId:snapshot.paperId,signature:signature(snapshot)});
      try {
        const result = await work;
        if(same(selected))draftSignatures.set(snapshot.paperId,signature(snapshot));
        if (same(selected) && data.paper?.paperId === snapshot.paperId) {
          data.paper.revision = result.revision || data.paper.revision;
          const snapshotSignature = signature(snapshot);
          savedSignature = snapshotSignature;
          draftSignatures.set(snapshot.paperId,snapshotSignature);
          if (stagedDraft?.requestId === snapshot.requestId) stagedDraft = null;
          data.status = signature(data.paper) === snapshotSignature ? '已保存' : '仍有未保存修改';
          if (data.paper.state === 'draft') cache?.put(selected.userId, selected.dreamId, 'fullPapers', snapshot.paperId,
            clone({ ...data.paper, ...result, paperTemplateId: snapshot.paperTemplateId, stampId: snapshot.stampId, sentSealStyle: snapshot.sentSealStyle || SEALS[0], blocks: snapshot.blocks }));
          emit('status');
        }
        return result;
      } catch (error) {
        if (same(selected) && data.paper?.paperId === snapshot.paperId) { data.status = '保存失败，请重试'; emit('status'); }
        notify(error.message || '保存失败，请重试'); throw error;
      } finally {
        savingSnapshots.delete(snapshot.requestId);
        savingContents.delete(snapshot.requestId);
      }
    }
    async function sendDraft(confirmed = false, confirmedReplyMode = null, sendSettings = {}) {
      editable(confirmed);
      const intentOwner = ensureOwner(), initialPaperId = data.paper.paperId;
      let allocating = false;
      try {
        captureSendIntent(intentOwner, { ...sendSettings, expectedMode: confirmedReplyMode || currentReplyMode() }, Boolean(confirmedReplyMode));
        if (data.paper.localDraft) { allocating = true; await allocateDraft(data.paper, intentOwner); if (!same(intentOwner) || data.paper?.localDraft) throw new Error('账号或梦角已切换，信未寄出'); }
      } catch (error) { failSendIntent(intentOwner, initialPaperId, error, allocating ? 'allocation' : null); throw error; }
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = null;
      const selected = ensureOwner(), snapshot = stagedMatches() ? stagedDraft : draftSnapshot(), paperId = snapshot.paperId;
      const original = clone(data.paper);
      const previous = loadSendContext(selected, paperId);
      let context = updateSendContext(selected, previous || { paperId, sendRequestId: requestId(), replyRequestId: `letter-reply:${paperId}`,
        deliveryMode: sendSettings.deliveryMode || 'immediate', expectedMode: confirmedReplyMode || currentReplyMode(),
        sentSealStyle: original.sentSealStyle || SEALS[0], stampId: original.stampId || null,
        advanceToWriting: sendSettings.advanceToWriting === true, replyStage: confirmedReplyMode ? 'ready' : 'completed' }, { phase: 'sending', sendIssued: false });
      let issued = false;
      writeLocks.set(paperId, (writeLocks.get(paperId) || 0) + 1); data.status = '正在寄出…'; emit('status');
      try {
        const saved = await saveDraft(snapshot);
        if (!same(selected)) throw new Error('账号或梦角已切换，信未寄出');
        if (confirmedReplyMode && currentReplyMode() !== confirmedReplyMode) throw new Error('回复模式已改变，请重新确认费用');
        const payload = { dreamId: selected.dreamId, paperId, requestId: context.sendRequestId };
        api.stageWrite?.('sendDraft', payload);
        context = updateSendContext(selected, context, { sendIssued: true });
        issued = true;
        const result = { ...await api.sendDraft(payload), paperId };
        if (result.state !== 'sent') throw new Error('寄出未确认，请重试');
        const sent = { ...original, revision: saved.revision || original.revision, ...result, paperId, state: 'sent' };
        if (same(selected)) {
          context = updateSendContext(selected, context, { phase: 'sent' });
          booksRevision++; data.booksStale = true;
          if(writingDraft?.paperId===paperId)writingDraft=null;
          cache?.put(selected.userId, selected.dreamId, 'fullPapers', paperId, clone(sent));
          data.drafts = data.drafts.filter(item => item.paperId !== paperId);
          if (data.paper?.paperId === paperId) {
            enterPaperQuarter(sent);
            installPaper(sent); data.status = '已寄出'; emit();
          }
        }
        return result;
      } catch (error) {
        if (same(selected)) {
          const phase = context.phase === 'sent' ? 'sent' : issued && !error.definitive && !['REQUEST_ID_CONFLICT', 'PENDING_LIMIT', 'SESSION_REQUIRED', 'DREAM_ID_REQUIRED'].includes(error.code) ? 'uncertain' : 'failed';
          context = updateSendContext(selected, context, { phase, failureMessage: sendFailureMessage(error) });
          if (data.paper?.paperId === paperId) { data.status = data.sendAttempt.message; emit('status'); }
        }
        throw error;
      } finally {
        if (same(selected)) {
          const count = (writeLocks.get(paperId) || 1) - 1;
          if (count) writeLocks.set(paperId, count); else writeLocks.delete(paperId);
          if (data.paper?.paperId === paperId) emit('status');
        }
      }
    }
    async function sendAndReply(settings = {}) {
      if (confirming) return;
      const selected = ensureOwner(), epoch = generation, initialPaperId = data.paper?.paperId;
      const prior = data.paper && loadSendContext(data.owner, data.paper.paperId);
      if (prior && ['failed', 'uncertain', 'sent', 'sending'].includes(prior.phase)) return retrySend();
      editable();
      const style = settings.sentSealStyle || SEALS[0], deliveryMode = settings.deliveryMode || 'immediate';
      const mode = currentReplyMode();
      const stampId = settings.stampId === undefined ? data.paper.stampId || null : settings.stampId;
      try {
        const intent = captureSendIntent(selected, { ...settings, sentSealStyle: style, deliveryMode, stampId, expectedMode: settings.expectedMode || mode });
        validateReplyIntent(intent);
        confirming = true;
        if (composition) await composition.promise;
        if (epoch !== generation || !same(selected)) return;
        if (currentReplyMode() !== mode) throw new Error('回复模式已改变，请重新确认费用');
        emit('status');
        data.paper.sentSealStyle = style;
        data.paper.stampId = stampId;
        checkpointDirty();
        const source = clone(data.paper);
        const result = await sendDraft(true, mode, { deliveryMode, advanceToWriting: settings.advanceToWriting });
        confirming = false;
        if (epoch !== generation || !same(selected)) return;
        const context = loadSendContext(selected, result.paperId);
        if (settings.advanceToWriting && data.paper?.paperId === result.paperId) openWritingSurface();
        if (currentReplyMode() !== mode) {
          data.reply = { status: 'fee_changed', busy: false, sourcePaperId: result.paperId,
            label: '信已寄出，回复模式已改变，暂未生成回信', errorCode: 'REPLY_MODE_CHANGED' };
          emit('reply'); return { ...data.reply };
        }
        return await requestSentReply({ ...source, ...result, paperId: result.paperId, dreamId: selected.dreamId,
          userId: selected.userId, authorType: 'user', state: 'sent' }, selected, context);
      } catch (error) { failSendIntent(selected, initialPaperId, error); throw error; }
      finally { confirming = false; }
    }
    async function requestSentReply(source, selected, context) {
      if (!context || !same(selected)) return;
      if (context.replyStage === 'completed') return { paperId: source.paperId, state: 'sent' };
      if (currentReplyMode() !== context.expectedMode) {
        data.reply = { status: 'fee_changed', busy: false, sourcePaperId: source.paperId,
          label: '信已寄出，回复模式已改变，暂未生成回信', errorCode: 'REPLY_MODE_CHANGED' };
        emit('reply'); return { ...data.reply };
      }
      try {
        validateReplyIntent(context, false);
        updateSendContext(selected, context, { phase: 'sent', replyStage: 'requested' });
        return await replyFlow.request(source, { deliveryMode: context.deliveryMode });
      } catch (error) {
        // The letter has already been sent. Reply errors must never turn it back into a draft.
        updateSendContext(selected, context, { phase: 'sent', replyStage: 'ready' });
        data.reply = { status: 'retryable_failed', busy: false, sourcePaperId: source.paperId, label: `信已寄出，回复未完成（${sendFailureMessage(error)}）` };
        emit('reply'); return { ...data.reply };
      }
    }
    async function retrySend() {
      if (confirming) return;
      const selected = ensureOwner(), epoch = generation; let paperId = data.paper?.paperId;
      let context = paperId && loadSendContext(selected, paperId);
      if (!context) throw new Error('没有待重试的寄出记录');
      if (context.phase === 'sending') context = updateSendContext(selected, context, { phase: context.sendIssued ? 'uncertain' : 'failed' });
      if (context.phase !== 'sent' && !(context.phase === 'uncertain' && context.sendIssued)) {
        try { validateReplyIntent(context); }
        catch (error) { failSendIntent(selected, paperId, error); throw error; }
      }
      confirming = true;
      try {
        let source = data.paper;
        if (context.phase === 'uncertain' && context.sendIssued) {
          try {
            source = await api.getPaper({ dreamId: selected.dreamId, paperId });
          } catch (error) {
            if (same(selected) && epoch === generation) { showSendContext(context); data.status = '寄出结果读取失败，请重试'; emit('status'); }
            throw error;
          }
          if (epoch !== generation || !same(selected) || data.paper?.paperId !== paperId) return;
          if (source.paperId !== paperId || source.dreamId && source.dreamId !== selected.dreamId || source.userId && source.userId !== selected.userId)
            throw new Error('寄出记录归属不一致，请重试核实');
          if (!['draft', 'sent'].includes(source.state)) throw new Error('寄出结果待确认，请重试核实');
          if (source.state === 'sent') {
            context = updateSendContext(selected, context, { phase: 'sent' });
            booksRevision++; data.booksStale = true;
            if (writingDraft?.paperId === paperId) writingDraft = null;
            data.drafts = data.drafts.filter(item => item.paperId !== paperId);
            enterPaperQuarter(source); installPaper(source); data.status = '已寄出'; emit();
          } else {
            context = updateSendContext(selected, context, { phase: 'failed' });
          }
        }
        if (context.phase !== 'sent' && source.state !== 'sent') {
          validateReplyIntent(context);
          if (composition) await composition.promise;
          if (epoch !== generation || !same(selected) || data.paper?.paperId !== paperId) return;
          if (context.replyStage !== 'completed' && currentReplyMode() !== context.expectedMode) throw new Error('回复模式已改变，请重新确认费用');
          data.paper.sentSealStyle = context.sentSealStyle; data.paper.stampId = context.stampId;
          checkpointDirty(); source = clone(data.paper);
          const result = await sendDraft(true, context.replyStage === 'completed' ? null : context.expectedMode, context);
          paperId = result.paperId;
          source = { ...source, ...result, paperId, dreamId: selected.dreamId, userId: selected.userId, authorType: 'user', state: 'sent' };
          context = loadSendContext(selected, paperId);
        }
        if (epoch !== generation || !same(selected)) return;
        confirming = false;
        if (context.advanceToWriting && data.paper?.paperId === paperId) openWritingSurface();
        return await requestSentReply(source, selected, context);
      } catch (error) { failSendIntent(selected, paperId, error); throw error; }
      finally { confirming = false; }
    }
    async function openFavorites(more = false) {
      const selected = ensureOwner(), epoch = generation;
      if (data.capabilities.bookmarks !== 1 || typeof api.listBookmarks !== 'function') {
        data.favoritesError = '后台尚未更新收藏列表，请先更新 shexXLetters'; emit('favorites'); return false;
      }
      if (data.favoritesLoading || more && !data.favoritesCursor) return false;
      const cursor = more ? data.favoritesCursor : null;
      data.favoritesLoading = true; data.favoritesError = ''; emit('favorites');
      try {
        const result = await api.listBookmarks({ dreamId: selected.dreamId, limit: 24, ...(cursor ? { cursor } : {}) });
        if (epoch !== generation || !same(selected)) return false;
        const rows = more ? [...data.favorites] : [], ids = new Set(rows.map(item => item.paperId));
        for (const item of (result.items || []).slice(0, 24)) if (!ids.has(item.paperId)) { rows.push(item); ids.add(item.paperId); }
        data.favorites = rows.slice(-240); data.favoritesCursor = result.nextCursor || null;
        return true;
      } catch (_) {
        if (epoch === generation && same(selected)) data.favoritesError = '收藏读取失败，请重试（BOOKMARKS_UNAVAILABLE）';
        return false;
      } finally { if (epoch === generation) { data.favoritesLoading = false; emit('favorites'); } }
    }
    async function createCorrection() {
      if (data.paper?.state !== 'sent' || data.paper.legacySource) throw new Error('仅能更正已寄出的新信');
      await newDraft({ relationType: 'correction', parentPaperId: data.paper.paperId });
    }
    async function toggleHidden() {
      if (data.paper?.state !== 'sent') throw new Error('仅正式信可隐藏');
      const selected = ensureOwner(); const paperId = data.paper.paperId, legacy = Boolean(data.paper.legacySource);
      const hide = Boolean(!data.paper.hiddenAt);
      if (legacy) await api.updateLegacyOverlay({ dreamId: selected.dreamId, paperId,
        kind: hide ? 'hide' : 'restore', requestId: requestId() });
      else await api[hide ? 'hidePaper' : 'restorePaper']({ dreamId: selected.dreamId,
        paperId, requestId: requestId() });
      if (!same(selected) || data.paper?.paperId !== paperId) return;
      data.paper.hiddenAt = hide ? Date.now() : null; emit();
    }
    // 给已寄出 / 已收到的信换信纸（只改这一篇）。
    async function setSentTemplate(value) {
      if (!PAPER_TEMPLATES.includes(value)) throw new Error('信纸模板无效');
      if(!Stationery.unlocked('papers',value,data))throw new Error('尚未解锁');
      if (data.paper?.state !== 'sent' || data.paper.legacySource) throw new Error('这篇不能换信纸');
      if (typeof api.setPaperTemplate !== 'function') throw new Error('请先更新前端文件');
      if (data.paper.paperTemplateId === value) return;
      const selected = ensureOwner(), paperId = data.paper.paperId;
      await api.setPaperTemplate({ dreamId: selected.dreamId, paperId, paperTemplateId: value, requestId: requestId() });
      if (!same(selected) || data.paper?.paperId !== paperId) return;
      data.paper.paperTemplateId = value;
      cache?.put(selected.userId, selected.dreamId, 'fullPapers', paperId, clone(data.paper));
      emit();
    }
    // 任意一封未寄出的草稿都能删除（不限最新一封）；正式寄出的信走下方 deletePaper 原逻辑。
    async function deleteCurrentDraft() {
      const paper = data.paper, selected = ensureOwner();
      if (!paper || paper.state !== 'draft' || paper.legacySource || paper.authorType && paper.authorType !== 'user') throw new Error('这篇不能删除');
      if (['uncertain', 'sent', 'sending'].includes(data.sendAttempt?.phase) || confirming) throw new Error('正在寄出，请稍候');
      if (composition) await composition.promise;
      if (data.paper !== paper || !same(selected)) return;
      if (saveTimer) clearTimeout(saveTimer); saveTimer = null;
      if (autosavePending?.snapshot.paperId === paper.paperId) autosavePending = null;
      // 先等这封稿正在进行的建稿 / 保存落定，拿到真实 paperId，避免删错或删后又被保存回来。
      if (allocations.has(paper)) await allocations.get(paper).catch(() => {});
      const inflight = [...savingContents.entries()].filter(([, item]) => item.paperId === paper.paperId).map(([key]) => savingSnapshots.get(key)).filter(Boolean);
      if (inflight.length) await Promise.allSettled(inflight);
      if (data.paper !== paper || !same(selected)) return;
      const localId = paper.localSurfaceId || null, paperId = paper.paperId;
      if (!paper.localDraft) {
        if (typeof api.deleteDraft !== 'function') throw new Error('请先更新前端文件');
        await api.deleteDraft({ dreamId: selected.dreamId, paperId, requestId: requestId() });
        if (!same(selected)) return;
        api.clearStagedDraftSnapshot?.({ dreamId: selected.dreamId, paperId });
      }
      for (const id of new Set([paperId, localId].filter(Boolean))) api.clearLocalDraftSnapshot?.({ dreamId: selected.dreamId, paperId: id });
      draftSignatures.delete(paperId); stagedDraft = null;
      if (writingDraft === paper) writingDraft = null;
      // 删除后落回相邻可查看页：优先更早一封，其次更新一封，再其次进入草稿前所在那封。
      const index = data.papers.findIndex(item => item.paperId === paperId);
      const neighbor = index >= 0 ? data.papers[index + 1] || data.papers[index - 1] : writingReturn && writingReturn.paperId !== paperId ? writingReturn : data.papers[0];
      windowPages = windowPages.map(row => ({ ...row, items: row.items.filter(item => item.paperId !== paperId), offset: null }));
      pageMetadata = new Map(windowPages.map(row => [row.pageNo, { cursor: row.cursor, nextCursor: row.nextCursor, offset: null, count: row.items.length, contents: JSON.stringify(row.items.map(item => item.paperId)) }]));
      data.papers = data.papers.filter(item => item.paperId !== paperId);
      data.drafts = (data.drafts || []).filter(item => item.paperId !== paperId);
      booksRevision++; data.booksStale = true;
      // 先脱离已删除的草稿，后续导航不会再把它保存回来。
      data.paper = null; data.mode = 'read'; savedSignature = '';
      notify('已删除草稿');
      if (neighbor) {
        try { if (await openPaper(neighbor.paperId, { legacy: Boolean(neighbor.legacySource) })) return; } catch (_) { /* 相邻页读取失败时回到本册开头 */ }
      }
      await selectBook(readingKey());
    }
    async function deletePaper() {
      if (data.paper?.state === 'draft') return deleteCurrentDraft();
      if (data.paper?.state !== 'sent' || data.paper.legacySource) throw new Error('这篇不能删除');
      if (typeof api.deletePaper !== 'function') throw new Error('请先更新前端文件');
      const selected = ensureOwner(), paperId = data.paper.paperId;
      await api.deletePaper({ dreamId: selected.dreamId, paperId, requestId: requestId() });
      if (!same(selected)) return;
      data.papers = data.papers.filter(item => item.paperId !== paperId);
      data.favorites = data.favorites.filter(item => item.paperId !== paperId);
      booksRevision++; data.booksStale = true; notify('已删除');
      await selectBook(readingKey());
    }
    async function toggleBookmark(blockId) {
      if (!data.paper || data.paper.state !== 'sent') throw new Error('草稿不能收藏');
      const selected = ensureOwner(); const paperId = data.paper.paperId, epoch = generation, original = clone(data.paper);
      if (data.paper.legacySource) {
        const prior = Boolean(data.paper.bookmarked);
        await api.updateLegacyOverlay({ dreamId: selected.dreamId, paperId,
          kind: prior ? 'unbookmark' : 'bookmark', requestId: requestId() });
        if (same(selected) && data.paper?.paperId === paperId) { data.paper.bookmarked = !prior; emit(); }
        return;
      }
      const bookmarkId = data.bookmarkIds[blockId];
      let createdId = null;
      if (bookmarkId) {
        await api.deleteBookmark({ dreamId: selected.dreamId, bookmarkId, requestId: requestId() });
      } else {
        const value = await api.putBookmark({ dreamId: selected.dreamId, paperId, blockId, requestId: requestId() });
        if (!value?.bookmarkId) throw new Error('收藏保存未确认，请重试');
        createdId = value.bookmarkId;
      }
      if (epoch === generation && same(selected)) {
        const target = data.paper?.paperId === paperId ? data.paper : cache?.get(selected.userId, selected.dreamId, 'fullPapers', paperId) || original;
        target.bookmarks = (target.bookmarks || []).filter(item => item.blockId !== blockId);
        if (createdId) target.bookmarks.push({ bookmarkId: createdId, blockId });
        cache?.put(selected.userId, selected.dreamId, 'fullPapers', paperId, clone(target));
        if (data.paper?.paperId === paperId) {
          if (createdId) data.bookmarkIds[blockId] = createdId; else delete data.bookmarkIds[blockId];
        }
        emit();
      }
    }
    const imageLoads = new Set();
    async function loadImage(attachmentId) {
      const selected = ensureOwner(); const epoch = generation; const paperId = data.paper?.paperId;
      if (!paperId || data.media[attachmentId] || !data.paper.blocks?.some(block => block.type === 'image' && block.attachmentId === attachmentId)) return;
      // A not-yet-allocated local draft has no server paper to resolve media from; its preview lives in data.media.
      if (String(paperId).startsWith('local:')) return;
      const loadKey = `${paperId}\u0000${attachmentId}`;
      if (imageLoads.has(loadKey)) return;
      imageLoads.add(loadKey);
      let result;
      try {
        result = await api.getPaperMedia({ dreamId: selected.dreamId, paperId, mediaIds: [attachmentId],
          ...(data.paper.legacySource ? { legacy: true } : {}) });
      } catch (_) { return; } finally { imageLoads.delete(loadKey); }
      if (epoch !== generation || !same(selected) || data.paper?.paperId !== paperId) return;
      const fileID = result.references?.find(row => row.attachmentId === attachmentId)?.fileID;
      const item = result.urls?.find(row => row.fileID === fileID);
      const url = item?.tempFileURL || item?.url;
      if (url) { data.media[attachmentId] = url; emit(); }
    }
    function beginComposition() {
      if (composition || preservationCurrent(draftPreservation) || data.paper?.state !== 'draft') return;
      let resolve; const promise = new Promise(done => { resolve = done; });
      composition = { promise, resolve };
    }
    function endComposition() { const prior = composition; composition = null; prior?.resolve(); }
    function dispose() {
      unsubscribeIncoming();
      persistDirty(); replyFlow?.dispose(); api.cancelReads?.(); stopVoice(); clearMedia(); generation++; navigation++;
      pendingNewDrafts.clear();
      paperReads.clear();
      autosavePending = null;
      for (const queue of readingQueues.values()) queue.pending = null;
      endComposition(); emit('navigation');
    }
    function scheduleSave() {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(async () => {
        saveTimer = null;
        if (!same(data.owner) || data.paper?.state !== 'draft' || signature(data.paper) === savedSignature&&!unsettledDifferent(data.paper)) return;
        if(data.paper.localDraft){const selected=data.owner,preview=data.paper;try{await allocateDraft(preview,selected);}catch(_){return;}if(!same(selected)||data.paper!==preview||preview.localDraft)return;}
        autosavePending = { snapshot: stagedMatches() ? stagedDraft : draftSnapshot(), selected: data.owner, epoch: generation };
        void drainAutosave();
      }, 5000);
    }
    async function drainAutosave() {
      if (autosaveRunning) return;
      autosaveRunning = true;
      try {
        while (autosavePending) {
          await pendingSave.catch(() => {});
          const target = autosavePending;
          autosavePending = null;
          if (!target || target.epoch !== generation || !same(target.selected) || data.paper?.paperId !== target.snapshot.paperId) continue;
          if (signature(data.paper) === savedSignature) continue;
          try { await saveDraft(target.snapshot); } catch (_) { /* Durable checkpoint remains available for explicit retry. */ }
        }
      } finally { autosaveRunning = false; }
    }
    return Object.freeze({ state, setOnChange(callback) { onChange = callback; }, open, selectQuarter, selectBook, loadMore, loadMoreBooks, refreshBooksIfStale, openPaper,
      next, previous, fromNewest, claimSecondBook, unlockStationeryEarly, unsealIncoming, writeLatest, expandDrafts, loadMoreDrafts, openChain, loadMoreChain, openRelation, expandLegacy, loadMoreLegacy, newDraft, addBlock, updateBlock, deleteBlock,
      moveBlock, setTemplate, setStamp, selectCover, saveDraft, prepareReadAloud, prepareDeparture, sendDraft, createCorrection, toggleHidden, deletePaper, setSentTemplate,
      sendAndReply, retrySend, openFavorites, setProactive, collectIncoming, viewIncoming, refreshIncoming, checkPendingIncoming, resumePendingIncoming, dismissPendingIncoming, viewRecoveredIncoming, retryReply: () => replyFlow?.retry(), checkReply: () => replyFlow?.check(),
      toggleBookmark, loadImage, scheduleSave, beginComposition, endComposition, dispose, reset });
  }
  return Object.freeze({ createController, validate, PAPER_TEMPLATES, COVER_TEMPLATES, STAMPS });
});
