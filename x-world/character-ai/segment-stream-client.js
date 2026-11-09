(function initSegmentStreamClient(global, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.SHEXSegmentStreamClient = api;
})(typeof window !== 'undefined' ? window : globalThis, function createSegmentStreamClientAPI() {
  'use strict';

  const PROTOCOL_VERSION = 'segment-delta-v1';
  const ALLOWED_TYPES = new Set(['scene', 'action', 'dialogue']);
  const MAX_SEGMENTS = 40;
  const MAX_CHARACTERS = 1800;

  function protocolError(code, message) {
    const error = new Error(message || code);
    error.code = code;
    return error;
  }

  function createAccumulator(options = {}) {
    const requestId = String(options.requestId || '').trim();
    const segments = new Map();
    const order = [];
    let lastSeq = 0;
    let totalCharacters = 0;

    function snapshot() {
      return order.map((segmentId) => segments.get(segmentId)).filter(Boolean).map((segment) => ({ ...segment }));
    }

    function apply(eventValue = {}) {
      const event = eventValue && typeof eventValue === 'object' ? eventValue : {};
      if (String(event.protocol || '') !== PROTOCOL_VERSION) {
        throw protocolError('SEGMENT_STREAM_PROTOCOL_MISMATCH', '流式分段协议不匹配');
      }
      if (!requestId || String(event.requestId || '') !== requestId) {
        throw protocolError('SEGMENT_STREAM_REQUEST_ID_MISMATCH', '流式分段任务编号不匹配');
      }
      const seq = Number(event.seq || 0);
      if (!Number.isSafeInteger(seq) || seq <= 0) {
        throw protocolError('SEGMENT_STREAM_SEQUENCE_INVALID', '流式分段序号无效');
      }
      if (seq <= lastSeq) return { applied: false, duplicate: true, event, segments: snapshot() };
      if (seq !== lastSeq + 1) {
        throw protocolError('SEGMENT_STREAM_SEQUENCE_GAP', '流式分段数据不完整');
      }
      const op = String(event.op || '');
      const segmentId = String(event.segmentId || '').trim();
      const type = String(event.type || '').trim().toLowerCase();
      if (!segmentId || !ALLOWED_TYPES.has(type) || !['append', 'replace'].includes(op)) {
        throw protocolError('SEGMENT_STREAM_EVENT_INVALID', '流式分段事件无效');
      }
      lastSeq = seq;

      let segment = segments.get(segmentId);
      if (!segment) {
        if (segments.size >= MAX_SEGMENTS) throw protocolError('SEGMENT_STREAM_LIMIT', '流式分段数量超过限制');
        segment = { segmentId, type, text: '' };
        segments.set(segmentId, segment);
        order.push(segmentId);
      }

      if (op === 'append') {
        if (segment.type !== type) throw protocolError('SEGMENT_STREAM_TYPE_MISMATCH', '流式分段类型发生异常变化');
        const available = Math.max(0, MAX_CHARACTERS - totalCharacters);
        const delta = Array.from(String(event.delta || '')).slice(0, available).join('');
        segment.text += delta;
        totalCharacters += Array.from(delta).length;
        return { applied: Boolean(delta), duplicate: false, event: { ...event, delta }, segments: snapshot() };
      }

      const nextText = Array.from(String(event.text || '')).slice(0, MAX_CHARACTERS).join('');
      totalCharacters -= Array.from(segment.text).length;
      segment.type = type;
      segment.text = nextText;
      totalCharacters += Array.from(nextText).length;
      if (!nextText) {
        segments.delete(segmentId);
        const index = order.indexOf(segmentId);
        if (index >= 0) order.splice(index, 1);
      }
      return { applied: true, duplicate: false, event: { ...event, text: nextText }, segments: snapshot() };
    }

    return Object.freeze({
      apply,
      snapshot,
      get lastSeq() { return lastSeq; },
      get protocol() { return PROTOCOL_VERSION; }
    });
  }

  return Object.freeze({ PROTOCOL_VERSION, createAccumulator });
});
