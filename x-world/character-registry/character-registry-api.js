(function initCharacterRegistryAPI(global, factory) {
  const api = factory(global);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.SHEXCharacterRegistryAPI = api;
})(typeof window !== 'undefined' ? window : globalThis, function createCharacterRegistryAPI(global) {
  'use strict';

  const CLIENT_VERSION = 'character-registry-client-v21-x101-world-media-diagnostics';
  let fallbackRequestSequence = 0;

  function clientError(code, message, extra = {}) {
    return Object.assign(new Error(String(message || '角色创作服务暂时不可用')), {
      code: String(code || 'CHARACTER_REGISTRY_FAILED'),
      ...extra
    });
  }

  function userFacingErrorMessage(codeValue, messageValue, fallback = '角色创作操作失败') {
    const code = String(codeValue || 'CHARACTER_REGISTRY_FAILED');
    const message = String(messageValue || '').trim();
    if (code === 'LEGACY_INSTANCE_INDEX_CONFLICT') {
      return '这个角色暂时没有加入聊天，请稍后再试。';
    }
    if (code === 'CHARACTER_REGISTRY_STORAGE_FAILED'
      || /(?:FailedOperation\.|DuplicateKey|E11000|DATABASE_REQUEST_FAILED|collection:\s*[^\s]+)/i.test(message)) {
      return String(fallback || '这次操作暂时没有完成，请稍后重试。');
    }
    return message || String(fallback || '角色创作操作失败');
  }

  function cleanId(value, label) {
    const result = String(value || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 180);
    if (!result) throw clientError('INVALID_ARGUMENT', `${label || '编号'}缺失`);
    return result;
  }

  function createRequestId(prefix = 'character_draft') {
    const crypto = global?.crypto;
    if (typeof crypto?.randomUUID === 'function') return `${prefix}_${crypto.randomUUID()}`;
    if (typeof crypto?.getRandomValues === 'function') {
      const values = new Uint32Array(4);
      crypto.getRandomValues(values);
      return `${prefix}_${Array.from(values, value => value.toString(16).padStart(8, '0')).join('')}`;
    }
    fallbackRequestSequence += 1;
    return `${prefix}_${Date.now().toString(36)}_${fallbackRequestSequence.toString(36)}`;
  }

  function createClient(options = {}) {
    const getCloudApp = options.getCloudApp;
    const currentUser = options.currentUser;
    const functionName = String(options.functionName || 'shexCharacterRegistry');
    const voiceFunctionName = String(options.voiceFunctionName || 'shexVoice');
    if (typeof getCloudApp !== 'function' || typeof currentUser !== 'function') {
      throw new Error('character registry client dependencies are required');
    }

    async function call(action, payload = {}, timeout = 15000, targetFunctionName = functionName) {
      const user = currentUser();
      if (!user?.userId || !user?.sessionToken) {
        throw clientError('SESSION_EXPIRED', '登录状态已失效，请重新登录');
      }
      const app = await getCloudApp();
      if (!app?.callFunction) throw clientError('CHARACTER_REGISTRY_UNAVAILABLE', '角色创作服务暂时不可用');
      let response;
      try {
        response = await app.callFunction({
          name: targetFunctionName,
          data: { action, ...payload, userId: user.userId, sessionToken: user.sessionToken },
          timeout
        });
      } catch (error) {
        const code = String(error?.code || 'CHARACTER_REGISTRY_NETWORK_FAILED');
        const message = /FUNCTION_NOT_FOUND/i.test(`${code} ${String(error?.message || '')}`)
          ? '角色创作服务尚未部署，请先完成云函数部署'
          : '角色创作服务连接失败，请稍后重试';
        throw clientError(code, message);
      }
      const result = response?.result || response || {};
      if (!result.ok && !result.success) {
        const code = result.code || 'CHARACTER_REGISTRY_FAILED';
        throw clientError(code, userFacingErrorMessage(code, result.message, '这次操作暂时没有完成，请稍后重试。'), {
          textScreening: result.textScreening && typeof result.textScreening === 'object' ? result.textScreening : null
        });
      }
      return result;
    }

    return Object.freeze({
      getCreatorWorkbenchBootstrap(input = {}) {
        return call('getCreatorWorkbenchBootstrap', {
          limit: Math.min(50, Math.max(1, Math.floor(Number(input.limit) || 50))),
          cursor: String(input.cursor || '').trim().slice(0, 500)
        });
      },
      updateCreatorProfile(input = {}) {
        const baseRevision = Math.floor(Number(input.baseRevision));
        if (!Number.isInteger(baseRevision) || baseRevision < 1) {
          throw clientError('CREATOR_PROFILE_REVISION_REQUIRED', '创作者资料版本缺失，请刷新后重试');
        }
        const avatarAssetId = String(input.avatarAssetId || '').trim();
        if (avatarAssetId && !/^cloud:\/\//i.test(avatarAssetId)) {
          throw clientError('CREATOR_AVATAR_CLOUD_REQUIRED', '创作者头像必须先上传到云存储');
        }
        return call('updateCreatorProfile', {
          baseRevision,
          displayName: String(input.displayName || '').normalize('NFKC').trim().slice(0, 40),
          avatarAssetId: avatarAssetId.slice(0, 2048)
        });
      },
      validateTemplatePublicVoice(input = {}) {
        const existingVoiceBinding = input.existingVoiceBinding && typeof input.existingVoiceBinding === 'object'
          ? input.existingVoiceBinding : null;
        return call('validateTemplatePublicVoice', {
          draftId: cleanId(input.draftId, '草稿编号'),
          publicVoiceReference: String(input.publicVoiceReference || '').normalize('NFKC').trim().slice(0, 300),
          existingVoiceBinding
        }, 30000, voiceFunctionName);
      },
      getPublicCreatorPage(input = {}) {
        return call('getPublicCreatorPage', {
          creatorId: cleanId(input.creatorId, '创作者编号'),
          limit: Math.min(20, Math.max(1, Math.floor(Number(input.limit) || 20))),
          cursor: String(input.cursor || '').trim().slice(0, 500)
        });
      },
      createBlankDraft(input = {}) {
        return call('createDraft', {
          requestId: cleanId(input.requestId, '请求编号'),
          draftPayload: input.draftPayload && typeof input.draftPayload === 'object' ? input.draftPayload : {}
        });
      },
      importPrivateDream(input = {}) {
        return call('importPrivateDreamDraft', {
          requestId: cleanId(input.requestId, '请求编号'),
          dreamId: cleanId(input.dreamId, '梦角编号')
        });
      },
      getDraft(draftId) {
        return call('getDraft', { draftId: cleanId(draftId, '草稿编号') });
      },
      listDrafts(input = {}) {
        const limit = Math.min(50, Math.max(1, Math.floor(Number(input.limit) || 20)));
        const updatedBefore = Math.max(0, Number(input.updatedBefore || 0));
        const cursor = String(input.cursor || '').trim().slice(0, 500);
        return call('listDrafts', { limit, cursor, updatedBefore });
      },
      saveDraft(input = {}) {
        const baseRevision = Math.floor(Number(input.baseRevision));
        if (!Number.isInteger(baseRevision) || baseRevision < 1) {
          throw clientError('DRAFT_REVISION_REQUIRED', '草稿版本信息缺失，请刷新后重试');
        }
        return call('saveDraft', {
          draftId: cleanId(input.draftId, '草稿编号'),
          baseRevision,
          draftPayload: input.draftPayload && typeof input.draftPayload === 'object' ? input.draftPayload : {}
        });
      },
      deleteDraft(input = {}) {
        const baseRevision = Math.floor(Number(input.baseRevision));
        if (!Number.isInteger(baseRevision) || baseRevision < 1) throw clientError('DRAFT_REVISION_REQUIRED', '草稿版本信息缺失，请刷新后重试');
        return call('deleteDraft', {
          draftId: cleanId(input.draftId, '草稿编号'),
          baseRevision
        });
      },
      previewPublication(draftId) {
        return call('previewPublication', { draftId: cleanId(draftId, '草稿编号') });
      },
      checkPublication(input = {}) {
        const draftRevision = Math.floor(Number(input.draftRevision));
        if (!Number.isInteger(draftRevision) || draftRevision < 1) {
          throw clientError('DRAFT_REVISION_REQUIRED', '草稿版本信息缺失，请重新打开后再检查');
        }
        return call('checkPublication', {
          draftId: cleanId(input.draftId, '草稿编号'),
          draftRevision
        });
      },
      submitPublicationReview(input = {}) {
        const draftRevision = Math.floor(Number(input.draftRevision));
        if (!Number.isInteger(draftRevision) || draftRevision < 1) throw clientError('DRAFT_REVISION_REQUIRED', '草稿版本信息缺失');
        return call('submitPublicationReview', {
          requestId: cleanId(input.requestId, '审核请求编号'),
          draftId: cleanId(input.draftId, '草稿编号'),
          draftRevision
        });
      },
      getPublicationReview(reviewId) {
        return call('getPublicationReview', { reviewId: cleanId(reviewId, '审核单编号') });
      },
      listPublicationReviews(input = {}) {
        return call('listPublicationReviews', { limit: Math.min(50, Math.max(1, Math.floor(Number(input.limit) || 50))) });
      },
      listPendingPublicationReviews(input = {}) {
        return call('listPendingPublicationReviews', { limit: Math.min(50, Math.max(1, Math.floor(Number(input.limit) || 20))) });
      },
      decidePublicationReview(input = {}) {
        const reviewRevision = Math.floor(Number(input.reviewRevision));
        if (!Number.isInteger(reviewRevision) || reviewRevision < 1) throw clientError('REVIEW_REVISION_REQUIRED', '审核单版本缺失');
        return call('decidePublicationReview', {
          reviewId: cleanId(input.reviewId, '审核单编号'),
          reviewRevision,
          decision: String(input.decision || ''),
          reviewNote: String(input.reviewNote || '')
        });
      },
      listPublishedCharacters(input = {}) {
        const limit = Math.min(40, Math.max(1, Math.floor(Number(input.limit) || 20)));
        const cursor = String(input.cursor || '').trim().slice(0, 1500);
        // 同组 OR、跨组 AND 由服务端在完整公开目录上执行；
        // 这里只负责把选中的展示名原样带上，上限与 draft-payload-contract 一致。
        const filterValues = (value, max) => Array.from(new Set((Array.isArray(value) ? value : [])
          .map(item => String(item || '').trim()).filter(Boolean))).slice(0, max);
        const filterIds = (value, max, maxLength = 64) => Array.from(new Set((Array.isArray(value) ? value : [])
          .map(item => String(item || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, maxLength)).filter(Boolean))).slice(0, max);
        const sort = ['all', 'latest', 'hot'].includes(String(input.sort || '').trim().toLowerCase())
          ? String(input.sort).trim().toLowerCase() : 'latest';
        const randomStart = /^[a-f0-9]{16}$/i.test(String(input.randomStart || '').trim())
          ? String(input.randomStart).trim().toLowerCase() : '';
        return call('listPublishedCharacters', {
          ...(String(input.keyword || '').trim() ? { keyword: String(input.keyword).trim().slice(0, 120) } : {}),
          limit,
          cursor,
          categoryId: String(input.categoryId || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40),
          tagIds: filterIds(input.tagIds, 10),
          contentTypes: filterValues(input.contentTypes, 2),
          galleryTags: filterValues(input.galleryTags, 10),
          sort,
          randomStart: sort === 'all' ? randomStart : ''
        });
      },
      getPublishedCharacter(characterId) {
        return call('getPublishedCharacter', { characterId: cleanId(characterId, '角色编号') });
      },
      resolvePublicCharacterMedia(fileIds = [], options = {}) {
        return call('resolvePublicCharacterMedia', {
          // 一页最多20个角色头像 + 20个不同创作者头像，合并成一次公开媒体调用。
          fileIds: Array.from(new Set(fileIds.map(String))).slice(0, 40),
          instanceIds: Array.from(new Set((Array.isArray(options.instanceIds) ? options.instanceIds : [])
            .map(value => cleanId(value, '角色副本编号')))).slice(0, 20)
        });
      },
      resolveOwnedWorldRoleAvatars(fileIds = []) {
        return call('resolveOwnedWorldRoleAvatars', {
          fileIds: Array.from(new Set(fileIds.map(String))).slice(0, 40)
        });
      },
      authorizePublicAvatarUpload(input = {}) {
        return call('authorizePublicAvatarUpload', {
          requestId: cleanId(input.requestId, '上传请求编号'),
          extension: String(input.extension || 'jpg').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8)
        });
      },
      authorizePublicBackgroundUpload(input = {}) {
        return call('authorizePublicBackgroundUpload', {
          requestId: cleanId(input.requestId, '上传请求编号'),
          extension: String(input.extension || 'jpg').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8)
        });
      },
      authorizeCreatorAvatarUpload(input = {}) {
        return call('authorizeCreatorAvatarUpload', {
          requestId: cleanId(input.requestId, '上传请求编号'),
          extension: String(input.extension || 'jpg').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8)
        });
      },
      authorizeWorldBackgroundUpload(input = {}) {
        return call('authorizeWorldBackgroundUpload', {
          requestId: cleanId(input.requestId, '上传请求编号'),
          clientVersion: CLIENT_VERSION,
          extension: String(input.extension || 'jpg').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8)
        });
      },
      authorizeWorldPromoUpload(input = {}) {
        return call('authorizeWorldPromoUpload', {
          requestId: cleanId(input.requestId, '上传请求编号'),
          clientVersion: CLIENT_VERSION,
          extension: String(input.extension || 'jpg').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8)
        });
      },
      authorizeWorldRoleAvatarUpload(input = {}) {
        return call('authorizeWorldRoleAvatarUpload', {
          requestId: cleanId(input.requestId, '上传请求编号'),
          clientVersion: CLIENT_VERSION,
          extension: String(input.extension || 'jpg').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8)
        });
      },
      confirmPublicMediaUpload(input = {}) {
        const fileId = String(input.fileId || '').trim();
        if (!/^cloud:\/\//i.test(fileId)) throw clientError('PUBLIC_MEDIA_FILE_REQUIRED', '公开图片文件编号缺失');
        return call('confirmPublicMediaUpload', { fileId, clientVersion: CLIENT_VERSION });
      },
      getCharacterCategories() {
        return call('getCharacterCategories');
      },
      updateCharacterCategories(input = {}) {
        const baseRevision = Math.floor(Number(input.baseRevision));
        if (!Number.isInteger(baseRevision) || baseRevision < 0) throw clientError('CHARACTER_CATEGORY_REVISION_INVALID', '大类配置版本无效，请刷新后重试');
        return call('updateCharacterCategories', {
          requestId: cleanId(input.requestId, '大类配置请求编号'),
          baseRevision,
          categories: Array.isArray(input.categories) ? input.categories.slice(0, 50).map(item => ({
            categoryId: String(item?.categoryId || '').trim(), displayName: String(item?.displayName || '').trim(),
            status: String(item?.status || 'active'), sortOrder: Number(item?.sortOrder || 0)
          })) : []
        });
      },
      listCharacterTags(input = {}) {
        return call('listCharacterTags', {
          query: String(input.query || '').normalize('NFKC').trim().slice(0, 40),
          limit: Math.min(100, Math.max(1, Math.floor(Number(input.limit) || 50))),
          cursor: String(input.cursor || '').trim().slice(0, 500)
        });
      },
      createCharacterTag(input = {}) {
        return call('createCharacterTag', {
          requestId: cleanId(input.requestId, '标签创建请求编号'),
          displayName: String(input.displayName || '').normalize('NFKC').trim().slice(0, 40)
        });
      },
      resolveCharacterTags(input = {}) {
        const tagIds = Array.from(new Set((Array.isArray(input.tagIds) ? input.tagIds : [])
          .map(value => String(value || '').trim()).filter(Boolean))).slice(0, 10);
        return call('resolveCharacterTags', { tagIds });
      },
      listAllCharacterTags(input = {}) {
        return call('listAllCharacterTags', {
          query: String(input.query || '').normalize('NFKC').trim().slice(0, 40),
          limit: Math.min(100, Math.max(1, Math.floor(Number(input.limit) || 50))),
          cursor: String(input.cursor || '').trim().slice(0, 500)
        });
      },
      updateCharacterTagStatus(input = {}) {
        const status = String(input.status || '').trim().toLowerCase();
        if (!['active', 'inactive'].includes(status)) throw clientError('CHARACTER_TAG_STATUS_INVALID', '标签状态无效');
        return call('updateCharacterTagStatus', {
          tagId: cleanId(input.tagId, '标签编号'),
          status
        });
      },
      submitCharacterReport(input = {}) {
        return call('submitCharacterReport', {
          workType: input.workType === 'world' ? 'world' : 'character',
          characterId: input.workType === 'world' ? '' : cleanId(input.characterId, '角色编号'),
          worldTemplateId: input.workType === 'world' ? cleanId(input.worldTemplateId, '模拟器编号') : '',
          versionId: input.versionId ? cleanId(input.versionId, '公开版本编号') : '',
          category: String(input.category || 'other'),
          note: String(input.note || '').slice(0, 500)
        });
      },
      adminUnpublishGalleryWork(input = {}) {
        const workType = input.workType === 'world' ? 'world' : 'character';
        return call('adminUnpublishGalleryWork', {
          workType,
          characterId: workType === 'character' ? cleanId(input.characterId, '角色编号') : '',
          worldTemplateId: workType === 'world' ? cleanId(input.worldTemplateId, '模拟器编号') : ''
        });
      },
      listPendingCharacterReports(input = {}) {
        return call('listPendingCharacterReports', {
          limit: Math.min(100, Math.max(1, Math.floor(Number(input.limit) || 50))),
          cursor: String(input.cursor || '').slice(0, 500)
        });
      },
      decideCharacterReport(input = {}) {
        const reportRevision = Math.floor(Number(input.reportRevision));
        if (!Number.isInteger(reportRevision) || reportRevision < 1) throw clientError('CHARACTER_REPORT_REVISION_REQUIRED', '举报记录版本缺失');
        return call('decideCharacterReport', {
          reportId: cleanId(input.reportId, '举报记录编号'), reportRevision,
          decision: String(input.decision || ''), reviewNote: String(input.reviewNote || '').slice(0, 500)
        });
      },
      claimPublishedCharacter(input = {}) {
        return call('claimPublishedCharacter', {
          characterId: cleanId(input.characterId, '角色编号'),
          creationRequestId: cleanId(input.creationRequestId || input.requestId, '领取请求编号')
        });
      },
      removeCharacterInstance(input = {}) {
        return call('removeCharacterInstance', {
          instanceId: cleanId(input.instanceId, '角色副本编号')
        });
      },
      listMyCharacterInstances(input = {}) {
        return call('listMyCharacterInstances', { limit: Math.min(50, Math.max(1, Math.floor(Number(input.limit) || 20))) });
      },
      getMyCharacterInstance(instanceId) {
        return call('getMyCharacterInstance', { instanceId: cleanId(instanceId, '角色副本编号') });
      },
      upgradeCharacterInstance(input = {}) {
        return call('upgradeCharacterInstance', {
          instanceId: cleanId(input.instanceId, '角色副本编号'),
          ...(input.versionId ? { versionId: String(input.versionId) } : {})
        });
      },
      publishCharacter(input = {}) {
        return call('publishCharacter', {
          requestId: cleanId(input.requestId, '发布请求编号'),
          draftId: cleanId(input.draftId, '草稿编号'),
          reviewId: cleanId(input.reviewId, '审核单编号'),
          beautifyRef: input.beautifyRef || null
        });
      },
      unpublishCharacter(input = {}) {
        return call('unpublishCharacter', {
          draftId: cleanId(input.draftId, '草稿编号'),
          characterId: cleanId(input.characterId, '角色编号')
        });
      }
    });
  }

  return Object.freeze({ CLIENT_VERSION, clientError, userFacingErrorMessage, cleanId, createClient, createRequestId });
});
