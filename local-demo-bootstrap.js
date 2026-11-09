(function bootstrapLocalChatDemo() {
  // ?resetData=1：一键清空本机的 X世界演示数据。
  // 只动当前浏览器里的 localStorage / sessionStorage / IndexedDB，
  // 不触碰线上站点，也不会写入或删除云端数据库。
  if (new URLSearchParams(window.location.search).get('resetData') === '1') {
    try {
      Object.keys(localStorage).filter((key) => /^shex/i.test(key)).forEach((key) => localStorage.removeItem(key));
      Object.keys(sessionStorage).filter((key) => /^shex/i.test(key)).forEach((key) => sessionStorage.removeItem(key));
    } catch (_) {}
    try {
      const list = indexedDB.databases ? indexedDB.databases() : Promise.resolve([]);
      list
        .then((databases) => Promise.all((databases || [])
          .filter((db) => /shex/i.test(db.name || ''))
          .map((db) => new Promise((resolve) => {
            const request = indexedDB.deleteDatabase(db.name);
            request.onsuccess = request.onerror = request.onblocked = () => resolve();
          }))))
        .catch(() => {});
    } catch (_) {}
    const next = new URL(window.location.href);
    next.searchParams.delete('resetData');
    // 立即跳转，避免其它脚本在清空数据后抢先把人送去登录页。
    window.location.replace(next.toString());
    return;
  }

  const isLocalHost = /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname);
  const query = new URLSearchParams(window.location.search);
  const isAuthPage = /auth\.html$/i.test(window.location.pathname);

  // 免登录：除登录页外，首次进入自动创建本地访客身份。
  // 已有真实会话时绝不覆盖；访客数据按 userId 存在本机，换浏览器会重新生成。
  if (!isAuthPage) {
    try {
      const rawSession = localStorage.getItem('shex_auth_session_v1');
      const existing = rawSession ? JSON.parse(rawSession) : null;
      if (!existing || !existing.userId || !existing.sessionToken) {
        const guestKey = 'shex_guest_id_v1';
        let guestId = localStorage.getItem(guestKey);
        if (!guestId) {
          guestId = `guest_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
          localStorage.setItem(guestKey, guestId);
        }
        localStorage.setItem('shex_auth_session_v1', JSON.stringify({
          userId: guestId,
          username: '旅人',
          displayName: '旅人',
          sessionToken: 'guest-local',
          guest: true,
          isAdmin: false
        }));
      }
    } catch (_) {
      // 隐私模式 / 存储不可用时保持未登录，页面仍可浏览公开内容。
    }
  }

  // 免登录 guest 自动获得默认身份（秦梧 / 你），避免卡在身份设置页。
  // 真实账号自己设置的名字不受影响；用户手动改过身份也不覆盖。
  try {
    const rawSession2 = localStorage.getItem('shex_auth_session_v1');
    const session2 = rawSession2 ? JSON.parse(rawSession2) : null;
    if (session2 && session2.guest) {
      const identityKey = 'shex_x_link_identity';
      if (!localStorage.getItem(identityKey)) {
        localStorage.setItem(identityKey, JSON.stringify({
          dreamId: '',
          taName: '秦梧',
          userCode: '你',
          taAvatar: '',
          userAvatar: ''
        }));
      }
      const disclaimerKey = 'shex_x_link_disclaimer_v1';
      if (!localStorage.getItem(disclaimerKey)) {
        localStorage.setItem(disclaimerKey, JSON.stringify({
          xLinkDisclaimerRead: true,
          xLinkDisclaimerAgreed: true,
          xLinkDisclaimerAgreedAt: new Date().toISOString()
        }));
      }
    }
  } catch (_) {}

  // 免登录演示统一使用「秦梧 / 你」这两个称呼。
  // 只改本机访客数据，真实账号自己设置的名字不受影响。
  try {
    const rawSession = localStorage.getItem('shex_auth_session_v1');
    const session = rawSession ? JSON.parse(rawSession) : null;
    if (session && session.guest) {
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (!key || !/^shex/i.test(key)) continue;
        const raw = localStorage.getItem(key) || '';
        if (!raw.includes('祁煜') && !raw.includes('小蛇') && !raw.includes('"TA"')) continue;
        let data;
        try { data = JSON.parse(raw); } catch (_) { continue; }
        let changed = false;
        const walk = (node) => {
          if (Array.isArray(node)) { node.forEach(walk); return; }
          if (!node || typeof node !== 'object') return;
          ['taName', 'userNickname', 'userCall', 'name', 'displayName'].forEach((field) => {
            const value = node[field];
            if (value === '祁煜' || value === 'TA') {
              node[field] = '秦梧';
              changed = true;
            } else if (value === '小蛇') {
              node[field] = '你';
              changed = true;
            }
          });
          Object.keys(node).forEach((field) => walk(node[field]));
        };
        walk(data);
        if (changed) localStorage.setItem(key, JSON.stringify(data));
      }
    }
  } catch (_) {}

  // ?demoChat=1 仅用于本地与临时预览域名，生产环境不开放演示身份。
  const isPreviewHost = isLocalHost || /\.(pinggy-free\.link|free\.pinggy\.net|lhr\.life|github\.io)$/i.test(window.location.hostname) || /\.remote-agent\.svc\.cluster\.local$/i.test(window.location.hostname);
  if (!isPreviewHost || query.get('demoChat') !== '1') return;
  const ordinaryUserPreview = query.get('demoUser') === '1';

  sessionStorage.removeItem('shex_auth_expired_v1');
  // 演示模式：预置署名与免责声明，避免预览时还要手动填表。
  try {
    if (!localStorage.getItem('shex_x_link_identity')) {
      localStorage.setItem('shex_x_link_identity', JSON.stringify({
        dreamId: '',
        taName: '秦梧',
        userCode: '你',
        taAvatar: '',
        userAvatar: ''
      }));
    }
    localStorage.setItem('shex_x_link_disclaimer_v1', JSON.stringify({
      xLinkDisclaimerRead: true,
      xLinkDisclaimerAgreed: true,
      xLinkDisclaimerAgreedAt: new Date().toISOString()
    }));
  } catch (_) {}
  localStorage.setItem('shex_auth_session_v1', JSON.stringify(ordinaryUserPreview ? {
    userId: 'local-demo-ordinary-user',
    username: '普通用户演示',
    displayName: '普通用户演示',
    sessionToken: 'local-plan-preview',
    guest: true,
    isAdmin: false
  } : {
    userId: 'shex_fee7aa44-4790-47fc-a89c-fb6f886a6714',
    username: '创世神414',
    displayName: '创世神414',
    sessionToken: 'local-plan-preview',
    guest: true,
    isAdmin: true
  }));

  const requestedThreadCount = Math.min(2000, Math.max(0, Number.parseInt(query.get('demoAdminThreads') || '0', 10) || 0));
  if (requestedThreadCount) {
    const dreams = [];
    const singleChats = {};
    const now = Date.now();
    for (let index = 0; index < requestedThreadCount; index += 1) {
      const id = `local-admin-thread-${index + 1}`;
      dreams.push({
        id,
        name: `会话联系人 ${String(index + 1).padStart(4, '0')}`,
        nickname: `会话联系人 ${String(index + 1).padStart(4, '0')}`,
        userNickname: '管理员',
        userCall: '管理员',
        avatar: '',
        createdAt: now - index * 60000,
        updatedAt: now - index * 60000
      });
      singleChats[id] = [{
        id: `local-admin-message-${index + 1}`,
        role: 'ta',
        text: `这是第 ${index + 1} 个会话的最后一条消息`,
        time: now - index * 60000
      }];
    }
    const demoState = JSON.stringify({
      userName: '管理员',
      currentDreamId: dreams[0]?.id || '',
      dreams,
      singleChats,
      groups: [],
      groupChats: {},
      letters: {},
      replies: {},
      companions: {},
      migratedFromSingle: true
    });
    localStorage.setItem('shex_x_multi_state_v1', demoState);
    localStorage.setItem('shex_user:shex_fee7aa44-4790-47fc-a89c-fb6f886a6714:shex_x_multi_state_v1', demoState);
  }
}());
