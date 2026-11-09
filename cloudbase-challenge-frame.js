/*
 * CloudBase 人机验证回调页守卫（auth.html 与 index.html 共用，必须是页面里第一个脚本）。
 *
 * CloudBase JS SDK 2.9.0 的风控验证在一个 iframe 里完成：验证通过后，CloudBase 把这个 iframe
 * 重定向回「当前页面地址?__captcha=on&captcha_token=...」，外层页面的 SDK 只在 iframe 的 load 事件里
 * 读取它的地址栏拿到 captcha_token，然后继续原来的请求（发邮箱验证码 / 注册 / 绑定邮箱）。
 *
 * 所以这个 iframe 里的页面只是一个“回调地址”，绝不能再启动一份 SHE.X 应用：它和外层页面同源，
 * 共享 localStorage / sessionStorage，启动后会重复恢复会话、抢删外层的邮箱验证锁、
 * 甚至把 CloudBase 身份重置成匿名，打断外层正在进行的注册或绑定。
 *
 * 做法：只在「位于 iframe 内」且「地址带 __captcha=on」时，打标记，并向解析器写入一个隐藏的
 * <plaintext>：HTML 解析器会把它之后的全部内容当作纯文本，后续所有脚本（同步 / defer / 内联）都不会执行，
 * 而文档照常加载完成、iframe 的 load 事件照常触发，外层 SDK 仍能读到地址。
 * 注意不能用 window.stop()：实测 Chromium 中它会让 iframe 的 load 事件不再触发，SDK 会一直等下去。
 * 顶层直接打开同一地址、或普通 iframe，均不受影响。
 */
(function guardCloudBaseChallengeCallbackFrame(global) {
  'use strict';
  var framed = true;
  try { framed = global.self !== global.top; } catch (_) { framed = true; }
  var search = '';
  try { search = String(global.location && global.location.search || ''); } catch (_) { search = ''; }
  if (!framed || !/[?&]__captcha=on(?:&|$)/.test(search)) return;
  global.SHEX_CLOUDBASE_CHALLENGE_CALLBACK_FRAME = true;
  try {
    global.document.write('<plaintext hidden style="display:none">');
  } catch (_) { /* 仍有 cloudbase-client / user-data / auth.js 的二层守卫 */ }
})(window);
