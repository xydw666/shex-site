(function installLocalDemoChatStoreSeed() {
  const isLocalHost = /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname);
  const query = new URLSearchParams(window.location.search);
  if (!isLocalHost || query.get('demoChat') !== '1') return;

  const seed = () => {
    const demo = window.SHEXLocalDemoChat;
    const store = window.SHEXChatLocalStore;
    if (!demo?.ownerId || !demo?.dreamId || !Array.isArray(demo.messages) || !store?.persistDiff) return;

    void store.persistDiff({}, {
      singleChats: { [demo.dreamId]: demo.messages },
      groupChats: {}
    }, demo.ownerId, { deleteMissing: false }).then(() => {
      const reloadKey = `shex_local_demo_chat_loaded:${demo.ownerId}:${demo.dreamId}`;
      if (sessionStorage.getItem(reloadKey) === '1') return;
      sessionStorage.setItem(reloadKey, '1');
      window.location.reload();
    }).catch((error) => {
      console.warn('[SHEX_LOCAL_DEMO_CHAT] 本机演示消息写入失败', error?.message || error);
    });
  };

  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', seed, { once: true });
  else seed();
}());
