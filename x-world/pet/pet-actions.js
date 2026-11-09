(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./pet-state.js'));
  else root.SHEXPetActions = factory(root.SHEXPetState);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (stateApi) {
  'use strict';
  const rules = {
    pet: {cooldown: 1200, duration: 2200, exp: 6, mood: 8, intimacy: 3},
    feed: {cooldown: 2000, duration: 3000, exp: 10, satiety: 22, mood: 4, intimacy: 1},
    play: {cooldown: 2500, duration: 2800, exp: 16, mood: 14, intimacy: 4, energy: -12, satiety: -6},
    sleep: {cooldown: 700, duration: 0, exp: 0}
  };
  const labels = {satiety: '饱食', mood: '心情', intimacy: '亲密', energy: '精力'};
  const experienceRates = {user:5, dream:5};
  function createActions() {
    const last = Object.create(null);
    function perform(kind, state, now, options = {}) {
      const before = stateApi.sanitize(state, state && state.lastTickAt);
      function refused(message) { return {state: before, ok: false, kind, message, detail: '', duration: 0, leveledUp: false}; }
      if (!Object.prototype.hasOwnProperty.call(rules, kind)) return refused('这个物件还不能互动');
      if (typeof now !== 'number' || !Number.isFinite(now) || now < 0) return refused('稍等一下再试试吧');
      if (before.isSleeping && kind !== 'sleep') return refused(before.petName + '正在睡觉，先叫醒它吧');
      const rule = rules[kind];
      if (last[kind] !== undefined && now - last[kind] < rule.cooldown) return refused('稍等一下，让' + before.petName + '缓一缓吧');
      if (kind === 'feed' && before.satiety >= 95) return refused(before.petName + '已经吃得饱饱的啦');
      if (kind === 'play' && before.energy < 15) return refused(before.petName + '有点累啦，让它休息一会儿吧');
      let next = {...before}, expGained = 0;
      const changes = [];
      if (kind === 'sleep') next.isSleeping = !before.isSleeping;
      else {
        for (const key of ['satiety', 'mood', 'intimacy', 'energy']) {
          if (!rule[key]) continue;
          next[key] = stateApi.clamp(before[key] + rule[key]);
          const delta = Math.round((next[key] - before[key]) * 100) / 100;
          if (delta) changes.push(labels[key] + ' ' + (delta > 0 ? '+' : '') + delta);
        }
        // Keep existing saves and unlock thresholds; all effective care earns five times the original reward.
        next = stateApi.addExp(next, rule.exp * experienceRates[options.actor === 'dream' ? 'dream' : 'user']);
        expGained = stateApi.totalExperience(next) - stateApi.totalExperience(before);
        changes.push('EXP +' + expGained);
      }
      last[kind] = now;
      const name = next.petName;
      const message = kind === 'pet' ? name + '很喜欢你摸它' : kind === 'feed' ? name + '开始认真吃饭了' : kind === 'play' ? name + '玩得特别开心' : next.isSleeping ? name + '窝进小床，准备睡觉啦' : name + '醒来啦';
      return {state: next, ok: true, kind, message, detail: changes.join(' · '), duration: rule.duration, expGained, leveledUp: next.level > before.level};
    }
    return {perform};
  }
  return {createActions};
}));
