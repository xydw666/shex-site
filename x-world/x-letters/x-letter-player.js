((root, factory) => {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SHEXXLettersPlayer = api;
})(typeof window !== 'undefined' ? window : globalThis, () => {
  'use strict';
  const key = segment => `${segment.blockId}:${segment.segmentHash}`;
  const failureMessages = Object.freeze({
    VOICE_MODEL_NOT_READY: '该梦角还没有可用音色，请先到 X传讯的声音设置中绑定或生成音色，再回来朗读。',
    VOICE_VERSION_CHANGED: '梦角声音已变化，请重新打开这封信后再朗读。',
    SESSION_EXPIRED: '登录已过期，请重新登录后再朗读。',
    LETTER_VOICE_FORBIDDEN: '信笺归属或正文校验未通过，请重新打开这封信；仍失败请联系管理员。',
    INVALID_LETTER_VOICE: '朗读片段校验未通过，请重新打开这封信后再试。',
    VOICE_AUDIO_UPLOAD_FAILED: '音频已生成，但保存失败，请点播放重试。',
    VOICE_AUDIO_COPY_FAILED: '音频已生成，但长期保存失败，请点播放重试。',
    VOICE_PIN_UNAVAILABLE: '音频保存服务暂不可用，请稍后重试；仍失败请联系管理员。',
    VOICE_REFERENCE_FORBIDDEN: '音频登记校验未通过，请重新打开这封信；仍失败请联系管理员。',
    VOICE_REFERENCE_CONFLICT: '音频登记记录不一致，请重新打开这封信；仍失败请联系管理员。'
  });
  function failureLabel(failure, fallback, describe) {
    if (typeof describe === 'function') return describe({
      code: failure?.code || (failure?.stage === 'save' ? 'VOICE_REFERENCE_SAVE_FAILED' : 'VOICE_FAILED'),
      supportCode: failure?.supportCode || '', diagnosticTraceId: failure?.diagnosticTraceId || '', voiceStage: failure?.stage || ''
    });
    const code = failure?.code;
    if (Object.prototype.hasOwnProperty.call(failureMessages, code)) return `${failureMessages[code]}（${code}）`;
    if (failure?.stage === 'save') return '音频已生成，但保存失败，请点播放重试。';
    if (failure?.stage === 'generate') return '音频生成失败，请稍后点播放重试。';
    return fallback;
  }
  function createPlayer(options) {
    const voice = options.voice;
    let epoch = 0, disposed = false, paper = null, quote = null, index = 0, lookupDone = false;
    const ready = new Map();
    const failures = new Map();
    let generationFailure = null;
    let transitionTimer = null;
    // Background generation: segments become playable one by one; waiters wake on each arrival.
    let generating = null;
    const waiters = new Set();
    const wake = () => { const list = [...waiters]; waiters.clear(); list.forEach(resolve => resolve()); };
    const cancelTransition = () => { if (transitionTimer !== null) clearTimeout(transitionTimer); transitionTimer = null; };
    let state = { visible: false, status: 'idle', busy: false, label: '' };
    const publish = (status, label, busy = false) => {
      state = { visible: Boolean(paper), status, label, busy };
      options.onChange?.({ ...state });
    };
    const owned = () => paper && options.currentUser?.()?.userId === paper.userId
      && options.currentDream?.() === paper.dreamId && (!options.isActive || options.isActive(paper));
    const active = token => !disposed && token === epoch && owned();
    function close() {
      cancelTransition();
      epoch++; if (paper) voice.stopLetterVoice?.();
      paper = null; quote = null; ready.clear(); failures.clear(); generationFailure = null;
      index = 0; lookupDone = false; generating = null; wake();
      publish('idle', '');
    }
    const accept = reference => {
      const segment = quote.segments.find(item => key(item) === key(reference) && Number(reference.voiceVersion) === item.voiceVersion);
      if (!segment || reference.paperId !== paper.paperId || !/^cloud:\/\/[^/]+\/.+/.test(String(reference.fileID || ''))) return;
      const saved = { ...segment, fileID: reference.fileID };
      if (voice.rememberLetterVoiceReference?.({ userId: paper.userId, dreamId: paper.dreamId, segment: saved,
        currentUser: options.currentUser, currentDream: options.currentDream })) ready.set(key(segment), saved);
    };
    async function open(selected) {
      if (disposed) return false;
      close();
      if (!(selected?.state === 'sent' || selected?.state === 'draft' && selected.authorType === 'user') || selected.hiddenAt || selected.hidden || selected.localDraft) return false;
      paper = { ...selected, blocks: (selected.blocks || []).map(block => ({ ...block })) };
      if (!owned()) { close(); return false; }
      const token = epoch;
      publish('idle', '正在准备朗读…', true);
      try {
        const prepared = await voice.planLetterVoice(paper, Number(options.voiceVersion?.() || 1));
        if (!active(token)) { if (token === epoch) close(); return false; }
        quote = prepared;
        if (!quote.segmentCount) { publish('empty', '这封信没有可朗读的普通文字'); return false; }
        publish('idle', '点击播放朗读正文'); return true;
      } catch (_) {
        if (active(token)) publish('error', '朗读服务暂不可用，请稍后重试');
        return false;
      }
    }
    async function loadReferences(token) {
      if (lookupDone) return;
      // Saved on this device already: no cloud lookup needed.
      for (const segment of quote.segments) {
        if (ready.has(key(segment))) continue;
        const fileID = voice.knownLetterVoice?.({ userId: paper.userId, dreamId: paper.dreamId, segment });
        if (fileID) accept({ ...segment, fileID });
      }
      if (typeof options.api?.getPaperMedia !== 'function') throw new Error('VOICE_REFERENCE_UNAVAILABLE');
      const missing = [...new Map(quote.segments.filter(item => !ready.has(key(item))).map(item => [key(item),item])).values()];
      for (let start = 0; start < missing.length; start += 10) {
        if (!active(token)) return;
        const result = await options.api.getPaperMedia({ dreamId: paper.dreamId, paperId: paper.paperId,
          mediaIds: [], legacy: Boolean(paper.legacySource), voiceSegments: missing.slice(start, start + 10)
            .map(({ blockId, segmentHash, voiceVersion }) => ({ blockId, segmentHash, voiceVersion })) });
        if (!active(token)) return;
        for (const reference of result.voiceReferences || []) accept(reference);
      }
      lookupDone = true;
    }
    const prefetchAfter = at => {
      for (const next of quote?.segments.slice(at + 1, at + 3) || []) {
        const saved = ready.get(key(next));
        if (saved) void voice.prefetchLetterVoice?.({ userId: paper.userId, dreamId: paper.dreamId, segment: saved,
          currentUser: options.currentUser, currentDream: options.currentDream });
      }
    };
    async function waitReady(token, segmentKey) {
      while (!ready.has(segmentKey)) {
        if (!active(token)) return false;
        if (!generating) {
          const failedCount = quote.segments.filter(segment => !ready.has(key(segment))).length;
          publish('error', failureLabel(failures.get(segmentKey) || generationFailure,
            `${failedCount} 段音频未就绪，请点播放重试`, voice.failureMessage));
          throw new Error('VOICE_INCOMPLETE');
        }
        publish('generating', '正在生成下一段…', true);
        await new Promise(resolve => waiters.add(resolve));
      }
      return active(token);
    }
    async function playAt(token, button, wasPlaying = false) {
      if (!active(token)) return false;
      if (!await waitReady(token, key(quote.segments[index]))) return false;
      prefetchAfter(index);
      const segment = ready.get(key(quote.segments[index]));
      if (!segment) throw new Error('VOICE_INCOMPLETE');
      // Re-register just the current segment: the shared voice reference cache stays bounded.
      if (!voice.rememberLetterVoiceReference?.({ userId: paper.userId, dreamId: paper.dreamId, segment,
        currentUser: options.currentUser, currentDream: options.currentDream })) throw new Error('VOICE_OWNER_CHANGED');
      publish('loading', wasPlaying ? '正在暂停…' : '正在加载音频…', true);
      const currentIndex = index;
      const played = await voice.playLetterVoice({ userId: paper.userId, dreamId: paper.dreamId, segment, button,
        currentUser: options.currentUser, currentDream: options.currentDream,
        onError: () => { if (active(token) && index === currentIndex) publish('error', failureLabel({ code: 'VOICE_AUDIO_PLAYBACK_FAILED' }, '音频播放失败，点播放重试', voice.failureMessage)); },
        onEnded: () => {
          if (!active(token) || index !== currentIndex) return;
          index++;
          if (index === quote.segments.length) publish('ended', '播放完毕，可再次播放');
          else {
            const pauseMs = quote.segments[index].blockId === segment.blockId ? 120 : 300;
            publish('waiting', '正在朗读正文');
            transitionTimer = setTimeout(() => {
              transitionTimer = null;
              if (!active(token)) { if (token === epoch) close(); return; }
              void playAt(token, button).catch(() => { if (active(token) && state.status !== 'error') publish('error', '音频播放失败，点播放重试'); });
            }, pauseMs);
          }
        } });
      if (!active(token) || index !== currentIndex) return false;
      if (state.status === 'error') return false;
      publish(played ? 'playing' : wasPlaying ? 'paused' : 'error', played ? '正在朗读正文' : wasPlaying ? '已暂停，点播放继续' : '音频播放失败，点播放重试');
      return Boolean(played);
    }
    async function toggle(button) {
      if (disposed || !paper || state.busy) return false;
      if (!quote) { if (!await open(paper)) return false; return toggle(button); }
      if (!quote.segmentCount) return false;
      const token = epoch, wasPlaying = state.status === 'playing';
      if (!active(token)) { close(); return false; }
      if (state.status === 'waiting') {
        cancelTransition(); publish('paused', '已暂停，点播放继续'); return false;
      }
      try {
        if (state.status === 'ended') index = 0;
        publish('checking', '正在读取已保存音频…', true);
        await loadReferences(token);
        if (!active(token)) { if (token === epoch) close(); return false; }
        const missing = quote.segments.filter(segment => !ready.has(key(segment)));
        if (missing.length && !generating) {
          const remaining = { ...quote, segmentCount: missing.length, segments: missing,
            totalEnergyCost: missing.reduce((sum, segment) => sum + segment.energyCost, 0) };
          const message = `朗读文字：\n${quote.text}\n\n需要生成 ${missing.length} 段；每段按长度 1／3／5／7／14 能量计费，合计最多 ${remaining.totalEnergyCost} 能量。已保存片段直接复用。确认生成并朗读吗？`;
          if (!await options.confirmVoice?.(message, remaining)) { if (active(token)) publish('idle', '点击播放朗读正文'); return false; }
          if (!active(token)) { if (token === epoch) close(); return false; }
          publish('generating', '正在生成并保存音频…', true);
          failures.clear(); generationFailure = null;
          // Generate in the background (a few at once) and start playing as soon as the current segment is saved.
          const run = voice.requestLetterVoice({ paper, voiceVersion: quote.segments[0].voiceVersion, api: options.api,
            onlySegments: missing.map(key), currentUser: options.currentUser, currentDream: options.currentDream, isActive: () => active(token),
            onReady: segment => { if (active(token)) { accept(segment); wake(); } } });
          generating = run;
          run.then(result => {
            if (!active(token)) return;
            for (const segment of result.ready || []) accept(segment);
            for (const failed of result.failed || []) {
              const failure = { code: failed.error?.code, stage: failed.stage, supportCode: failed.error?.supportCode,
                diagnosticTraceId: failed.error?.diagnosticTraceId };
              failures.set(key(failed), failure);
              if (!generationFailure) generationFailure = failure;
            }
          }, error => { if (active(token)) generationFailure = { code: error?.code, stage: 'generate', supportCode: error?.supportCode, diagnosticTraceId: error?.diagnosticTraceId }; })
            .finally(() => { if (generating === run) generating = null; wake(); });
        }
        return await playAt(token, button, wasPlaying);
      } catch (error) {
        if (active(token)) { if (state.status !== 'error') publish('error', failureLabel(error, '朗读读取或保存失败，点播放重试', voice.failureMessage)); }
        else if (token === epoch) close();
        return false;
      }
    }
    return Object.freeze({ open, toggle, close, state: () => ({ ...state }), dispose: () => { close(); disposed = true; } });
  }
  return Object.freeze({ createPlayer });
});
