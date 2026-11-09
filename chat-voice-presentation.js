(() => {
  'use strict';
  // Presentation only: never persist message content, request speech or charge energy.
  const collapsed = new Map();
  const pendingColorSync = new WeakSet();
  const remember = (key, value) => {
    collapsed.delete(key);
    collapsed.set(key, value);
    while (collapsed.size > 500) collapsed.delete(collapsed.keys().next().value);
  };
  const messageRoot = node => node.closest('.x-voice-message') || node.querySelector(':scope > .x-voice-message') || node.closest('.x-ai-message-stack') || node.closest('.ix-bubble') || node;
  function syncColors(root, controls) {
    const source = root.matches('.ix-bubble') ? root : root.querySelector('.x-voice-transcript.ix-bubble, .x-voice-transcript .ix-bubble');
    if (!source || !controls) return;
    // Only the voice row copies variables, so the text never inherits stale colors.
    for (const property of [...controls.style]) if (property.startsWith('--')) controls.style.removeProperty(property);
    for (const property of source.style) if (property.startsWith('--')) controls.style.setProperty(property, source.style.getPropertyValue(property));
    if (!source.isConnected) {
      // Decoration happens before insertion. Resolve selector-based themes once
      // the message has joined the document, without a document-wide observer.
      if (!pendingColorSync.has(controls)) {
        pendingColorSync.add(controls);
        requestAnimationFrame(() => {
          pendingColorSync.delete(controls);
          if (controls.isConnected) syncColors(messageRoot(controls), controls);
        });
      }
      return;
    }
    // The native appearance and free component themes can scope variables or
    // direct CSS to .ix-bubble. Copy its resolved paint, including color alpha;
    // ancestor opacity already applies to both siblings and must not be copied.
    const paint = getComputedStyle(source);
    controls.style.setProperty('--x-voice-bubble-bg', paint.background);
    controls.style.setProperty('--x-voice-bubble-fg', paint.color);
  }
  // AI模式语音：开头的场景/动作描写先发生，显示在语音条上方；头像随语音条对齐。
  function placeLeadScenes(root, controls) {
    if (!root.classList.contains('x-voice-message') || !controls || controls.parentElement !== root) return;
    const stack = root.querySelector(':scope > .x-ai-message-stack');
    const lead = [];
    for (let child = stack?.firstElementChild; child?.classList.contains('x-ai-scene-transition'); child = child.nextElementSibling) lead.push(child);
    if (lead.length) {
      root.querySelectorAll(':scope > .x-voice-lead-scene').forEach(old => old.remove());
      lead.forEach(scene => { scene.classList.add('x-voice-lead-scene'); root.insertBefore(scene, controls); });
    }
    const hasLead = Boolean(root.querySelector(':scope > .x-voice-lead-scene'));
    root.classList.toggle('has-lead-scene', hasLead);
    if (hasLead) root.querySelectorAll(':scope > .ix-avatar, :scope > .x-cloud-image-retry.is-avatar-retry').forEach(item => controls.prepend(item));
  }
  function syncRoot(node) {
    if (!node) return;
    const root = messageRoot(node);
    const controls = root.querySelector('.x-message-voice-controls');
    placeLeadScenes(root, controls);
    syncColors(root, controls);
    const isCollapsed = Boolean(controls && collapsed.get(controls.dataset.voicePresentationKey));
    // A primary bubble is mounted before it is wrapped in an AI segment stack.
    // Once wrapped, the stack owns visibility for every segment.
    root.querySelectorAll('.x-voice-text-collapsed').forEach(child => child.classList.remove('x-voice-text-collapsed'));
    root.classList.toggle('x-voice-text-collapsed', isCollapsed);
    root.querySelectorAll('.x-voice-text-toggle').forEach(toggle => {
      toggle.textContent = isCollapsed ? '查看文字' : '收起文字';
      toggle.setAttribute('aria-expanded', String(!isCollapsed));
    });
    window.SHEXVoiceBridge?.scheduleMessageLayout?.(root);
  }
  function paintButton(button, kind, label, icon) {
    if (!button.classList.contains('x-message-voice-bar')) return false;
    button.dataset.voiceKind = kind;
    let glyph = button.querySelector('.x-voice-glyph');
    if (!glyph) {
      glyph = document.createElement('span'); glyph.className = 'x-voice-glyph';
      const caption = document.createElement('span'); caption.className = 'x-voice-caption';
      button.replaceChildren(glyph, caption);
    }
    glyph.innerHTML = kind === 'loading' ? icon
      : '<svg class="x-voice-signal" viewBox="0 0 24 24" aria-hidden="true"><path class="x-voice-wave" d="M6 10c1.2 1.1 1.2 2.9 0 4"/><path class="x-voice-wave" d="M10 7c2.7 2.8 2.7 7.2 0 10"/><path class="x-voice-wave" d="M14 4c4.2 4.4 4.2 11.6 0 16"/></svg>';
    const duration = Number(button.dataset.voiceDuration || 0);
    button.querySelector('.x-voice-caption').textContent = kind === 'loading' ? label.replace('语音', '')
      : duration > 0 ? `${Math.ceil(duration)}″`
        : label.startsWith('生成语音') ? '生成'
          : label === '重新生成语音' ? '重试' : '';
    return true;
  }
  function setDuration(button, duration) {
    if (!button?.classList.contains('x-message-voice-bar') || !Number.isFinite(duration) || duration <= 0) return;
    button.dataset.voiceDuration = String(duration);
    const kind = button.dataset.voiceKind;
    if (kind !== 'loading') button.querySelector('.x-voice-caption').textContent = `${Math.ceil(duration)}″`;
  }
  function mount(bubble, controls) {
    bubble.append(controls);
    syncRoot(bubble);
  }
  function wrapMessage(node) {
    if (!node || node.classList.contains('x-voice-message')) return node;
    const controls = node.querySelector('.x-message-voice-controls');
    if (!controls) return node;
    // Keep the native text bubble intact. Only a transparent message container
    // joins the independent voice bubble and the existing text/segment bubbles.
    const root = document.createElement('div');
    root.className = 'x-voice-message';
    root.dataset.id = String(node.dataset.id || controls.dataset.voiceMessageId || '');
    delete node.dataset.id;
    const firstBubble = node.matches('.ix-bubble') ? node : node.querySelector('.ix-bubble');
    if (firstBubble) {
      const avatar = firstBubble.querySelector(':scope > .ix-avatar');
      if (avatar) { root.append(avatar); root.classList.add('has-avatar'); }
      const avatarRetry = firstBubble.querySelector(':scope > .x-cloud-image-retry.is-avatar-retry');
      if (avatarRetry) root.append(avatarRetry);
      firstBubble.classList.add('has-avatar');
    }
    node.classList.add('x-voice-transcript');
    root.append(controls, node);
    syncRoot(root);
    return root;
  }
  function addTextToggle(controls, key) {
    controls.dataset.voicePresentationKey = key;
    const toggle = document.createElement('button');
    toggle.type = 'button'; toggle.className = 'x-voice-text-toggle';
    toggle.textContent = collapsed.get(key) ? '查看文字' : '收起文字';
    toggle.setAttribute('aria-expanded', String(!collapsed.get(key)));
    toggle.addEventListener('click', event => {
      event.stopPropagation();
      const mounted = event.currentTarget.closest('.x-message-voice-controls');
      const currentKey = mounted.dataset.voicePresentationKey;
      remember(currentKey, !collapsed.get(currentKey));
      syncRoot(mounted);
    });
    controls.append(toggle);
  }
  window.SHEXChatVoicePresentation = { paintButton, setDuration, addTextToggle, mount, wrapMessage, syncRoot };
})();
