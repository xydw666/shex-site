// X103 · WorldRun 创作者变量的唯一契约模块（纯函数，无 DOM、无网络、无存储）。
//
// 一份定义，四处复用：
//   Phase 2  前端 context 保留变量快照（normalizeValues / mergeSnapshot）
//   Phase 3  创作侧变量定义扩展 displayName / public / aiWritable（normalizeDefinitions）
//   Phase 4  Beautify 只读公开投影（publicProjection）
//   Phase 6  服务端校验 AI 候选（validateCandidate）——服务端 require 同一份，禁止另写一套
//
// 安全默认一律「拒绝」：旧世界的变量缺 public / aiWritable 时，既不展示也不允许 AI 写。
// 任何类型不匹配一律判不合法并拒绝，绝不自动强转。
(function initWorldRunVariables(global, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.SHEXWorldRunVariables = api;
})(typeof window !== 'undefined' ? window : globalThis, function createWorldRunVariablesModule() {
  'use strict';

  const CONTRACT_VERSION = 'world-run-variables-v1';
  const TYPES = Object.freeze(['number', 'string', 'boolean', 'enum']);
  const MAX_VARIABLES = 64;          // 一个世界的变量定义上限
  const MAX_PUBLIC_EXPOSED = 24;     // 允许进入 Beautify 绑定上下文的公开变量上限
  const MAX_KEY_LENGTH = 64;
  const MAX_STRING_VALUE = 200;      // 公开字符串值的展示截断
  const MAX_DISPLAY_NAME = 40;
  const MAX_ENUM_VALUES = 32;

  function text(value, max) {
    return Array.from(String(value == null ? '' : value).trim()).slice(0, max).join('');
  }
  function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }
  // 只有真正的数字、或非空数字字符串才算数。绝不能让 Number(null)===0 这类隐式转换
  // 把「无上下限」的 null 腐蚀成 0——本模块会被反复归一化（definitionMap / publicProjection /
  // validateCandidate 各自再跑一次 normalizeDefinitions），归一化必须幂等。
  function finiteNumber(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'string' && value.trim() !== '') {
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : null;
    }
    return null;
  }

  // ---------------------------------------------------------------- 定义

  // 旧数据缺字段必须安全降级，绝不抛错：public/aiWritable 缺省为 false，
  // displayName 回落 description，再回落 key。
  function normalizeDefinition(input) {
    if (!isPlainObject(input)) return null;
    const key = text(input.key, MAX_KEY_LENGTH);
    if (!key) return null;
    const rawType = text(input.type, 16).toLowerCase();
    const type = TYPES.includes(rawType) ? rawType : 'string';
    const description = text(input.description, 120);
    const displayName = text(input.displayName, MAX_DISPLAY_NAME) || description.slice(0, MAX_DISPLAY_NAME) || key;
    const definition = {
      key,
      type,
      displayName,
      description,
      public: input.public === true,
      aiWritable: input.aiWritable === true
    };
    if (type === 'number') {
      const min = finiteNumber(input.min);
      const max = finiteNumber(input.max);
      definition.min = min;
      definition.max = max;
      definition.initialValue = finiteNumber(input.initialValue) ?? 0;
    } else if (type === 'boolean') {
      definition.initialValue = input.initialValue === true;
    } else if (type === 'enum') {
      const seen = new Set();
      definition.enumValues = (Array.isArray(input.enumValues) ? input.enumValues : [])
        .map((item) => text(item, MAX_STRING_VALUE))
        .filter((item) => item && !seen.has(item) && seen.add(item))
        .slice(0, MAX_ENUM_VALUES);
      const initial = text(input.initialValue, MAX_STRING_VALUE);
      definition.initialValue = definition.enumValues.includes(initial) ? initial : (definition.enumValues[0] || '');
    } else {
      definition.initialValue = text(input.initialValue, MAX_STRING_VALUE);
    }
    return Object.freeze(definition);
  }

  function normalizeDefinitions(input) {
    const source = Array.isArray(input)
      ? input
      : (isPlainObject(input) ? Object.entries(input).map(([key, value]) => (isPlainObject(value) ? { ...value, key } : { key, initialValue:value })) : []);
    const byKey = new Map();
    source.forEach((item) => {
      const definition = normalizeDefinition(item);
      if (definition && !byKey.has(definition.key)) byKey.set(definition.key, definition);
    });
    return Object.freeze([...byKey.values()].slice(0, MAX_VARIABLES));
  }

  function definitionMap(definitions) {
    return new Map(normalizeDefinitions(definitions).map((item) => [item.key, item]));
  }

  // ---------------------------------------------------------------- 取值

  // 接受两种服务端形状：{key: value} 映射，或 [{key, value}] 数组。值不做任何类型强转。
  function normalizeValues(input) {
    const entries = Array.isArray(input)
      ? input.filter(isPlainObject).map((item) => [text(item.key, MAX_KEY_LENGTH), item.value])
      : (isPlainObject(input) ? Object.entries(input).map(([key, value]) => [text(key, MAX_KEY_LENGTH), isPlainObject(value) && 'value' in value ? value.value : value]) : []);
    const output = {};
    entries.forEach(([key, value]) => {
      if (!key || Object.prototype.hasOwnProperty.call(output, key)) return;
      if (value === undefined) return;
      output[key] = value;
    });
    return Object.freeze(output);
  }

  function isEmptySnapshot(snapshot) {
    return !isPlainObject(snapshot) || !Object.keys(snapshot).length;
  }

  // 「每轮有新快照就换成权威值，没有就沿用」+「旧快照不得覆盖更新后的权威快照」。
  // 双方都带 revision 时按 revision 比大小；服务端没给 revision 时退化为后写生效。
  function mergeSnapshot(current, incoming, options = {}) {
    const currentValues = normalizeValues(current);
    if (incoming === undefined || incoming === null) return currentValues;
    const incomingValues = normalizeValues(incoming);
    if (isEmptySnapshot(incomingValues)) return currentValues;
    const currentRevision = finiteNumber(options.currentRevision);
    const incomingRevision = finiteNumber(options.incomingRevision);
    if (currentRevision !== null && incomingRevision !== null && incomingRevision < currentRevision) return currentValues;
    return incomingValues;
  }

  // mergeSnapshot 的带回执版本：调用方需要知道这一轮到底换没换，才能同步推进
  // variablesRevision——否则被拒的陈旧快照会把 revision 也一起写回去，下一轮就守不住了。
  // 注意：不能用「mergeSnapshot 的返回值是否还是同一个引用」来判断有没有换——
  // mergeSnapshot 内部会重新归一化，永远返回新对象，那样 accepted 恒为 true，
  // 被拒的陈旧快照会把它的 revision 一起写回去，守门就失效了。这里显式判定。
  function applySnapshot(currentValues, currentRevision, incoming, incomingRevision) {
    const current = normalizeValues(currentValues);
    const currentRev = finiteNumber(currentRevision);
    const incomingRev = finiteNumber(incomingRevision);
    const incomingValues = incoming === undefined || incoming === null ? null : normalizeValues(incoming);
    const hasIncoming = incomingValues !== null && !isEmptySnapshot(incomingValues);
    const stale = hasIncoming && currentRev !== null && incomingRev !== null && incomingRev < currentRev;
    const accepted = hasIncoming && !stale;
    return Object.freeze({
      values:accepted ? incomingValues : current,
      revision:accepted && incomingRev !== null ? incomingRev : currentRev,
      accepted
    });
  }

  // ---------------------------------------------------------------- 类型校验

  function checkValue(definition, value) {
    if (!definition) return { ok:false, reason:'VARIABLE_NOT_FOUND' };
    if (definition.type === 'number') {
      if (typeof value !== 'number' || !Number.isFinite(value)) return { ok:false, reason:'VARIABLE_TYPE_MISMATCH' };
      if (definition.min !== null && definition.min !== undefined && value < definition.min) return { ok:false, reason:'VARIABLE_RANGE_EXCEEDED' };
      if (definition.max !== null && definition.max !== undefined && value > definition.max) return { ok:false, reason:'VARIABLE_RANGE_EXCEEDED' };
      return { ok:true, value };
    }
    if (definition.type === 'boolean') {
      if (typeof value !== 'boolean') return { ok:false, reason:'VARIABLE_TYPE_MISMATCH' };
      return { ok:true, value };
    }
    if (definition.type === 'enum') {
      if (typeof value !== 'string') return { ok:false, reason:'VARIABLE_TYPE_MISMATCH' };
      if (!definition.enumValues.includes(value)) return { ok:false, reason:'VARIABLE_ENUM_INVALID' };
      return { ok:true, value };
    }
    if (typeof value !== 'string') return { ok:false, reason:'VARIABLE_TYPE_MISMATCH' };
    if (Array.from(value).length > MAX_STRING_VALUE) return { ok:false, reason:'VARIABLE_VALUE_TOO_LONG' };
    return { ok:true, value };
  }

  // Phase 6：服务端校验 AI 候选。客户端永远不得据此直写 state.variables。
  function validateCandidate(definitions, candidate) {
    const map = definitionMap(definitions);
    if (!isPlainObject(candidate)) return { ok:false, reason:'VARIABLE_CANDIDATE_INVALID' };
    const key = text(candidate.key, MAX_KEY_LENGTH);
    if (!key) return { ok:false, reason:'VARIABLE_CANDIDATE_INVALID' };
    const definition = map.get(key);
    if (!definition) return { ok:false, reason:'VARIABLE_NOT_FOUND', key };
    if (definition.aiWritable !== true) return { ok:false, reason:'VARIABLE_NOT_AI_WRITABLE', key };
    const checked = checkValue(definition, candidate.value);
    if (!checked.ok) return { ok:false, reason:checked.reason, key };
    return { ok:true, key, type:definition.type, value:checked.value };
  }

  function validateCandidates(definitions, candidates) {
    const accepted = [];
    const rejected = [];
    const seen = new Set();
    (Array.isArray(candidates) ? candidates : []).forEach((candidate) => {
      const result = validateCandidate(definitions, candidate);
      if (!result.ok) { rejected.push(result); return; }
      if (seen.has(result.key)) { rejected.push({ ok:false, reason:'VARIABLE_DUPLICATE_CANDIDATE', key:result.key }); return; }
      seen.add(result.key);
      accepted.push(result);
    });
    return { accepted, rejected };
  }

  // ---------------------------------------------------------------- 公开投影

  // Beautify 只能看到这里输出的东西：public===true、类型合法、字符串已截断。
  // 值缺失时回落 initialValue；类型不匹配的值直接丢弃，不强转、不显示脏数据。
  function publicProjection(definitions, values) {
    const normalizedValues = normalizeValues(values);
    const output = {};
    let exposed = 0;
    normalizeDefinitions(definitions).forEach((definition) => {
      if (definition.public !== true || exposed >= MAX_PUBLIC_EXPOSED) return;
      const stored = Object.prototype.hasOwnProperty.call(normalizedValues, definition.key)
        ? normalizedValues[definition.key]
        : definition.initialValue;
      // 展示侧与写入侧对超长字符串的处理必须不同：写入要拒（不能静默存半截数据），
      // 展示要截断（不能因为长就让整条变量从卡片上消失）。枚举不截断——截断后必然不在
      // enumValues 里，本来就该判非法。
      const raw = definition.type === 'string' && typeof stored === 'string'
        ? text(stored, MAX_STRING_VALUE)
        : stored;
      const checked = checkValue(definition, raw);
      if (!checked.ok) return;
      output[definition.key] = Object.freeze({
        key:definition.key,
        type:definition.type,
        displayName:definition.displayName,
        value:definition.type === 'string' || definition.type === 'enum'
          ? text(checked.value, MAX_STRING_VALUE)
          : checked.value
      });
      exposed += 1;
    });
    return Object.freeze(output);
  }

  function publicKeys(definitions) {
    return normalizeDefinitions(definitions).filter((item) => item.public === true).slice(0, MAX_PUBLIC_EXPOSED).map((item) => item.key);
  }

  return Object.freeze({
    CONTRACT_VERSION, TYPES, MAX_VARIABLES, MAX_PUBLIC_EXPOSED, MAX_STRING_VALUE, MAX_KEY_LENGTH,
    normalizeDefinition, normalizeDefinitions, definitionMap,
    normalizeValues, mergeSnapshot, applySnapshot, checkValue,
    validateCandidate, validateCandidates,
    publicProjection, publicKeys
  });
});
