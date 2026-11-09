(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SHEXPetState = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const SAFE = Number.MAX_SAFE_INTEGER;
  // This is a numeric safety bound, well beyond normal lifetime progression.
  const LEGACY_MAX_LEVEL = Math.floor(Math.sqrt(SAFE / 10)) - 4;
  // 保持既有等级存档曲线，避免换算或丢失旧进度；实际成长速度由 pet-actions 的照顾经验控制。
  // 存档里带 levelScale: 10 的是新曲线；没有这个标记的是旧存档，读取时按总经验换算一次。
  const LEVEL_SCALE = 10;
  const MAX_LEVEL = Math.floor(LEGACY_MAX_LEVEL / LEVEL_SCALE);
  const MAX_ELAPSED = 8 * 3600000;
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const time = (value, fallback) => finite(value) && value >= 0 ? Math.min(SAFE, Math.floor(value)) : fallback;
  function clamp(value) { return finite(value) ? Math.max(0, Math.min(100, value)) : 0; }
  function requiredExp(level) {
    const normalized = finite(level) ? Math.max(1, Math.min(MAX_LEVEL, Math.floor(level))) : 1;
    return totalFor(normalized + 1) - totalFor(normalized);
  }
  function legacyTotalFor(level) { return 10 * (level - 1) * (level + 4); }
  function totalFor(level) { return level <= 1 ? 0 : legacyTotalFor(level * LEVEL_SCALE); }
  function progression(level, exp) {
    const total = Math.min(SAFE, totalFor(level) + exp);
    let low = level, high = MAX_LEVEL;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (totalFor(middle) <= total) low = middle;
      else high = middle - 1;
    }
    return {level: low, exp: Math.min(requiredExp(low) - 1, Math.max(0, total - totalFor(low)))};
  }
  function createDefault(now) {
    const stamp = time(now, 0);
    return {schemaVersion: 1, levelScale: LEVEL_SCALE, petName: '小糯', level: 1, exp: 0, satiety: 65, mood: 70, intimacy: 10, energy: 80, isSleeping: false, lastSavedAt: stamp, lastTickAt: stamp};
  }
  function sanitize(raw, now) {
    const base = createDefault(now);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;
    const current = raw.levelScale === LEVEL_SCALE;
    const level = finite(raw.level) ? Math.max(1, Math.min(current ? MAX_LEVEL : LEGACY_MAX_LEVEL, Math.floor(raw.level))) : 1;
    const exp = finite(raw.exp) ? Math.max(0, Math.min(SAFE, Math.floor(raw.exp))) : 0;
    // 旧存档：先算出旧曲线下的总经验，再落到新曲线上，已经攒下的经验一点不丢。
    const grown = current ? progression(level, exp) : progression(1, Math.min(SAFE, legacyTotalFor(level) + exp));
    base.level = grown.level; base.exp = grown.exp;
    if (typeof raw.petName === 'string' && raw.petName.trim()) base.petName = raw.petName.trim().slice(0, 24);
    for (const key of ['satiety', 'mood', 'intimacy', 'energy']) if (finite(raw[key])) base[key] = clamp(raw[key]);
    base.isSleeping = raw.isSleeping === true;
    base.lastSavedAt = time(raw.lastSavedAt, base.lastSavedAt);
    base.lastTickAt = time(raw.lastTickAt, base.lastSavedAt);
    return base;
  }
  function addExp(state, amount) {
    const next = sanitize(state, state && state.lastTickAt);
    const reward = finite(amount) ? Math.max(0, Math.min(SAFE, Math.floor(amount))) : 0;
    const grown = progression(next.level, Math.min(SAFE, next.exp + reward));
    next.level = grown.level; next.exp = grown.exp;
    return next;
  }
  function totalExperience(state) {
    const normalized = sanitize(state, state && state.lastTickAt);
    return Math.min(SAFE, totalFor(normalized.level) + normalized.exp);
  }
  function advance(state, now, maxElapsedMs) {
    const next = sanitize(state, now);
    const stamp = time(now, next.lastTickAt);
    const watermark = Math.max(next.lastTickAt, next.lastSavedAt);
    if (stamp <= watermark) { next.lastTickAt = watermark; return next; }
    const cap = finite(maxElapsedMs) ? Math.max(0, Math.min(MAX_ELAPSED, maxElapsedMs)) : MAX_ELAPSED;
    const minutes = Math.min(stamp - watermark, cap) / 60000;
    next.satiety = clamp(next.satiety - minutes * (next.isSleeping ? 0.25 : 0.5));
    if (next.isSleeping) next.energy = clamp(next.energy + minutes * 5);
    else { next.mood = clamp(next.mood - minutes * 0.2); next.energy = clamp(next.energy - minutes * 0.3); }
    // Consume the whole wall-clock window, including time beyond the cap.
    next.lastTickAt = stamp;
    return next;
  }
  function deriveStatus(state, interaction) {
    if (state.isSleeping) return 'sleeping';
    if (['pet', 'feed', 'play'].includes(interaction)) return interaction;
    if (state.satiety < 30) return 'hungry';
    if (state.mood < 30) return 'sad';
    if (state.mood >= 80) return 'happy';
    return 'idle';
  }
  function describe(state) {
    return {
      satiety: state.satiety < 30 ? '肚子有点空空的' : state.satiety >= 80 ? '吃得很满足' : '肚子刚刚好',
      mood: state.mood < 30 ? '今天有点蔫蔫的' : state.mood >= 80 ? '今天特别开心' : '心情还不错',
      intimacy: state.intimacy >= 60 ? '越来越依赖你' : state.intimacy >= 30 ? '已经很喜欢你' : '正在慢慢熟悉你',
      energy: state.energy < 30 ? '已经有点困啦' : state.energy >= 80 ? '精神满满的' : '还能再玩一会儿'
    };
  }
  return {createDefault, sanitize, clamp, requiredExp, addExp, totalExperience, advance, deriveStatus, describe};
}));
