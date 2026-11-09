(function (root, factory) {
  'use strict';
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SHEXPlayBetaAccess = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  // Reuse the pet password, never its previously granted access.
  const PLAY_PREFIX = 'shex_x_play_access_v1:';
  let gateId = 0;

  function create(options) {
    options = options || {};
    const code = typeof options.code === 'string' ? options.code : '';
    const moments = options.feature === 'moments';
    const prefix = moments ? 'shex_x_moments_access_v1:' : PLAY_PREFIX;
    const label = moments ? '朋友圈' : '一起玩';
    const memory = new Set();
    const currentUser = typeof options.currentUser === 'function' ? options.currentUser : () => null;
    let storage = null;
    try { storage = options.storage === undefined ? root.localStorage : options.storage; } catch (_) {}

    function owner(identity) {
      let current = null;
      try { current = currentUser(); } catch (_) { return null; }
      const userId = String(identity?.userId || '');
      return userId && current && String(current.userId || '') === userId ? { userId, isAdmin: current.isAdmin === true } : null;
    }
    function unlocked(identity) {
      const user = owner(identity);
      if (!user) return false;
      if (user.isAdmin || memory.has(user.userId)) return true;
      try { return storage?.getItem(prefix + user.userId) === '1'; } catch (_) { return false; }
    }
    function codeFor(identity) {
      const user = owner(identity);
      return user && !user.isAdmin && unlocked(identity) ? code : '';
    }
    function renderGate(panel, identity, callbacks) {
      if (!panel) return;
      callbacks = callbacks || {};
      // Capture the owner, not the caller's mutable identity object, for stale-form protection.
      const captured = { userId: String(identity?.userId || '') };
      const id = 'playBetaAccess' + (++gateId);
      panel.innerHTML = `
        <section class="play-beta-access-gate calendar-access-gate" aria-labelledby="${id}Title">
          <form class="calendar-access-card" data-play-beta-form>
            <div class="calendar-access-pixels" aria-hidden="true"><i></i><i></i><i></i></div>
            <h1 id="${id}Title">${label}测试中</h1>
            <p>请输入访问码，解锁${label}。</p>
            <label class="calendar-access-field" for="${id}Code">
              <span>访问码</span>
              <input id="${id}Code" type="password" inputmode="numeric" maxlength="6" autocomplete="off" autocapitalize="off" spellcheck="false" aria-describedby="${id}Error" data-play-beta-code>
            </label>
            <p id="${id}Error" class="calendar-access-error" data-play-beta-error aria-live="polite"></p>
            <button type="submit">打开${label}</button>
            <button type="button" class="play-beta-access-back" data-play-beta-back>返回</button>
          </form>
        </section>`;
      const form = panel.querySelector('[data-play-beta-form]');
      const input = panel.querySelector('[data-play-beta-code]');
      const error = panel.querySelector('[data-play-beta-error]');
      const back = panel.querySelector('[data-play-beta-back]');
      let submitted = false;
      form.addEventListener('submit', function (event) {
        event.preventDefault();
        if (submitted) return;
        const user = owner(captured);
        if (!user) {
          input.value = '';
          input.setAttribute('aria-invalid', 'true');
          error.textContent = '登录账号已变化，请返回后重新进入';
          return;
        }
        if (!user.isAdmin && (!code || input.value !== code)) {
          input.setAttribute('aria-invalid', 'true');
          error.textContent = '访问码不对，请再试一次';
          input.focus({ preventScroll: true });
          input.select();
          return;
        }
        if (!user.isAdmin) {
          memory.add(user.userId);
          try { storage?.setItem(prefix + user.userId, '1'); } catch (_) {}
        }
        submitted = true;
        input.value = '';
        input.removeAttribute('aria-invalid');
        error.textContent = '';
        if (typeof callbacks.onUnlock === 'function') callbacks.onUnlock();
      });
      back.addEventListener('click', function () {
        input.value = '';
        if (typeof callbacks.onBack === 'function') callbacks.onBack();
      });
    }
    return Object.freeze({ unlocked, codeFor, renderGate });
  }
  return Object.freeze({ create });
});
