(function initWorldRunCloudClient(global, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.SHEXWorldRunCloudClient = api;
})(typeof window !== 'undefined' ? window : globalThis, function createWorldRunCloudClientModule() {
  'use strict';
  const CLIENT_VERSION = 'world-run-cloud-client-v2-x101-world-chat';
  function clientError(code, message) { return Object.assign(new Error(String(message || '世界体验服务暂时不可用')), { code: String(code || 'WORLD_RUN_FAILED') }); }
  function createClient(options = {}) {
    const getCloudApp = options.getCloudApp;
    const currentUser = options.currentUser;
    const functionName = String(options.functionName || 'shexWorldRun');
    if (typeof getCloudApp !== 'function' || typeof currentUser !== 'function') throw new Error('world run cloud client dependencies are required');
    async function call(functionTarget, action, input = {}, timeout = 120000) {
      const user = currentUser();
      if (!user?.userId || !user?.sessionToken) throw clientError('SESSION_EXPIRED', '登录状态已失效，请重新登录');
      const app = await getCloudApp();
      if (!app?.callFunction) throw clientError('WORLD_RUN_UNAVAILABLE', '世界体验服务暂时不可用');
      let response;
      try {
        response = await app.callFunction({ name: functionTarget, data: { action, ...input, userId: user.userId, sessionToken: user.sessionToken }, timeout });
      } catch (error) {
        const missing = /FUNCTION_NOT_FOUND/i.test(String(error?.code || '') + ' ' + String(error?.message || ''));
        throw clientError(String(error?.code || 'WORLD_RUN_NETWORK_FAILED'), missing ? '世界体验服务尚未部署，请先部署 shexWorldRun' : '世界体验服务连接失败，请稍后重试');
      }
      const result = response?.result || response || {};
      if (!result.ok && !result.success) throw clientError(result.code, result.message || result.detail || '世界体验暂时无法进入');
      return result;
    }
    return Object.freeze({
      enterWorld: input => call(functionName, 'enterWorld', { worldTemplateId: String(input?.worldTemplateId || '') }),
      getWorldRun: input => call(functionName, 'getWorldRun', { worldTemplateId: String(input?.worldTemplateId || '') }),
      upgradeWorldRun: input => call(functionName, 'upgradeWorldRun', {
        worldTemplateId: String(input?.worldTemplateId || ''),
        ...(input?.runId ? { runId:String(input.runId) } : {}),
        ...(input?.worldVersionId ? { worldVersionId:String(input.worldVersionId) } : {}),
      }),
      listMyWorldRuns: input => call(functionName, 'listMyWorldRuns', {
        cursor:input?.cursor ? String(input.cursor) : '',
        ...(input?.limit === undefined ? {} : { limit:Number(input.limit) })
      }),
      detachMyWorldRun: input => call(functionName, 'detachMyWorldRun', {
        worldTemplateId: String(input?.worldTemplateId || ''),
        ...(input?.runId ? { runId:String(input.runId) } : {}),
      }),
      listWorldRunHistory: input => call(functionName, 'listWorldRunHistory', {
        worldTemplateId: String(input?.worldTemplateId || ''),
        ...(input?.runId ? { runId:String(input.runId) } : {}),
        cursor: input?.cursor ? String(input.cursor) : '',
        ...(input?.limit === undefined ? {} : { limit: Number(input.limit) }),
      }),
      generateReply: input => call('shexCharacterAI', 'generateReply', {
        requestKind: 'world_run', worldTemplateId: String(input?.worldTemplateId || ''), runId: String(input?.runId || ''),
        messageId: String(input?.messageId || ''), requestId: String(input?.requestId || ''), messageText: String(input?.messageText || '')
      })
    });
  }
  return Object.freeze({ CLIENT_VERSION, clientError, createClient });
});
