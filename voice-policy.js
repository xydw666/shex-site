(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SHEXVoicePolicy = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function prepareSpeechText(value, normalize) {
    const source = String(value || '').normalize('NFKC')
      .replace(/<\|[^<>\r\n]{1,100}\|>/g, '')
      .replace(/\[(?:long\s+pause|pause|break|male|female|speaker\s*:?\s*\d+|whispering|laughing|sighing|crying|moaning)\]/gi, '')
      .replace(/(^|[^\p{L}\p{N}])(?:owo|uwu|xd)(?=$|[^\p{L}\p{N}])/giu, '$1');
    const text = normalize(source);
    return /[\p{Script=Han}\p{Script=Latin}]/u.test(text) ? text : '';
  }

  // Stable public categories. Raw provider codes and stages stay in diagnostic logs.
  const failures = Object.freeze({
    VOICE_TEXT_EMPTY: ['V001', '没有可朗读内容'],
    VOICE_TEXT_TOO_LONG: ['V002', '文字过长，暂不能生成语音'],
    INVALID_TTS_PARAMS: ['V003', '语音参数不完整，请重新打开后重试'],
    VOICE_MODEL_NOT_READY: ['V101', '当前梦角没有可用音色，请到声音设置中检查'],
    VOICE_VERSION_CHANGED: ['V102', '声音已变化，请重新打开后重试'],
    FISH_PUBLIC_VOICE_NOT_FOUND: ['V103', '绑定的音色不存在，请检查声音设置'],
    FISH_MODEL_ID_MISSING: ['V104', '声音服务未返回音色编号，请稍后重试'],
    FISH_PUBLIC_VOICE_NOT_READY: ['V105', '音色尚未就绪，请稍后重试'],
    FISH_PUBLIC_VOICE_MISMATCH: ['V106', '音色信息不一致，请检查声音设置'],
    FISH_PUBLIC_VOICE_NOT_TTS: ['V107', '这个模型不能用于朗读，请重新选择音色'],
    FISH_VOICE_NOT_PUBLIC: ['V108', '这个音色不可公开使用，请重新选择'],
    INVALID_REFERENCE_ID: ['V109', '音色编号无效，请检查声音设置'],
    FISH_PUBLIC_VOICE_LINK_INVALID: ['V110', '音色链接无效，请重新复制'],
    FISH_PUBLIC_VOICE_ID_INVALID: ['V111', '音色编号格式不正确，请重新复制'],
    VOICE_MODEL_IN_PROGRESS: ['V112', '声音仍在处理中，请稍后查看或重试'],
    VOICE_PENDING_NOT_FOUND: ['V113', '没有待绑定声音，请检查声音设置'],
    VOICE_PENDING_INVALID: ['V114', '待绑定声音记录不完整，请联系管理员'],
    VOICE_PENDING_CHANGED: ['V115', '待绑定声音已变化，请刷新后重试'],
    VOICE_DELETE_INCOMPLETE: ['V116', '声音尚未完整删除，请稍后重试'],
    SESSION_EXPIRED: ['V201', '登录已过期，请重新登录后重试'],
    DREAM_NOT_FOUND: ['V202', '当前梦角不可用，请重新打开聊天'],
    ENERGY_NOT_ENOUGH: ['V203', 'X能量不足，可以等待恢复或前往充值'],
    VOICE_RATE_LIMITED: ['V204', '语音请求较多，请稍后再点播放'],
    REQUEST_CONFLICT: ['V205', '语音请求内容不一致，请重新打开后重试'],
    REQUEST_ID_REQUIRED: ['V206', '语音请求编号缺失，请重新打开后重试'],
    PLAN_CHECK_FAILED: ['V207', '账号状态暂时无法确认，请稍后重试'],
    ENERGY_CHECK_FAILED: ['V208', 'X能量状态暂不可用，请稍后重试'],
    ENERGY_CONSUME_FAILED: ['V209', '语音结算未完成，请点播放重试'],
    VOICE_ADMIN_ONLY: ['V210', '此操作需要管理员权限'],
    VOICE_CONSENT_REQUIRED: ['V211', '请先确认拥有声音素材的使用权限'],
    FISH_NETWORK_FAILED: ['V301', '语音连接中断，请点播放重试'],
    FISH_TIMEOUT: ['V302', '语音生成超时，请点播放重试'],
    GATEWAY_NOT_CONFIGURED: ['V303', '声音服务尚未配置，请联系管理员'],
    FISH_REQUEST_FAILED: ['V304', '声音服务暂时不可用，请点播放重试'],
    FISH_CREDIT_NOT_ENOUGH: ['V305', '声音服务额度不足，请联系管理员'],
    FISH_EMPTY_AUDIO: ['V306', '声音服务返回空音频，请点播放重试'],
    GATEWAY_MODEL_MISMATCH: ['V307', '声音模型配置不一致，请联系管理员'],
    UPSTREAM_TIMEOUT: ['V308', '声音服务响应超时，请点播放重试'],
    GATEWAY_UNAUTHORIZED: ['V309', '声音网关认证失败，请联系管理员'],
    GATEWAY_URL_INVALID: ['V310', '声音网关地址配置异常，请联系管理员'],
    GATEWAY_REQUEST_FAILED: ['V311', '声音网关暂时不可用，请点播放重试'],
    FISH_NOT_CONFIGURED: ['V312', '声音服务尚未配置，请联系管理员'],
    TEMPLATE_VOICE_BINDING_NOT_CONFIGURED: ['V313', '角色音色绑定尚未配置，请联系管理员'],
    VOICE_AUDIO_UPLOAD_FAILED: ['V401', '语音已生成，但保存失败，请点播放重试'],
    CLOUD_FILE_TEMP_URL_UNAVAILABLE: ['V402', '语音链接暂不可用，请点播放重试'],
    VOICE_AUDIO_PLAYBACK_FAILED: ['V403', '音频加载失败，请点播放重试'],
    VOICE_PLAYBACK_BLOCKED: ['V404', '浏览器阻止了播放，请再点一次播放'],
    VOICE_AUDIO_COPY_FAILED: ['V405', '语音长期保存失败，请点播放重试'],
    VOICE_AUDIO_MISSING: ['V406', '没有收到可用音频，请点播放重试'],
    VOICE_SOURCE_REQUIRED: ['V407', '请先上传声音素材'],
    VOICE_SOURCE_FORBIDDEN: ['V408', '无法使用这份声音素材，请重新上传'],
    VOICE_SOURCE_FORMAT: ['V409', '声音素材格式不支持，请使用MP3、WAV或M4A'],
    VOICE_SOURCE_TOO_LARGE: ['V410', '声音素材过大，请使用20MB以内的文件'],
    VOICE_SOURCE_DOWNLOAD_FAILED: ['V411', '声音素材读取失败，请稍后重试'],
    VOICE_SOURCE_URL_FAILED: ['V412', '声音素材链接不可用，请重新上传'],
    LETTER_VOICE_FORBIDDEN: ['V501', '信笺语音校验未通过，请重新打开后重试'],
    INVALID_LETTER_VOICE: ['V502', '信笺片段无效，请重新打开后重试'],
    VOICE_REFERENCE_FORBIDDEN: ['V503', '语音登记校验未通过，请重新打开后重试'],
    VOICE_REFERENCE_CONFLICT: ['V504', '语音登记不一致，请重新打开后重试'],
    VOICE_PIN_UNAVAILABLE: ['V505', '语音登记服务暂不可用，请稍后重试'],
    VOICE_REFERENCE_SAVE_FAILED: ['V506', '语音保存失败，请点播放重试'],
    DRAFT_ID_REQUIRED: ['V601', '角色草稿编号缺失，请重新打开'],
    DRAFT_NOT_FOUND: ['V602', '角色草稿不可用，请重新打开'],
    REPAIR_TARGET_REQUIRED: ['V701', '请指定需要修复的声音记录'],
    REPAIR_CONFIRM_REQUIRED: ['V702', '声音修复需要管理员明确确认'],
    REPAIR_REQUEST_INVALID: ['V703', '声音修复记录无效，请重新核对'],
    REPAIR_MODEL_ID_MISSING: ['V704', '声音修复记录缺少音色编号'],
    REPAIR_SUPERSEDED: ['V705', '声音已有更新，请勿恢复旧记录'],
    REPAIR_CHARGE_NOT_CONFIRMED: ['V706', '尚未确认原声音扣款，请先核对'],
    UNKNOWN_ACTION: ['V901', '不支持这个声音操作，请重新打开']
  });

  function describeFailure(error = {}, traceId = '') {
    let technicalCode = String(error.code || 'VOICE_FAILED').slice(0, 100);
    if (!failures[technicalCode]) {
      const signal = `${technicalCode} ${String(error.message || '')}`;
      if (/timeout|timed out|etimedout/i.test(signal)) technicalCode = 'FISH_TIMEOUT';
      else if (/network|econnreset|enotfound|eai_again|fetch failed/i.test(signal)) technicalCode = 'FISH_NETWORK_FAILED';
      else if (/cloud_file|temp.?url|临时链接|文件链接|未返回可用|没有找到这个文件/i.test(signal)) technicalCode = 'CLOUD_FILE_TEMP_URL_UNAVAILABLE';
      else if (error.name === 'NotAllowedError') technicalCode = 'VOICE_PLAYBACK_BLOCKED';
      else if (error.voiceStage === 'save') technicalCode = 'VOICE_REFERENCE_SAVE_FAILED';
    }
    const [category, summary] = failures[technicalCode] || ['V999', '语音生成失败，请点播放重试'];
    const suffix = String(traceId || error.diagnosticTraceId || '').replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase();
    const inherited = String(error.supportCode || '');
    const supportCode = /^V\d{3}(?:-[A-Z0-9]{6})?$/.test(inherited)
      ? inherited : category + (suffix.length === 6 ? `-${suffix}` : '');
    return { supportCode, technicalCode, summary, message: `${summary}（${supportCode}）。请截图给管理员` };
  }

  return Object.freeze({ prepareSpeechText, describeFailure });
});
