(function initWorldHomeLayout(globalScope, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (globalScope) globalScope.SHEXWorldHomeLayout = api;
})(typeof window !== 'undefined' ? window : globalThis, function createWorldHomeLayout() {
  'use strict';

  const SIMULATOR_ROUTES = Object.freeze(['message', 'energy', 'settings', 'character-gallery']);

  function isWorldSimulator(experience) {
    return String(experience?.sessionKind || '') === 'world_run';
  }

  function plan(experience, availableRoutes = []) {
    if (!isWorldSimulator(experience)) {
      return { mode: 'paged', routes: availableRoutes, paged: true };
    }
    return { mode: 'simulator_grid', routes: [...SIMULATOR_ROUTES], paged: false };
  }

  function apply(panel, experience) {
    if (!panel || !isWorldSimulator(experience)) return plan(experience);
    const viewport = panel.querySelector('.x-world-app-viewport');
    if (!viewport) return { mode: 'missing', routes: [], paged: false };

    const entries = SIMULATOR_ROUTES.map((route) => panel.querySelector(`[data-world-entry="${route}"]`));
    if (entries.some((entry) => !entry)) {
      return { mode: 'incomplete', routes: entries.filter(Boolean).map((entry) => entry.dataset.worldEntry), paged: false };
    }

    const grid = (panel.ownerDocument || document).createElement('div');
    grid.className = 'x-world-actions x-world-simulator-actions';
    grid.setAttribute('aria-label', '世界模拟器功能');
    entries.forEach((entry) => {
      entry.hidden = false;
      grid.appendChild(entry);
    });
    viewport.classList.remove('is-dragging', 'is-animating');
    viewport.classList.add('is-world-simulator-grid');
    viewport.replaceChildren(grid);
    return plan(experience);
  }

  function isComplete(panel, experience, pageCount = 2) {
    const viewport = panel?.querySelector?.('.x-world-app-viewport');
    if (!viewport) return false;
    if (!isWorldSimulator(experience)) {
      // 整页左右滑动后：第一页 APP 仍在应用轨道里，第二页 APP 跟着第二页（.x-world-page-two）走。
      return Boolean(
        viewport.querySelector('.x-world-app-track [data-world-app-page="0"]')
        && panel.querySelector('.x-world-page-two [data-world-app-page="1"]')
        && panel.querySelectorAll('[data-world-app-page]').length === Math.max(2, Number(pageCount) || 2)
      );
    }
    const grid = viewport.querySelector('.x-world-simulator-actions');
    const routes = Array.from(grid?.children || []).map((entry) => String(entry.dataset?.worldEntry || ''));
    return Boolean(
      viewport.classList.contains('is-world-simulator-grid')
      && !viewport.querySelector('.x-world-app-track')
      && viewport.querySelectorAll('[data-world-app-page]').length === 0
      && routes.length === SIMULATOR_ROUTES.length
      && routes.every((route, index) => route === SIMULATOR_ROUTES[index])
    );
  }

  function syncPlayEntry(panel, options = {}) {
    if (!panel) return;
    let entry = panel.querySelector('[data-world-entry="play"]');
    const page = panel.querySelector('[data-world-app-page="1"]');
    const legacyPage = panel.querySelector('[data-world-app-page="2"]');
    if (!options.allowed) { entry?.remove(); legacyPage?.remove(); return; }
    if (!page) return;
    if (!entry) {
      entry = (panel.ownerDocument || document).createElement('button');
      entry.id = 'showPlay';
      entry.type = 'button';
      entry.className = 'x-world-action-tile';
      entry.dataset.worldEntry = 'play';
      entry.innerHTML = '<span class="x-world-action-icon" aria-hidden="true"><svg viewBox="0 0 20 20" fill="currentColor" shape-rendering="crispEdges" aria-hidden="true"><path d="M5 4h10v2h3v10h-5v-2H7v2H2V6h3ZM5 8v2H3v2h2v2h2v-2h2v-2H7V8ZM13 9h2v2h-2ZM15 12h2v2h-2Z" fill-rule="evenodd"/></svg></span><span>一起玩</span>';
      entry.addEventListener('click', () => entry.__playOpen?.());
    }
    const gallery = page.querySelector('[data-world-entry="character-gallery"]');
    if (gallery && gallery.nextElementSibling !== entry) page.insertBefore(entry, gallery.nextElementSibling);
    else if (!gallery && entry.parentElement !== page) page.appendChild(entry);
    legacyPage?.remove();
    entry.__playOpen = options.onOpen;
  }

  return Object.freeze({ SIMULATOR_ROUTES, plan, apply, isComplete, syncPlayEntry });
});
