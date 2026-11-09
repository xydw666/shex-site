((root, factory) => {
  const api = factory(root || {});
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SHEXXLettersUploadQueue = api;
})(typeof window !== 'undefined' ? window : globalThis, root => {
  'use strict';
  function changed() { return Object.assign(new Error('账号已切换，旧上传已停止'), { code: 'ACCOUNT_CHANGED' }); }
  function createQueue(options = {}) {
    const api = options.api || root.SHEXXLettersAPI;
    const storage = options.storage || root.SHEXCloudStorage;
    const currentUser = options.currentUser || (() => root.SHEXAuth?.current?.());
    const currentDream = options.currentDream || (() => null);
    let generation = 0;
    const active = new Map();
    function onAccountChange() { generation += 1; active.clear(); }
    async function upload(file, input = {}) {
      const userId = currentUser()?.userId;
      const dreamId = input.dreamId || currentDream();
      if (!userId || !dreamId || !file || !input.requestId) throw new Error('上传缺少账号、梦角、文件或 requestId');
      const epoch = generation;
      const check = () => { if (epoch !== generation || currentUser()?.userId !== userId) throw changed(); };
      const key = JSON.stringify([userId, dreamId, input.requestId]);
      if (active.has(key)) return active.get(key);
      const ownerPrefix = JSON.stringify([userId, dreamId]).slice(0, -1) + ',';
      if ([...active.keys()].filter(activeKey => activeKey.startsWith(ownerPrefix)).length >= 50) {
        throw new Error('同一账号和梦角最多有 50 个待上传任务');
      }
      const job = (async () => {
        const begin = await api.beginAttachment({ dreamId, requestId: input.requestId, mime: file.type, size: file.size, fileName: file.name });
        check();
        if (!begin?.attachmentId || !begin?.cloudPath) throw new Error('云端没有分配附件路径');
        const asset = await storage.uploadFile(file, 'x-letters', { cloudPath: begin.cloudPath, allowLocalFallback: false });
        check();
        const fileID = String(asset?.fileID || asset?.fileId || '');
        if (!/^cloud:\/\/[^/]+\/.+/.test(fileID) || asset?.cloudPath !== begin.cloudPath || fileID.split('/').slice(3).join('/') !== begin.cloudPath || /^data:|^blob:/i.test(String(asset?.url || ''))) {
          throw new Error('上传未返回匹配的云文件引用');
        }
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(asset.type)
          || !Number.isInteger(asset.size) || asset.size < 1 || asset.size > file.size) {
          throw new Error('上传文件 MIME 类型或大小与附件申请不一致');
        }
        const complete = await api.completeAttachment({ dreamId, requestId: `${input.requestId}:complete`, attachmentId: begin.attachmentId,
          cloudPath: begin.cloudPath, fileID, mime: asset.type, size: asset.size });
        check();
        if (options.currentDream && currentDream() !== dreamId) throw Object.assign(new Error('梦角已切换，附件已归属原梦角'), { code: 'DREAM_CHANGED' });
        return complete;
      })();
      active.set(key, job);
      try { return await job; } finally { if (active.get(key) === job) active.delete(key); }
    }
    return Object.freeze({ upload, onAccountChange });
  }
  return Object.freeze({ createQueue });
});
