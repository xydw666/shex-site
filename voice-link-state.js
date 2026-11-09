(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SHEXVoiceLinkState = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function bindingPresentation(profile = {}) {
    const hasVoice = profile?.hasVoice === true;
    return {
      hasVoice,
      status: hasVoice ? 'ready' : String(profile?.status || 'none'),
      label: hasVoice ? '已绑定' : profile?.hasPending ? '等待完成绑定' : '未设置'
    };
  }

  function isPlaybackLinkError(error) {
    const signal = `${String(error?.code || '')} ${String(error?.message || error || '')}`;
    return /cloud_file|temp.?url|临时链接|文件链接|没有权限读取|没有找到这个文件|未返回可用/i.test(signal);
  }

  function playbackFailureMessage(error) {
    if (isPlaybackLinkError(error)) return '声音已经生成并绑定，但试听链接暂时不可用，请稍后再点播放';
    return String(error?.message || '语音播放失败，请稍后重试');
  }

  function templateVoiceBinding(dream = {}) {
    if (String(dream?.origin || '') !== 'template_derived' || !String(dream?.characterInstanceId || dream?.id || '').trim()) return null;
    const binding = dream?.templateMetadata?.voiceBinding;
    if (!binding || typeof binding !== 'object' || String(binding.provider || '') !== 'fish'
      || !/^[a-zA-Z0-9_-]{16,160}$/.test(String(binding.referenceId || ''))) return null;
    return binding;
  }

  function shouldActivateTemplateVoice(dream = {}, profile = {}) {
    return profile?.hasVoice !== true && Boolean(templateVoiceBinding(dream));
  }

  return { bindingPresentation, isPlaybackLinkError, playbackFailureMessage, templateVoiceBinding, shouldActivateTemplateVoice };
});
