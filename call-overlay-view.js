(() => {
  'use strict';
  const previousFocus = new WeakMap();
  function ensure() {
    let overlay = document.querySelector('#xCallOverlay');
    if (overlay?.tagName === 'DIALOG' && overlay.dataset.callClosing !== 'true') return overlay;
    const next = document.createElement('dialog');
    next.id = 'xCallOverlay'; next.className = 'x-call-overlay';
    next.setAttribute('aria-label', '通话');
    next.setAttribute('aria-modal', 'true');
    // Accept/reject is explicit; Escape must not leave a ringtone running.
    next.addEventListener('cancel', event => event.preventDefault());
    if (overlay) overlay.replaceWith(next); else document.body.appendChild(next);
    return next;
  }
  function isVisible(overlay) {
    if (!overlay?.isConnected || !overlay.classList.contains('show')) return false;
    const box = overlay.getBoundingClientRect();
    if (box.width < 1 || box.height < 1) return false;
    const buttons = [...overlay.querySelectorAll('button')].filter(button => !button.disabled);
    return buttons.length > 0 && buttons.every(button => {
      const rect = button.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return false;
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return hit === button || button.contains(hit);
    });
  }
  function present(overlay) {
    if (!overlay) return false;
    if (!overlay.isConnected) document.body.appendChild(overlay);
    if (!previousFocus.has(overlay)) previousFocus.set(overlay, document.activeElement);
    delete overlay.dataset.callClosing;
    overlay.classList.add('show');
    overlay.style.zIndex = '2147483647';
    if (typeof overlay.showModal === 'function') {
      try { if (!overlay.open) overlay.showModal(); }
      catch (_) { overlay.setAttribute('open', ''); }
    } else overlay.setAttribute('open', '');
    const visible = isVisible(overlay);
    if (!visible) { dismiss(overlay); return false; }
    if (visible) overlay.querySelector('.x-call-action-accept, button')?.focus({ preventScroll: true });
    return visible;
  }
  function dismiss(overlay) {
    if (!overlay) return;
    overlay.dataset.callClosing = 'true';
    overlay.classList.remove('show');
    if (overlay.open && typeof overlay.close === 'function') overlay.close();
    overlay.removeAttribute('open');
    const focus = previousFocus.get(overlay);
    previousFocus.delete(overlay);
    if (focus?.isConnected) focus.focus?.({ preventScroll: true });
  }
  let currentWidget = null;
  let widgetObserver = null;
  let modalOrder = [];
  const isModal = dialog => {
    try { return dialog.matches(':modal'); } catch (_) { return dialog.open === true; }
  };
  const modals = () => [...document.querySelectorAll('dialog[open]')].filter(isModal);
  function syncWidget() {
    const widget = currentWidget;
    if (!widget?.classList.contains('show')) return;
    modalOrder = modalOrder.filter(dialog => dialog.isConnected && isModal(dialog));
    const focused = document.activeElement?.closest('dialog');
    const focusedDialog = focused && isModal(focused) ? focused : null;
    const host = focusedDialog || modalOrder[modalOrder.length - 1] || document.body;
    if (widget.parentElement !== host) host.appendChild(widget);
    widget.style.zIndex = '2147483647';
    // A popover ignores transformed ancestors. Its DOM parent must still be
    // the active modal, otherwise the browser makes it inert and untappable.
    if (typeof widget.showPopover === 'function') {
      widget.setAttribute('popover', 'manual');
      try { if (!widget.matches(':popover-open')) widget.showPopover(); }
      catch (_) { widget.removeAttribute('popover'); }
    }
  }
  function presentWidget(widget) {
    currentWidget = widget;
    modalOrder = modals();
    if (!widgetObserver) {
      widgetObserver = new MutationObserver(records => {
        let changed = false;
        for (const record of records) {
          if (record.type === 'attributes' && record.target.tagName === 'DIALOG') {
            modalOrder = modalOrder.filter(dialog => dialog !== record.target);
            if (isModal(record.target)) modalOrder.push(record.target);
            changed = true;
          } else if (record.type === 'childList') {
            for (const node of [...record.addedNodes, ...record.removedNodes]) {
              if (node.nodeType !== 1) continue;
              if (node === currentWidget || node.contains(currentWidget) || node.matches('dialog') || node.querySelector('dialog')) changed = true;
            }
          }
        }
        if (changed) syncWidget();
      });
      widgetObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['open'] });
    }
    syncWidget();
  }
  function dismissWidget(widget) {
    widgetObserver?.disconnect(); widgetObserver = null;
    currentWidget = null; modalOrder = [];
    if (typeof widget?.hidePopover === 'function') {
      try { if (widget.matches(':popover-open')) widget.hidePopover(); } catch (_) { /* Already removed. */ }
    }
    widget?.removeAttribute('popover');
    if (widget && widget.parentElement !== document.body) document.body.appendChild(widget);
  }
  window.SHEXCallOverlayView = { ensure, present, dismiss, isVisible, presentWidget, dismissWidget };
})();
