(() => {
  'use strict';

  const X_STATE_KEY = 'shex_x_multi_state_v1';
  const profileOptions = window.SHEXCharacterProfileOptions;
  if (!profileOptions) throw new Error('character profile options are required');
  const {
    MBTI_TYPES, ZODIACS,
    WORLD_TYPES, IDENTITY_TAGS, PERSONALITY_GROUPS, DAILY_LIFE_TAGS,
    SPEECH_AMOUNTS, SPEECH_TONES, SPEECH_HABITS, PREFERENCE_TAGS,
    DIALOGUE_SCENES, USER_PERSONALITY_TAGS, USER_CAREERS, USER_HOBBIES,
    RELATIONSHIP_IDENTITIES, RELATIONSHIP_DYNAMICS, RELATIONSHIP_DEVELOPMENT,
    RELATIONSHIP_SPEEDS, INTERACTION_PREFERENCES
  } = profileOptions;

  const editorState = {
    dreamId: '',
    tab: 'ta',
    backTarget: 'world',
    revisions: Object.create(null),
    taEditSignature: '',
    taModes: Object.create(null)
  };
  let importSession = null;
  let importSaveInProgress = false;
  let existingSaveInProgress = false;

  function cancelImport() {
    if (!importSession) return;
    importSession.cancelled = true;
    importSession.preview?.remove();
    importSession = null;
  }

  function importIsCurrent(session) {
    const panel = document.querySelector('#xCharacterProfilePanel');
    return importSession === session && !session.cancelled && session.root.isConnected
      && editorState.dreamId === session.dreamId && !!currentDream(session.dreamId)
      && String(readState().currentDreamId || '') === session.selectedDreamId
      && String(document.body.dataset.xPage || '') === session.page
      && !!panel && !panel.hidden && getComputedStyle(panel).display !== 'none';
  }

  function importerAvailable() {
    const importer = window.SHEXCharacterCardImport;
    return importer && typeof importer.parseCharacterCardFile === 'function'
      && typeof importer.toImportDraft === 'function' && typeof importer.toDreamProfileUpdate === 'function';
  }

  async function prepareImport(root, file) {
    if (!file || existingSaveInProgress || importSaveInProgress) return;
    cancelImport();
    if (!importerAvailable()) { status('导入工具尚未加载，请刷新后重试。', 'error'); return; }
    const session = {
      root, dreamId: editorState.dreamId, selectedDreamId: String(readState().currentDreamId || ''),
      page: String(document.body.dataset.xPage || ''), cancelled: false, saving: false,
      revisions: {
        personaProfile: Number(groupState('personaProfile').revision || 0),
        relationshipProfile: Number(groupState('relationshipProfile').revision || 0)
      },
      profiles: { characterProfile: characterFor(), relationshipProfile: relationshipFor() }
    };
    importSession = session;
    status('正在读取角色卡…');
    try {
      const importer = window.SHEXCharacterCardImport;
      const parsed = await importer.parseCharacterCardFile(file);
      if (!importIsCurrent(session)) { if (importSession === session) cancelImport(); return; }
      const draft = importer.toImportDraft(parsed);
      session.update = importer.toDreamProfileUpdate(draft, session.profiles);
      const fieldCount = (draft.report?.imported || []).filter(field => !field.startsWith('templateMetadata.')).length;
      const truncatedCount = (draft.report?.warnings || []).filter(item => item.code === 'truncated').length;
      const skippedCount = (draft.report?.skipped || []).length + Number(draft.report?.suppressedSkippedCount || 0);
      // Keep only adapted profiles in this temporary session. Raw card, PNG and publication metadata never persist.
      delete session.profiles;
      if (!session.update.groups.length) {
        cancelImport(); status('角色卡没有可更新的梦角资料；开场白、作者说明、公开介绍、作者名称已忽略。'); return;
      }
      const name = currentDream(session.dreamId)?.name || '梦角';
      const labels = session.update.groups.map(group => group === 'personaProfile' ? 'TA的资料' : '关系资料');
      const preview = document.createElement('section');
      preview.className = 'shex-character-import-preview';
      preview.dataset.characterImportPreview = '';
      preview.setAttribute('aria-label', '确认导入角色卡');
      preview.innerHTML = `<h2>导入到${escapeHtml(name)}</h2>
        <p>将更新${escapeHtml(labels.join('、'))}，共${fieldCount}个有效字段。卡片未提供的资料会保留。</p>
        ${truncatedCount || skippedCount ? `<p>读取提醒：${truncatedCount ? `${truncatedCount}处内容过长，已按资料上限截短。` : ''}${skippedCount ? `${skippedCount}处空白、无效或不支持的内容已跳过。` : ''}</p>` : ''}
        <p>忽略开场白、作者说明、公开介绍、作者名称；你的个人资料和相处偏好会保留。</p>
        <div><button type="button" data-character-import-cancel>取消</button><button type="button" data-character-import-confirm>确认导入</button></div>`;
      session.preview = preview;
      root.querySelector('.shex-character-header').insertAdjacentElement('afterend', preview);
      preview.querySelector('[data-character-import-cancel]').addEventListener('click', () => { cancelImport(); status('已取消导入。'); });
      preview.querySelector('[data-character-import-confirm]').addEventListener('click', () => commitImport(session));
      status('请确认要更新的梦角资料。');
    } catch (error) {
      if (!importIsCurrent(session)) { if (importSession === session) cancelImport(); return; }
      cancelImport(); status(error?.message || '角色卡读取失败，请检查文件。', 'error');
    }
  }

  async function commitImport(session) {
    if (session.saving || existingSaveInProgress || importSaveInProgress) return;
    if (!importIsCurrent(session)) { cancelImport(); return; }
    const data = window.SHEXCharacterProfileData;
    const targets = session.update.groups.map(group => ({
      group, label: group === 'personaProfile' ? 'TA的资料' : '关系资料',
      setter: group === 'personaProfile' ? 'setCharacterProfileV3' : 'setRelationshipProfileV1',
      profile: group === 'personaProfile' ? session.update.characterProfile : session.update.relationshipProfile
    }));
    // Check every requested group before the first setter, so a blocked second group cannot cause a partial overwrite.
    for (const target of targets) {
      const state = data?.getGroupState?.(session.dreamId, target.group);
      if (!state || state.hasConflict || Number(state.revision || 0) !== session.revisions[target.group]) {
        cancelImport(); status('资料已有更新或待处理冲突，请核对后重新选择角色卡。', 'error'); return;
      }
      if (typeof data?.[target.setter] !== 'function') {
        cancelImport(); status('资料保存工具尚未加载，请刷新后重试。', 'error'); return;
      }
    }
    session.saving = true;
    importSaveInProgress = true;
    const controls = [...session.root.querySelectorAll('[data-character-import], [data-character-import-confirm], [data-character-import-cancel], [data-character-tab], [data-character-save-ta], [data-character-save-relationship], [data-character-save-user-profile], [data-character-save-me], [data-character-resolve-conflict]')];
    const disabledBefore = controls.map(control => control.disabled);
    controls.forEach(control => { control.disabled = true; });
    const completed = [];
    let message = '', kind = 'error';
    try {
      for (let index = 0; index < targets.length; index += 1) {
        if (!importIsCurrent(session)) break;
        const target = targets[index];
        const ok = await data[target.setter](session.dreamId, target.profile, { baseRevision: session.revisions[target.group] });
        const outcome = data.getLastSaveOutcome?.() || {};
        const pending = !ok && outcome.code === 'PROFILE_SYNC_PENDING' && outcome.localSaved === true
          && outcome.dreamId === session.dreamId && outcome.group === target.group;
        if (ok) { completed.push(target.label); continue; }
        const remaining = targets.slice(index + (pending ? 1 : 0)).map(item => item.label);
        message = `${completed.length ? `${completed.join('、')}已保存；` : ''}${pending ? `${target.label}已保存在本机，但尚未同步到云端；` : ''}${remaining.length ? `${remaining.join('、')}未保存。` : ''}请核对当前资料。`;
        break;
      }
      if (completed.length === targets.length) { message = '角色卡资料已导入。'; kind = 'success'; }
    } catch (error) {
      const remaining = targets.slice(completed.length).map(item => item.label);
      message = `${completed.length ? `${completed.join('、')}已保存；` : ''}${remaining.join('、')}未保存。${error?.message || '请核对后重试。'}`;
    } finally {
      importSaveInProgress = false;
      const current = importIsCurrent(session);
      controls.forEach((control, index) => { if (control.isConnected) control.disabled = disabledBefore[index]; });
      if (importSession === session) cancelImport();
      if (current && message) { render(); status(message, kind); }
      else document.querySelector('#xCharacterProfilePanel [data-character-import]')?.removeAttribute('disabled');
    }
  }

  async function runExistingSave(root, operation) {
    if (importSaveInProgress || existingSaveInProgress) return;
    cancelImport();
    existingSaveInProgress = true;
    const button = root.querySelector('[data-character-import]');
    if (button) button.disabled = true;
    try { await operation(); }
    finally {
      existingSaveInProgress = false;
      const currentButton = document.querySelector('#xCharacterProfilePanel [data-character-import]');
      if (currentButton) currentButton.disabled = false;
    }
  }

  function escapeHtml(value = '') {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function appearanceEditorText(appearanceValue = {}) {
    const appearance = appearanceValue && typeof appearanceValue === 'object' ? appearanceValue : {};
    return [appearance.summary, appearance.details]
      .map((value) => String(value || '').trim())
      .filter(Boolean)
      .join('\n');
  }

  function splitAppearanceEditorText(value = '') {
    const characters = Array.from(String(value || '').replace(/\r\n?/g, '\n').trim());
    if (characters.length <= 500) return { summary: characters.join(''), details: '' };
    const preferredBreak = characters.slice(0, 501).lastIndexOf('\n');
    const splitAt = preferredBreak > 0 ? preferredBreak : 500;
    return {
      summary: characters.slice(0, splitAt).join('').trim(),
      details: characters.slice(splitAt + (preferredBreak > 0 ? 1 : 0), splitAt + (preferredBreak > 0 ? 401 : 400)).join('').trim()
    };
  }

  function readState() {
    try {
      const value = JSON.parse(localStorage.getItem(X_STATE_KEY) || '{}');
      return value && typeof value === 'object' ? value : {};
    } catch (_) {
      return {};
    }
  }

  function currentDream(dreamId = editorState.dreamId) {
    const state = readState();
    const dreams = Array.isArray(state.dreams) ? state.dreams : [];
    const requestedId = String(dreamId || '').trim();
    if (requestedId) return dreams.find((item) => String(item?.id || '') === requestedId) || null;
    return dreams.find((item) => String(item?.id || '') === String(state.currentDreamId || ''))
      || dreams[0]
      || null;
  }

  function defaultPersona() {
    return {
      schemaVersion: 2,
      mbti: '',
      zodiac: '',
      tags: [],
      personality: '',
      speechStyle: '',
      background: '',
      relationship: '',
      preferences: '',
      boundaries: '',
      exampleDialogue: '',
      freeform: ''
    };
  }

  function personaFor(dreamId = editorState.dreamId) {
    const dream = currentDream(dreamId);
    const stored = window.SHEXCharacterProfileData?.getPersonaV2?.(dreamId) || dream?.personaProfile;
    return stored && typeof stored === 'object' ? { ...defaultPersona(), ...stored } : defaultPersona();
  }

  function characterFor(dreamId = editorState.dreamId) {
    const dream = currentDream(dreamId);
    const stored = window.SHEXCharacterProfileData?.getCharacterProfileV3?.(dreamId);
    if (stored && typeof stored === 'object') return stored;
    return window.SHEXCharacterProfileMigration?.resolveCharacterProfileV3?.(dream || {}) || {
      schemaVersion: 3,
      basic: { displayName: String(dream?.name || ''), gender: '', selfReference: '', genderSelfReference: '', age: '', mbti: '', zodiac: '' },
      world: { worldType: '', customWorld: '' },
      identity: { tags: [], customIdentity: '', primaryLanguages: [] },
      background: { summary: '' },
      personality: { tags: [], core: '' },
      dailyLife: { tags: [], goalsAndRoutine: '' },
      speech: { amount: '', tones: [], habits: [], languages: ['普通话'], needsTranslation: false, freeform: '' },
      preferences: { tags: [], freeform: '' },
      principles: { freeform: '' },
      exampleDialogues: [],
      other: { freeform: '' },
      media: { privateAvatarRef: String(dream?.avatar || '') },
      compatibility: { legacyPersonalityTags: [] }
    };
  }

  function userProfileFor(dreamId = editorState.dreamId) {
    const dream = currentDream(dreamId) || {};
    const base = {
      userCall: window.SHEXCharacterProfileMigration?.resolveDreamUserCall?.(dream, '') || '',
      mbti: '',
      zodiac: '',
      personalityTags: [],
      personalityCustom: '',
      career: '',
      careerCustom: '',
      hobbies: [],
      hobbiesCustom: '',
      aboutMe: '',
      freeform: ''
    };
    const stored = window.SHEXCharacterProfileData?.getUserProfileV1?.(dreamId) || dream.datingUserProfile;
    return stored && typeof stored === 'object' ? { ...base, ...stored, userCall: base.userCall } : base;
  }

  function relationshipFor(dreamId = editorState.dreamId) {
    const dream = currentDream(dreamId) || {};
    const stored = window.SHEXCharacterProfileData?.getRelationshipProfileV1?.(dreamId);
    return stored && typeof stored === 'object' ? stored : {
      schemaVersion: 1,
      foundation: { identity: '', dynamics: [], developmentMode: '', speed: '', freeform: String(dream.personaProfile?.relationship || '') }
    };
  }

  function userRelationFor(dreamId = editorState.dreamId) {
    const dream = currentDream(dreamId) || {};
    const stored = window.SHEXCharacterProfileData?.getUserRelationProfileV1?.(dreamId);
    return stored && typeof stored === 'object' ? stored : {
      schemaVersion: 1,
      userCall: window.SHEXCharacterProfileMigration?.resolveDreamUserCall?.(dream, '') || '',
      interactionTags: [],
      freeform: String(dream.datingUserProfile?.freeform || '')
    };
  }

  function groupState(groupName) {
    return window.SHEXCharacterProfileData?.getGroupState?.(editorState.dreamId, groupName) || { revision: 0, hasConflict: false };
  }

  function unresolvedConflicts() {
    const values = window.SHEXCharacterProfileData?.listConflicts?.(editorState.dreamId) || [];
    return Array.isArray(values) ? values : [];
  }

  function status(message = '', kind = 'info') {
    const node = document.querySelector('#xCharacterProfilePanel [data-character-profile-status]');
    if (!node) return;
    node.textContent = String(message || '');
    node.dataset.kind = kind;
  }

  function handleSaveFailure(fallbackMessage, reenable = () => {}) {
    const outcome = window.SHEXCharacterProfileData?.getLastSaveOutcome?.() || {};
    if (['DREAM_PROFILE_DELETED', 'DREAM_PROFILE_DREAM_NOT_FOUND', 'PROFILE_DREAM_NOT_FOUND'].includes(outcome.code)) {
      status('这位梦角已被删除或不存在，资料没有保存。', 'error');
      reenable();
      return;
    }
    if (outcome.code === 'PROFILE_SYNC_PENDING' && outcome.localSaved === true) {
      if (outcome.group) editorState.revisions[outcome.group] = Number(outcome.revision || 0);
      render();
      status('已保存在本机，但尚未同步到云端，系统会继续重试', 'error');
      return;
    }
    status(fallbackMessage, 'error');
    reenable();
  }

  function optionMarkup(values, selected, emptyLabel = '未设置') {
    const preservedValues = selected && !values.includes(selected) ? [selected, ...values] : values;
    return [''].concat(preservedValues).map((value) => `
      <option value="${escapeHtml(value)}"${value === selected ? ' selected' : ''}>${escapeHtml(value || emptyLabel)}</option>
    `).join('');
  }

  function tagButtons(values, activeValues, attribute) {
    const active = new Set(Array.isArray(activeValues) ? activeValues : []);
    return values.map((value) => `
      <button class="${active.has(value) ? 'is-active' : ''}" type="button" ${attribute}="${escapeHtml(value)}" aria-pressed="${active.has(value)}">${escapeHtml(value)}</button>
    `).join('');
  }

  function profileChoiceButtons(values, activeValues, attribute, options = {}) {
    const active = new Set(Array.isArray(activeValues) ? activeValues : []);
    const merged = Array.from(new Set([...(values || []), ...active]));
    return merged.map((value) => `
      <button class="${active.has(value) ? 'is-active' : ''}" type="button"
        ${attribute}="${escapeHtml(value)}"
        data-character-choice-group="${escapeHtml(options.group || '')}"
        data-character-max-items="${Number(options.maxItems || 0)}"
        ${options.single ? 'data-character-single-choice="true"' : ''}
        aria-pressed="${active.has(value)}">${escapeHtml(value)}</button>
    `).join('');
  }

  function contentMode(group, hasTags, hasCustom) {
    const remembered = editorState.taModes[group];
    if (remembered === 'tags' || remembered === 'custom') return remembered;
    return !hasTags && hasCustom ? 'custom' : 'tags';
  }

  function modeHeaderMarkup(title, group, mode) {
    return `
      <div class="shex-character-mode-head">
        <h2>${escapeHtml(title)}</h2>
        <div class="shex-character-mode-toggle" role="group" aria-label="${escapeHtml(title)}填写方式">
          <button class="${mode === 'tags' ? 'is-active' : ''}" type="button" data-character-content-mode="${escapeHtml(group)}" data-character-content-mode-value="tags" aria-pressed="${mode === 'tags'}">标签</button>
          <button class="${mode === 'custom' ? 'is-active' : ''}" type="button" data-character-content-mode="${escapeHtml(group)}" data-character-content-mode-value="custom" aria-pressed="${mode === 'custom'}">自定义</button>
        </div>
      </div>
    `;
  }

  function modePanelAttributes(group, value, activeMode) {
    return `data-character-mode-panel="${escapeHtml(group)}" data-character-mode-panel-value="${escapeHtml(value)}"${value === activeMode ? '' : ' hidden'}`;
  }

  function dialogueRows(dialogues = []) {
    const visibleDialogues = Array.isArray(dialogues) && dialogues.length ? dialogues.slice(0, 5) : [{}];
    return visibleDialogues.map((item, index) => {
      return `
        <div class="shex-character-dialogue" data-character-dialogue-row>
          <div class="shex-character-dialogue-head"><strong data-character-dialogue-label>情境 ${index + 1}</strong><button type="button" data-character-remove-dialogue>移除</button></div>
          <label><span>情境名称</span><input type="text" list="shexCharacterDialogueScenes" maxlength="80" value="${escapeHtml(item.scene || '')}" data-character-dialogue-scene></label>
          <label><span>示例内容</span><textarea maxlength="800" data-character-dialogue-content>${escapeHtml(item.content || '')}</textarea></label>
        </div>
      `;
    }).join('');
  }

  function candidateRows(groupName, candidate = {}) {
    const value = candidate?.value && typeof candidate.value === 'object' ? candidate.value : {};
    let rows = [];
    if (groupName === 'personaProfile') {
      const character = value.characterProfile || {};
      const persona = value.personaProfile || {};
      rows = character.schemaVersion === 3 ? [
        ['昵称', character.basic?.displayName || value.name],
        ['世界／身份', [character.world?.worldType, ...(character.identity?.tags || [])].filter(Boolean).join(' · ')],
        ['性格标签', Array.isArray(character.personality?.tags) ? character.personality.tags.join('、') : ''],
        ['核心性格', character.personality?.core],
        ['说话方式', character.speech?.freeform],
        ['背景与身份', character.background?.summary],
        ['其他补充', character.other?.freeform]
      ] : [
        ['性格标签', Array.isArray(persona.tags) ? persona.tags.join('、') : ''],
        ['核心性格', persona.personality],
        ['说话方式', persona.speechStyle],
        ['背景与身份', persona.background],
        ['你们的关系', persona.relationship],
        ['其他补充', persona.freeform]
      ];
    } else if (groupName === 'relationshipProfile') {
      const relationship = value.relationshipProfile?.foundation || {};
      const special = value.relationshipProfile?.specialTreatment || {};
      rows = [
        ['关系身份', relationship.identity],
        ['相处模式', Array.isArray(relationship.dynamics) ? relationship.dynamics.join('、') : ''],
        ['关系发展', relationship.developmentMode],
        ['发展速度', relationship.speed],
        ['关系补充', relationship.freeform],
        ['专属相处标签', Array.isArray(special.tags) ? special.tags.join('、') : ''],
        ['专属相处补充', special.freeform]
      ];
    } else if (groupName === 'userRelationProfile') {
      const relation = value.userRelationProfile || {};
      rows = [
        ['TA对你的称呼', relation.userCall],
        ['希望的相处方式', Array.isArray(relation.interactionTags) ? relation.interactionTags.join('、') : ''],
        ['相处偏好补充', relation.freeform]
      ];
    } else if (groupName === 'datingUserProfile') {
      const user = value.datingUserProfile || {};
      rows = [
        ['称呼', value.userCall || value.userNickname],
        ['MBTI／星座', [user.mbti, user.zodiac].filter(Boolean).join(' · ')],
        ['性格标签', Array.isArray(user.personalityTags) ? user.personalityTags.join('、') : ''],
        ['性格自定义', user.personalityCustom],
        ['职业', user.career],
        ['职业自定义', user.careerCustom],
        ['爱好', Array.isArray(user.hobbies) ? user.hobbies.join('、') : ''],
        ['爱好自定义', user.hobbiesCustom],
        ['我的信息', user.aboutMe],
        ['自由补充', user.freeform]
      ];
    } else if (groupName === 'datingRelationship') {
      const anniversaries = Array.isArray(value.datingAnniversaries) ? value.datingAnniversaries : [];
      rows = [
        ['在一起时间', value.datingTogetherSince],
        ['纪念日', anniversaries.length ? `${anniversaries.length} 条` : '未设置']
      ];
    } else {
      rows = [
        ['回复方式', value.replyMode === 'ai' ? 'AI聊天' : '字卡聊天'],
        ['线上模式', value.aiOnlineMode === true ? '开' : '关'],
        ['长文模式', value.aiLongformMode === true ? '开' : '关'],
        ['声音模式', value.voiceMode || '未设置']
      ];
    }
    const visible = rows.filter(([, content]) => String(content || '').trim()).slice(0, 7);
    return visible.length
      ? visible.map(([label, content]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(String(content).slice(0, 240))}</dd></div>`).join('')
      : '<div><dt>内容</dt><dd>这一版没有填写内容</dd></div>';
  }

  function conflictMarkup(conflict, index) {
    const groupLabels = {
      personaProfile: 'TA的固定资料',
      relationshipProfile: '关系基础',
      storyOpening: '历史兼容资料',
      userRelationProfile: '当前TA的相处偏好',
      datingUserProfile: '我的资料',
      datingRelationship: '关系日期与纪念日',
      instanceSettings: '当前角色聊天设置'
    };
    const candidates = Array.isArray(conflict?.candidates)
      ? conflict.candidates
      : [conflict?.candidateA, conflict?.candidateB].filter(Boolean);
    const conflictCount = Math.max(1, Number(conflict?.conflictCount || 1));
    return `
      <article class="shex-character-conflict" data-character-conflict="${escapeHtml(conflict?.id || '')}">
        <header><span>待处理冲突 ${index + 1}</span><strong>${escapeHtml(groupLabels[conflict?.group] || '角色资料')}</strong></header>
        <p>${conflictCount > 1 ? `已汇总这个资料组的 ${conflictCount} 条冲突。` : ''}请对照全部候选版本，只需选择一次最终要留下的内容。</p>
        <div class="shex-character-conflict-choices">
          ${candidates.map((candidate, candidateIndex) => `
            <section>
              <h3>版本 ${candidateIndex + 1}</h3>
              <dl>${candidateRows(conflict?.group, candidate)}</dl>
              <button type="button" data-character-resolve-conflict="${escapeHtml(conflict?.id || '')}" data-character-candidate-hash="${escapeHtml(candidate?.hash || '')}">保留这个版本</button>
            </section>
          `).join('')}
        </div>
      </article>
    `;
  }

  function groupedConflicts(conflicts) {
    const byGroup = new Map();
    conflicts.forEach((conflict) => {
      const group = String(conflict?.group || '');
      if (!group) return;
      if (!byGroup.has(group)) {
        byGroup.set(group, {
          id: String(conflict?.id || ''),
          group,
          conflictCount: 0,
          candidates: [],
          candidateHashes: new Set()
        });
      }
      const entry = byGroup.get(group);
      entry.conflictCount += 1;
      [conflict?.candidateA, conflict?.candidateB].filter(Boolean).forEach((candidate) => {
        const hash = String(candidate?.hash || '');
        if (!hash || entry.candidateHashes.has(hash)) return;
        entry.candidateHashes.add(hash);
        entry.candidates.push(candidate);
      });
    });
    return Array.from(byGroup.values()).map(({ candidateHashes, ...entry }) => entry);
  }

  function conflictsMarkup(conflicts) {
    if (!conflicts.length) return '';
    const groups = groupedConflicts(conflicts);
    return `
      <section class="shex-character-conflicts" role="alert" aria-labelledby="shexCharacterConflictTitle">
        <h2 id="shexCharacterConflictTitle">先处理资料冲突</h2>
        <p>检测到两台设备修改了同一组资料。选择前，受影响的内容只能查看，不能继续保存。</p>
        ${groups.map(conflictMarkup).join('')}
      </section>
    `;
  }

  function taPanel(profile, dreamName) {
    const basic = profile.basic || {};
    const world = profile.world || {};
    const identity = profile.identity || {};
    const appearance = profile.appearance || {};
    const personality = profile.personality || {};
    const dailyLife = profile.dailyLife || {};
    const speech = profile.speech || {};
    const preferences = profile.preferences || {};
    const modes = {
      world: contentMode('world', Boolean(world.worldType), Boolean(world.customWorld)),
      identity: contentMode('identity', Boolean(identity.tags?.length), Boolean(identity.customIdentity)),
      personality: contentMode('personality', Boolean(personality.tags?.length), Boolean(personality.core)),
      dailyLife: contentMode('dailyLife', Boolean(dailyLife.tags?.length), Boolean(dailyLife.goalsAndRoutine)),
      speech: contentMode('speech', Boolean(speech.amount || speech.tones?.length || speech.habits?.length), Boolean(speech.freeform)),
      preferences: contentMode('preferences', Boolean(preferences.tags?.length), Boolean(preferences.freeform))
    };
    const predefinedPersonalityTags = new Set(PERSONALITY_GROUPS.flatMap((group) => group.values));
    const customPersonalityTags = (personality.tags || []).filter((value) => !predefinedPersonalityTags.has(value));
    return `
      <div class="shex-character-section" data-character-section="ta">
        <section class="shex-character-card shex-character-guidance">
          <h2>固定角色档案</h2>
          <p>这里写TA长期稳定的资料，不填写今天、刚刚、最近发生的临时剧情。标签与自由填写冲突时，以自由填写为准。</p>
        </section>

        <section class="shex-character-card">
          <h2>基础资料</h2>
          <label><span>梦角昵称</span><input type="text" maxlength="80" value="${escapeHtml(basic.displayName || dreamName)}" data-character-basic-display-name></label>
          <label><span>性别</span><input type="text" maxlength="30" value="${escapeHtml(basic.gender || '')}" placeholder="例如：女性、男性、非二元" data-character-basic-gender></label>
          <label><span>自称</span><input type="text" maxlength="30" value="${escapeHtml(basic.selfReference || basic.genderSelfReference || '')}" placeholder="例如：我、本宫、在下" data-character-basic-self-reference></label>
          <label><span>年龄</span><input type="text" maxlength="40" value="${escapeHtml(basic.age || '')}" placeholder="可以写具体年龄或年龄阶段" data-character-basic-age></label>
        </section>

        <section class="shex-character-card" data-character-mode-section="world">
          ${modeHeaderMarkup('所处世界', 'world', modes.world)}
          <div ${modePanelAttributes('world', 'tags', modes.world)}>
            <small>选择一个主要世界标签。</small>
            <div class="shex-character-tags is-single" data-character-choice-container="worldType">${profileChoiceButtons(WORLD_TYPES, world.worldType ? [world.worldType] : [], 'data-character-world-type', { group: 'worldType', maxItems: 1, single: true })}</div>
          </div>
          <div ${modePanelAttributes('world', 'custom', modes.world)}>
            <label><span>自定义世界设定</span><small>可以直接写具体世界名称或简短设定，不需要把内容拆成标签。</small><textarea maxlength="80" placeholder="例如：架空的蒸汽朋克海港城" data-character-world-custom>${escapeHtml(world.customWorld || '')}</textarea></label>
          </div>
        </section>

        <section class="shex-character-card" data-character-mode-section="identity">
          ${modeHeaderMarkup('身份／职业', 'identity', modes.identity)}
          <div ${modePanelAttributes('identity', 'tags', modes.identity)}>
            <small>最多选择8个标签。</small>
            <div class="shex-character-tags" data-character-choice-container="identity">${profileChoiceButtons(IDENTITY_TAGS, identity.tags, 'data-character-identity-tag', { group: 'identity', maxItems: 8 })}</div>
          </div>
          <div ${modePanelAttributes('identity', 'custom', modes.identity)}>
            <label><span>自定义身份说明</span><small>直接描述TA的身份、职业或社会位置，不需要拆成标签。</small><textarea maxlength="80" placeholder="例如：王室直属的星象记录官" data-character-identity-custom>${escapeHtml(identity.customIdentity || '')}</textarea></label>
          </div>
        </section>

        <section class="shex-character-card shex-character-appearance-card">
          <h2>外貌和细节</h2>
          <textarea maxlength="900" aria-label="外貌和细节" data-character-appearance-freeform>${escapeHtml(appearanceEditorText(appearance))}</textarea>
        </section>

        <section class="shex-character-card"><label><span>背景与身份</span><small>写家庭、经历、职业细节和长期世界观，不写此刻的临时状态。</small><textarea maxlength="800" data-character-background-summary>${escapeHtml(profile.background?.summary || '')}</textarea></label></section>

        <section class="shex-character-card" data-character-mode-section="personality">
          ${modeHeaderMarkup('性格设定', 'personality', modes.personality)}
          <div ${modePanelAttributes('personality', 'tags', modes.personality)}>
            <small>最多选择8个标签；历史自定义标签会继续保留并显示，但不再提供新增入口。</small>
            ${PERSONALITY_GROUPS.map((group) => `<h3 class="shex-character-subtitle">${escapeHtml(group.label)}</h3><div class="shex-character-tags" data-character-choice-container="personality">${profileChoiceButtons(group.values, (personality.tags || []).filter((value) => group.values.includes(value)), 'data-character-personality-tag', { group: 'personality', maxItems: 8 })}</div>`).join('')}
            <div class="shex-character-tags shex-character-custom-values" data-character-custom-choice-container="personality">${profileChoiceButtons([], customPersonalityTags, 'data-character-personality-tag', { group: 'personality', maxItems: 8 })}</div>
          </div>
          <div ${modePanelAttributes('personality', 'custom', modes.personality)}>
            <label><span>核心性格</span><small>可以自由写别人眼里的TA、真实内在、最在意和害怕的事，以及这些性格会怎样影响行为。</small><textarea maxlength="400" data-character-personality-core>${escapeHtml(personality.core || '')}</textarea></label>
          </div>
        </section>

        <section class="shex-character-card" data-character-mode-section="dailyLife">
          ${modeHeaderMarkup('日常生活与个人目标', 'dailyLife', modes.dailyLife)}
          <div ${modePanelAttributes('dailyLife', 'tags', modes.dailyLife)}>
            <div class="shex-character-tags" data-character-choice-container="dailyLife">${profileChoiceButtons(DAILY_LIFE_TAGS, dailyLife.tags, 'data-character-daily-tag', { group: 'dailyLife', maxItems: 12 })}</div>
          </div>
          <div ${modePanelAttributes('dailyLife', 'custom', modes.dailyLife)}>
            <label><span>生活与长期目标</span><small>自由描述TA平时怎样生活，以及工作、朋友、家人、兴趣和长期目标。</small><textarea maxlength="400" data-character-daily-freeform>${escapeHtml(dailyLife.goalsAndRoutine || '')}</textarea></label>
          </div>
        </section>

        <section class="shex-character-card" data-character-mode-section="speech">
          ${modeHeaderMarkup('说话方式', 'speech', modes.speech)}
          <div ${modePanelAttributes('speech', 'tags', modes.speech)}>
            <h3 class="shex-character-subtitle">话量</h3>
            <div class="shex-character-tags is-single" data-character-choice-container="speechAmount">${profileChoiceButtons(SPEECH_AMOUNTS, speech.amount ? [speech.amount] : [], 'data-character-speech-amount', { group: 'speechAmount', maxItems: 1, single: true })}</div>
            <h3 class="shex-character-subtitle">语气（最多3个）</h3>
            <div class="shex-character-tags" data-character-choice-container="speechTones">${profileChoiceButtons(SPEECH_TONES, speech.tones, 'data-character-speech-tone', { group: 'speechTones', maxItems: 3 })}</div>
            <h3 class="shex-character-subtitle">表达习惯</h3>
            <div class="shex-character-tags" data-character-choice-container="speechHabits">${profileChoiceButtons(SPEECH_HABITS, speech.habits, 'data-character-speech-habit', { group: 'speechHabits', maxItems: 12 })}</div>
          </div>
          <div ${modePanelAttributes('speech', 'custom', modes.speech)}>
            <label><span>说话方式补充</span><small>自由填写可以直接执行的表达规则、常用称呼和绝对不会使用的表达。</small><textarea maxlength="400" placeholder="情绪起伏越大话越少；生气时只沉默不喧闹；从不主动说温柔的话，只在行动上让步" data-character-speech-freeform>${escapeHtml(speech.freeform || '')}</textarea></label>
          </div>
        </section>

        <section class="shex-character-card" data-character-mode-section="preferences">
          ${modeHeaderMarkup('喜好与小习惯', 'preferences', modes.preferences)}
          <div ${modePanelAttributes('preferences', 'tags', modes.preferences)}>
            <div class="shex-character-tags" data-character-choice-container="preferences">${profileChoiceButtons(PREFERENCE_TAGS, preferences.tags, 'data-character-preference-tag', { group: 'preferences', maxItems: 12 })}</div>
          </div>
          <div ${modePanelAttributes('preferences', 'custom', modes.preferences)}>
            <label><span>喜好补充</span><small>直接描述TA喜欢、讨厌或反复出现的小习惯，不需要拆成标签。</small><textarea maxlength="400" data-character-preference-freeform>${escapeHtml(preferences.freeform || '')}</textarea></label>
          </div>
        </section>

        <section class="shex-character-card"><label><span>TA的原则与不能接受的事</span><small>填写角色本人的原则，不填写用户不希望看到的聊天表现。</small><textarea maxlength="400" data-character-principles-freeform>${escapeHtml(profile.principles?.freeform || '')}</textarea></label></section>

        <section class="shex-character-card">
          <h2>示例对话</h2>
          <small>这是锁定TA语气最有效的方式，建议填写2到3组。最多5个情境、总计800字；只帮助AI理解表达，不逐字照抄，也不视为已经发生的事实。</small>
          
          <datalist id="shexCharacterDialogueScenes">${DIALOGUE_SCENES.map((value) => `<option value="${escapeHtml(value)}"></option>`).join('')}</datalist>
          <div data-character-dialogues>${dialogueRows(profile.exampleDialogues)}</div>
          <button class="shex-character-add-dialogue" type="button" data-character-add-dialogue>＋ 新增情境</button>
          <p class="shex-character-counter" data-character-dialogue-counter>0 / 800字</p>
        </section>

        <section class="shex-character-card"><label><span>其他补充</span><small>填写前面没有覆盖的长期内容；与其他专门字段冲突时，以专门字段为准。</small><textarea maxlength="2000" data-character-other-freeform>${escapeHtml(profile.other?.freeform || '')}</textarea></label></section>
        <button class="shex-character-save" type="button" data-character-save-ta>保存TA的资料</button>
      </div>
    `;
  }

  function relationshipPanel(relationshipProfile, dream) {
    const anniversaries = Array.isArray(dream?.datingAnniversaries) ? dream.datingAnniversaries : [];
    const foundation = relationshipProfile?.foundation || {};
    return `
      <div class="shex-character-section" data-character-section="relationship">
        <section class="shex-character-card" data-character-edit-group="relationshipProfile">
          <h2>关系基础</h2>
          <h3 class="shex-character-subtitle">你们是什么关系</h3>
          <div class="shex-character-tags is-single">${profileChoiceButtons(RELATIONSHIP_IDENTITIES, foundation.identity ? [foundation.identity] : [], 'data-character-relationship-identity', { group: 'relationshipIdentity', maxItems: 1, single: true })}</div>
          <h3 class="shex-character-subtitle">相处模式（最多3个）</h3>
          <div class="shex-character-tags">${profileChoiceButtons(RELATIONSHIP_DYNAMICS, foundation.dynamics, 'data-character-relationship-dynamic', { group: 'relationshipDynamics', maxItems: 3 })}</div>
          <h3 class="shex-character-subtitle">关系发展</h3>
          <div class="shex-character-tags is-single">${profileChoiceButtons(RELATIONSHIP_DEVELOPMENT, foundation.developmentMode ? [foundation.developmentMode] : [], 'data-character-relationship-development', { group: 'relationshipDevelopment', maxItems: 1, single: true })}</div>
          <h3 class="shex-character-subtitle">发展速度</h3>
          <div class="shex-character-tags is-single">${profileChoiceButtons(RELATIONSHIP_SPEEDS, foundation.speed ? [foundation.speed] : [], 'data-character-relationship-speed', { group: 'relationshipSpeed', maxItems: 1, single: true })}</div>
          <label><span>关系补充</span><small>可以写如何认识、已有的共同经历，以及关系里长期存在的问题。</small><textarea maxlength="600" data-character-relationship-freeform>${escapeHtml(foundation.freeform || '')}</textarea></label>
        </section>
        <button class="shex-character-save" type="button" data-character-save-relationship>保存关系资料</button>
        <section class="shex-character-card shex-character-summary-card">
          <h2>关系记录</h2>
          <div><span>在一起时间</span><strong>${escapeHtml(dream?.datingTogetherSince || '未设置')}</strong></div>
          <div><span>纪念日</span><strong>${anniversaries.length} 条</strong></div>
          <button type="button" data-character-open-anniversaries>去X约会管理纪念日</button>
        </section>
      </div>
    `;
  }

  function mePanel(userRelation, userProfile) {
    const modes = {
      userPersonality: contentMode('userPersonality', userProfile.personalityTags?.length, userProfile.personalityCustom),
      userCareer: contentMode('userCareer', userProfile.career, userProfile.careerCustom),
      userHobbies: contentMode('userHobbies', userProfile.hobbies?.length, userProfile.hobbiesCustom)
    };
    return `
      <div class="shex-character-section" data-character-section="me">
        <section class="shex-character-card" data-character-edit-group="datingUserProfile">
          <h2>我的资料</h2>
          <label><span>MBTI</span><select data-character-user-mbti>${optionMarkup(MBTI_TYPES, userProfile.mbti)}</select></label>
          <label><span>星座</span><select data-character-user-zodiac>${optionMarkup(ZODIACS, userProfile.zodiac)}</select></label>
        </section>
        <section class="shex-character-card" data-character-edit-group="datingUserProfile">
          ${modeHeaderMarkup('我的性格', 'userPersonality', modes.userPersonality)}
          <div ${modePanelAttributes('userPersonality', 'tags', modes.userPersonality)}>
            <div class="shex-character-tags">${tagButtons(USER_PERSONALITY_TAGS, userProfile.personalityTags, 'data-character-user-tag')}</div>
          </div>
          <div ${modePanelAttributes('userPersonality', 'custom', modes.userPersonality)}>
            <label><span>我的性格</span><textarea maxlength="400" data-character-user-personality-custom>${escapeHtml(userProfile.personalityCustom)}</textarea></label>
          </div>
        </section>
        <section class="shex-character-card" data-character-edit-group="datingUserProfile">
          ${modeHeaderMarkup('我的职业', 'userCareer', modes.userCareer)}
          <div ${modePanelAttributes('userCareer', 'tags', modes.userCareer)}>
            <div class="shex-character-tags is-single">${tagButtons(USER_CAREERS, userProfile.career ? [userProfile.career] : [], 'data-character-user-career')}</div>
          </div>
          <div ${modePanelAttributes('userCareer', 'custom', modes.userCareer)}>
            <label><span>我的职业</span><textarea maxlength="400" data-character-user-career-custom>${escapeHtml(userProfile.careerCustom)}</textarea></label>
          </div>
        </section>
        <section class="shex-character-card" data-character-edit-group="datingUserProfile">
          ${modeHeaderMarkup('我的爱好', 'userHobbies', modes.userHobbies)}
          <div ${modePanelAttributes('userHobbies', 'tags', modes.userHobbies)}>
            <div class="shex-character-tags">${tagButtons(USER_HOBBIES, userProfile.hobbies, 'data-character-user-hobby')}</div>
          </div>
          <div ${modePanelAttributes('userHobbies', 'custom', modes.userHobbies)}>
            <label><span>我的爱好</span><textarea maxlength="400" data-character-user-hobbies-custom>${escapeHtml(userProfile.hobbiesCustom)}</textarea></label>
          </div>
        </section>
        <section class="shex-character-card" data-character-edit-group="datingUserProfile">
          <h2>我的信息</h2>
          <label><span>我的信息</span><textarea maxlength="1000" placeholder="可以写你愿意分享的个人情况、生活近况或想让TA了解的事。" data-character-user-about-me>${escapeHtml(userProfile.aboutMe)}</textarea></label>
        </section>
        <button class="shex-character-save" type="button" data-character-save-user-profile>保存我的资料</button>
        <section class="shex-character-card" data-character-edit-group="userRelationProfile">
          <h2>只和这个TA有关</h2>
          <label><span>TA对你的称呼</span><input type="text" maxlength="40" value="${escapeHtml(userRelation.userCall)}" data-character-user-call></label>
        </section>
        <section class="shex-character-card" data-character-edit-group="userRelationProfile"><h2>希望TA怎样和我相处</h2><div class="shex-character-tags">${profileChoiceButtons(INTERACTION_PREFERENCES, userRelation.interactionTags, 'data-character-interaction-tag', { group: 'interactionPreferences', maxItems: 6 })}</div></section>
        <section class="shex-character-card" data-character-edit-group="userRelationProfile"><label><span>相处偏好补充</span><small>只写希望这个TA怎样回应你；不需要填写真实姓名、住址、单位、健康或支付信息。</small><textarea maxlength="400" data-character-user-relation-freeform>${escapeHtml(userRelation.freeform || '')}</textarea></label></section>
        <button class="shex-character-save" type="button" data-character-save-me>保存相处偏好</button>
      </div>
    `;
  }

  // X103：资料冲突由保存链自动处理（保留当前使用的版本，后续保存按字段自动合并），
  // 不再展示"选择要保留的版本"，也不再锁住编辑区。
  function conflictsSettleAutomatically() {
    return typeof window.SHEXCharacterProfileData?.autoResolveConflicts === 'function';
  }

  let conflictSettleInFlight = false;
  function settleConflictsQuietly() {
    if (!conflictsSettleAutomatically() || conflictSettleInFlight || !unresolvedConflicts().length) return;
    const dreamId = editorState.dreamId;
    const signature = () => {
      try { return JSON.stringify([characterFor(), relationshipFor(), userRelationFor(), userProfileFor()]); } catch (_) { return ''; }
    };
    const before = signature();
    conflictSettleInFlight = true;
    Promise.resolve(window.SHEXCharacterProfileData.autoResolveConflicts(dreamId)).catch(() => 0).then(() => {
      conflictSettleInFlight = false;
      if (editorState.dreamId !== dreamId || !document.querySelector('#xCharacterProfilePanel [data-character-profile-mount]')) return;
      // 内容没变时只刷新版本基线，避免打断正在输入的内容；内容变了才重绘。
      if (signature() !== before && !existingSaveInProgress && !importSaveInProgress) { render(); return; }
      Object.keys(editorState.revisions || {}).forEach((group) => {
        editorState.revisions[group] = Number(groupState(group).revision || 0);
      });
    });
  }

  function lockGroup(groupName) {
    const panel = document.querySelector('#xCharacterProfilePanel');
    if (conflictsSettleAutomatically()) return;
    if (!panel || !groupState(groupName).hasConflict) return;
    const selector = groupName === 'userRelationProfile'
      ? '[data-character-edit-group="userRelationProfile"] input, [data-character-edit-group="userRelationProfile"] textarea, [data-character-edit-group="userRelationProfile"] button, [data-character-save-me]'
      : groupName === 'relationshipProfile'
        ? '[data-character-edit-group="relationshipProfile"] input, [data-character-edit-group="relationshipProfile"] textarea, [data-character-edit-group="relationshipProfile"] button, [data-character-save-relationship]'
        : groupName === 'datingUserProfile'
          ? '[data-character-edit-group="datingUserProfile"] input, [data-character-edit-group="datingUserProfile"] select, [data-character-edit-group="datingUserProfile"] textarea, [data-character-edit-group="datingUserProfile"] button, [data-character-save-user-profile]'
          : '[data-character-section="ta"] input, [data-character-section="ta"] select, [data-character-section="ta"] textarea, [data-character-section="ta"] button';
    panel.querySelectorAll(selector).forEach((control) => {
      control.disabled = true;
      control.setAttribute('aria-disabled', 'true');
      control.setAttribute('title', '请先在页面上方选择要保留的版本');
    });
  }

  function render() {
    cancelImport();
    const panel = document.querySelector('#xCharacterProfilePanel');
    const mount = panel?.querySelector('[data-character-profile-mount]');
    if (!panel || !mount) return;
    const dream = currentDream();
    if (!dream) {
      mount.innerHTML = '<section class="shex-character-empty"><h1>还没有梦角</h1><p>先创建梦角，再来建立角色资料。</p></section>';
      return;
    }
    const persona = personaFor();
    const character = characterFor();
    const relationshipProfile = relationshipFor();
    const userRelation = userRelationFor();
    const userProfile = userProfileFor();
    const conflicts = conflictsSettleAutomatically() ? [] : unresolvedConflicts();
    editorState.revisions = {
      personaProfile: Number(groupState('personaProfile').revision || 0),
      relationshipProfile: Number(groupState('relationshipProfile').revision || 0),
      userRelationProfile: Number(groupState('userRelationProfile').revision || 0),
      datingUserProfile: Number(groupState('datingUserProfile').revision || 0),
      datingRelationship: Number(groupState('datingRelationship').revision || 0),
      instanceSettings: Number(groupState('instanceSettings').revision || 0)
    };
    const tab = ['ta', 'relationship', 'me'].includes(editorState.tab) ? editorState.tab : 'ta';
    const dreamName = String(dream.name || '梦角').trim() || '梦角';
    mount.innerHTML = `
      <main class="shex-character-profile">
        <header class="shex-character-header">
          <button type="button" data-character-profile-back aria-label="返回">‹</button>
          <div><small>CHARACTER PROFILE</small><h1>${escapeHtml(dreamName)}的角色资料</h1><p>所有AI调用的角色设定都从这里读取。</p></div>
          <button type="button" class="shex-character-import" data-character-import${existingSaveInProgress || importSaveInProgress ? ' disabled' : ''}>导入</button>
          <input type="file" data-character-import-file accept=".json,.png,application/json,image/png" hidden>
        </header>
        ${conflictsMarkup(conflicts)}
        <nav class="shex-character-tabs" role="tablist" aria-label="角色资料分区">
          <button class="${tab === 'ta' ? 'is-active' : ''}" type="button" data-character-tab="ta" role="tab" aria-selected="${tab === 'ta'}">TA</button>
          <button class="${tab === 'relationship' ? 'is-active' : ''}" type="button" data-character-tab="relationship" role="tab" aria-selected="${tab === 'relationship'}">关系</button>
          <button class="${tab === 'me' ? 'is-active' : ''}" type="button" data-character-tab="me" role="tab" aria-selected="${tab === 'me'}">我</button>
        </nav>
        ${tab === 'ta' ? taPanel(character, dreamName) : tab === 'relationship' ? relationshipPanel(relationshipProfile, dream) : mePanel(userRelation, userProfile)}
        <p class="shex-character-status" data-character-profile-status aria-live="polite"></p>
      </main>
    `;
    lockGroup('personaProfile');
    lockGroup('relationshipProfile');
    lockGroup('userRelationProfile');
    lockGroup('datingUserProfile');
    bindEvents(mount);
    settleConflictsQuietly();
    updateDialogueCounter(mount);
    editorState.taEditSignature = taEditSignature(mount);
    mount.scrollTop = 0;
  }

  // 只比较可编辑控件，排除名字；后台资料更新不应变成用户的编辑意图。
  function taEditSignature(root) {
    return JSON.stringify(Array.from(root.querySelectorAll('input, textarea, select, [data-character-choice-group]'))
      .filter(node => !node.matches('[data-character-basic-display-name], input[type="file"]'))
      .map(node => [node.tagName, node.type || '', node.value ?? '',
        node.dataset.characterChoiceGroup || '', node.classList.contains('is-active')]));
  }

  function selectedValues(root, selector, datasetKey) {
    return Array.from(root.querySelectorAll(`${selector}.is-active`))
      .map((item) => String(item.dataset[datasetKey] || '').trim())
      .filter(Boolean);
  }

  function selectedValue(root, selector, datasetKey) {
    return String(root.querySelector(`${selector}.is-active`)?.dataset?.[datasetKey] || '').trim();
  }

  function dialogueDraft(root) {
    return Array.from(root.querySelectorAll('[data-character-dialogue-row]')).map((row) => ({
      scene: String(row.querySelector('[data-character-dialogue-scene]')?.value || '').trim(),
      content: String(row.querySelector('[data-character-dialogue-content]')?.value || '').trim()
    })).filter((item) => item.scene || item.content);
  }

  function dialogueCharacterCount(root) {
    return dialogueDraft(root).reduce((total, item) => total + Array.from(item.scene).length + Array.from(item.content).length, 0);
  }

  function updateDialogueCounter(root) {
    const counter = root.querySelector('[data-character-dialogue-counter]');
    if (!counter) return;
    const used = dialogueCharacterCount(root);
    counter.textContent = `${used} / 800字`;
    counter.classList.toggle('is-over-limit', used > 800);
  }

  function refreshDialogueRows(root) {
    const rows = Array.from(root.querySelectorAll('[data-character-dialogue-row]'));
    rows.forEach((row, index) => {
      const label = row.querySelector('[data-character-dialogue-label]');
      if (label) label.textContent = `情境 ${index + 1}`;
    });
    const addButton = root.querySelector('[data-character-add-dialogue]');
    if (addButton) {
      addButton.disabled = rows.length >= 5;
      addButton.textContent = rows.length >= 5 ? '已达到5个情境' : '＋ 新增情境';
    }
    updateDialogueCounter(root);
  }

  function bindDialogueRow(root, row) {
    row.querySelectorAll('[data-character-dialogue-scene], [data-character-dialogue-content]').forEach((field) => {
      field.addEventListener('input', () => updateDialogueCounter(root));
    });
    row.querySelector('[data-character-remove-dialogue]')?.addEventListener('click', () => {
      const rows = root.querySelectorAll('[data-character-dialogue-row]');
      if (rows.length <= 1) {
        row.querySelectorAll('input, textarea').forEach((field) => { field.value = ''; });
      } else {
        row.remove();
      }
      refreshDialogueRows(root);
    });
  }

  async function saveTa(root) {
    const button = root.querySelector('[data-character-save-ta]');
    const displayName = String(root.querySelector('[data-character-basic-display-name]')?.value || '').trim();
    if (!displayName) {
      status('请先填写梦角昵称', 'error');
      root.querySelector('[data-character-basic-display-name]')?.focus();
      return;
    }
    if (dialogueCharacterCount(root) > 800) {
      status('示例对话总计不能超过800字，请删减后再保存', 'error');
      root.querySelector('[data-character-dialogue-counter]')?.scrollIntoView?.({ block: 'center' });
      return;
    }
    if (button) button.disabled = true;
    const current = characterFor();
    const profile = {
      ...current,
      basic: {
        ...current.basic,
        displayName,
        gender: String(root.querySelector('[data-character-basic-gender]')?.value || '').trim(),
        selfReference: String(root.querySelector('[data-character-basic-self-reference]')?.value || '').trim(),
        age: String(root.querySelector('[data-character-basic-age]')?.value || '').trim()
      },
      world: {
        worldType: selectedValue(root, '[data-character-world-type]', 'characterWorldType'),
        customWorld: String(root.querySelector('[data-character-world-custom]')?.value || '').trim()
      },
      identity: {
        tags: selectedValues(root, '[data-character-identity-tag]', 'characterIdentityTag'),
        customIdentity: String(root.querySelector('[data-character-identity-custom]')?.value || '').trim(),
        primaryLanguages: Array.isArray(current.identity?.primaryLanguages) ? current.identity.primaryLanguages : []
      },
      appearance: splitAppearanceEditorText(root.querySelector('[data-character-appearance-freeform]')?.value),
      background: { summary: String(root.querySelector('[data-character-background-summary]')?.value || '').trim() },
      personality: {
        tags: selectedValues(root, '[data-character-personality-tag]', 'characterPersonalityTag'),
        core: String(root.querySelector('[data-character-personality-core]')?.value || '').trim()
      },
      dailyLife: {
        tags: selectedValues(root, '[data-character-daily-tag]', 'characterDailyTag'),
        goalsAndRoutine: String(root.querySelector('[data-character-daily-freeform]')?.value || '').trim()
      },
      speech: {
        amount: selectedValue(root, '[data-character-speech-amount]', 'characterSpeechAmount'),
        tones: selectedValues(root, '[data-character-speech-tone]', 'characterSpeechTone'),
        habits: selectedValues(root, '[data-character-speech-habit]', 'characterSpeechHabit'),
        // 当前阶段不开放语言选择，但保留正式字段，未来重新开放时无需迁移结构。
        languages: ['普通话'],
        needsTranslation: false,
        freeform: String(root.querySelector('[data-character-speech-freeform]')?.value || '').trim()
      },
      preferences: {
        tags: selectedValues(root, '[data-character-preference-tag]', 'characterPreferenceTag'),
        freeform: String(root.querySelector('[data-character-preference-freeform]')?.value || '').trim()
      },
      principles: { freeform: String(root.querySelector('[data-character-principles-freeform]')?.value || '').trim() },
      exampleDialogues: dialogueDraft(root),
      other: { freeform: String(root.querySelector('[data-character-other-freeform]')?.value || '').trim() }
    };
    try {
      const data = window.SHEXCharacterProfileData;
      const nameOnly = taEditSignature(root) === editorState.taEditSignature;
      const ok = nameOnly
        ? await data?.setCharacterDisplayName?.(editorState.dreamId, displayName)
        : await data?.setCharacterProfileV3?.(editorState.dreamId, profile, { baseRevision: editorState.revisions.personaProfile });
      if (ok) {
        render();
        status('TA的资料已保存', 'success');
      } else {
        handleSaveFailure('名字或资料尚未保存，请核对最新资料后再试。', () => {
          if (button) button.disabled = false;
        });
      }
    } catch (error) {
      status(error?.message || 'TA的资料没有保存成功', 'error');
      if (button) button.disabled = false;
    }
  }

  async function saveRelationship(root) {
    const button = root.querySelector('[data-character-save-relationship]');
    if (button) button.disabled = true;
    const profile = {
      ...relationshipFor(),
      foundation: {
        identity: selectedValue(root, '[data-character-relationship-identity]', 'characterRelationshipIdentity'),
        dynamics: selectedValues(root, '[data-character-relationship-dynamic]', 'characterRelationshipDynamic'),
        developmentMode: selectedValue(root, '[data-character-relationship-development]', 'characterRelationshipDevelopment'),
        speed: selectedValue(root, '[data-character-relationship-speed]', 'characterRelationshipSpeed'),
        freeform: String(root.querySelector('[data-character-relationship-freeform]')?.value || '').trim()
      }
    };
    try {
      const ok = await window.SHEXCharacterProfileData?.setRelationshipProfileV1?.(editorState.dreamId, profile, { baseRevision: editorState.revisions.relationshipProfile });
      if (ok) {
        render();
        status('关系资料已保存', 'success');
      } else {
        handleSaveFailure('资料尚未保存，请核对最新资料后再试。', () => {
          if (button) button.disabled = false;
        });
      }
    } catch (error) {
      status(error?.message || '关系资料没有保存成功', 'error');
      if (button) button.disabled = false;
    }
  }

  async function saveUserProfile(root) {
    const button = root.querySelector('[data-character-save-user-profile]');
    if (button) button.disabled = true;
    const current = userProfileFor();
    const profile = {
      ...current,
      mbti: String(root.querySelector('[data-character-user-mbti]')?.value || '').trim(),
      zodiac: String(root.querySelector('[data-character-user-zodiac]')?.value || '').trim(),
      personalityTags: selectedValues(root, '[data-character-user-tag]', 'characterUserTag'),
      personalityCustom: String(root.querySelector('[data-character-user-personality-custom]')?.value || '').trim(),
      career: selectedValue(root, '[data-character-user-career]', 'characterUserCareer'),
      careerCustom: String(root.querySelector('[data-character-user-career-custom]')?.value || '').trim(),
      hobbies: selectedValues(root, '[data-character-user-hobby]', 'characterUserHobby'),
      hobbiesCustom: String(root.querySelector('[data-character-user-hobbies-custom]')?.value || '').trim(),
      aboutMe: String(root.querySelector('[data-character-user-about-me]')?.value || '').trim()
    };
    try {
      const ok = await window.SHEXCharacterProfileData?.setUserProfileV1?.(editorState.dreamId, profile, {
        baseRevision: editorState.revisions.datingUserProfile,
        preserveUserRelation: true
      });
      if (ok) {
        render();
        status('我的资料已保存', 'success');
      } else {
        handleSaveFailure('资料尚未保存，请核对最新资料后再试。', () => {
          if (button) button.disabled = false;
        });
      }
    } catch (error) {
      status(error?.message || '我的资料没有保存成功', 'error');
      if (button) button.disabled = false;
    }
  }

  async function saveMe(root) {
    const button = root.querySelector('[data-character-save-me]');
    if (button) button.disabled = true;
    const profile = {
      ...userRelationFor(),
      userCall: String(root.querySelector('[data-character-user-call]')?.value || '').trim(),
      interactionTags: selectedValues(root, '[data-character-interaction-tag]', 'characterInteractionTag'),
      freeform: String(root.querySelector('[data-character-user-relation-freeform]')?.value || '').trim()
    };
    try {
      const ok = await window.SHEXCharacterProfileData?.setUserRelationProfileV1?.(editorState.dreamId, profile, { baseRevision: editorState.revisions.userRelationProfile });
      if (ok) {
        render();
        status('相处偏好已保存', 'success');
      } else {
        handleSaveFailure('资料尚未保存，请核对最新资料后再试。', () => {
          if (button) button.disabled = false;
        });
      }
    } catch (error) {
      status(error?.message || '相处偏好没有保存成功', 'error');
      if (button) button.disabled = false;
    }
  }

  async function resolveConflict(button) {
    const conflictId = String(button.dataset.characterResolveConflict || '');
    const selectedHash = String(button.dataset.characterCandidateHash || '');
    if (!conflictId || !selectedHash) return;
    const setConflictButtonsDisabled = (disabled) => {
      document.querySelectorAll('[data-character-resolve-conflict]').forEach((item) => {
        if (item.dataset.characterResolveConflict === conflictId) item.disabled = disabled;
      });
    };
    setConflictButtonsDisabled(true);
    try {
      const ok = await window.SHEXCharacterProfileData?.resolveConflict?.(editorState.dreamId, conflictId, selectedHash);
      if (ok) {
        render();
        status('已保留你选择的版本，可以继续编辑了', 'success');
      } else {
        handleSaveFailure('冲突没有处理成功，请重新打开后再试', () => setConflictButtonsDisabled(false));
      }
    } catch (error) {
      status(error?.message || '冲突没有处理成功', 'error');
      setConflictButtonsDisabled(false);
    }
  }

  function toggleProfileChoice(root, choice) {
    const group = String(choice.dataset.characterChoiceGroup || '');
    const isActive = choice.classList.contains('is-active');
    const isSingle = choice.dataset.characterSingleChoice === 'true';
    const maxItems = Number(choice.dataset.characterMaxItems || 0);
    if (isSingle) {
      root.querySelectorAll(`[data-character-choice-group="${group}"]`).forEach((item) => {
        const nextActive = item === choice && !isActive;
        item.classList.toggle('is-active', nextActive);
        item.setAttribute('aria-pressed', String(nextActive));
      });
      return;
    }
    if (!isActive && maxItems > 0 && root.querySelectorAll(`[data-character-choice-group="${group}"].is-active`).length >= maxItems) {
      status(`这一组最多选择${maxItems}个`, 'error');
      return;
    }
    choice.classList.toggle('is-active', !isActive);
    choice.setAttribute('aria-pressed', String(!isActive));
  }

  function setContentMode(root, group, mode) {
    if (!group || !['tags', 'custom'].includes(mode)) return;
    editorState.taModes[group] = mode;
    root.querySelectorAll(`[data-character-content-mode="${group}"]`).forEach((button) => {
      const active = button.dataset.characterContentModeValue === mode;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    root.querySelectorAll(`[data-character-mode-panel="${group}"]`).forEach((panel) => {
      panel.hidden = panel.dataset.characterModePanelValue !== mode;
    });
  }

  function bindEvents(root) {
    root.querySelector('[data-character-profile-back]')?.addEventListener('click', () => {
      cancelImport();
      window.SHEXCloseCharacterProfile?.({ target: editorState.backTarget, dreamId: editorState.dreamId });
    });
    root.querySelector('[data-character-import]')?.addEventListener('click', () => {
      if (existingSaveInProgress || importSaveInProgress) return;
      if (!importerAvailable()) { status('导入工具尚未加载，请刷新后重试。', 'error'); return; }
      root.querySelector('[data-character-import-file]')?.click();
    });
    root.querySelector('[data-character-import-file]')?.addEventListener('change', event => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (file) void prepareImport(root, file);
    });
    root.querySelectorAll('[data-character-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        editorState.tab = String(button.dataset.characterTab || 'ta');
        render();
      });
    });
    root.querySelectorAll('[data-character-user-tag], [data-character-user-hobby]').forEach((button) => {
      button.addEventListener('click', () => {
        const active = button.classList.toggle('is-active');
        button.setAttribute('aria-pressed', String(active));
      });
    });
    root.querySelectorAll('[data-character-choice-group]').forEach((button) => {
      button.addEventListener('click', () => toggleProfileChoice(root, button));
    });
    root.querySelectorAll('[data-character-content-mode]').forEach((button) => {
      button.addEventListener('click', () => {
        setContentMode(root, String(button.dataset.characterContentMode || ''), String(button.dataset.characterContentModeValue || 'tags'));
      });
    });
    root.querySelectorAll('[data-character-user-career]').forEach((button) => {
      button.addEventListener('click', () => {
        root.querySelectorAll('[data-character-user-career]').forEach((item) => {
          const active = item === button;
          item.classList.toggle('is-active', active);
          item.setAttribute('aria-pressed', String(active));
        });
      });
    });
    root.querySelectorAll('[data-character-dialogue-row]').forEach((row) => bindDialogueRow(root, row));
    root.querySelector('[data-character-add-dialogue]')?.addEventListener('click', () => {
      const container = root.querySelector('[data-character-dialogues]');
      const rows = root.querySelectorAll('[data-character-dialogue-row]');
      if (!container || rows.length >= 5) return;
      container.insertAdjacentHTML('beforeend', dialogueRows([{}]));
      bindDialogueRow(root, container.lastElementChild);
      refreshDialogueRows(root);
    });
    root.querySelector('[data-character-save-ta]')?.addEventListener('click', () => runExistingSave(root, () => saveTa(root)));
    root.querySelector('[data-character-save-relationship]')?.addEventListener('click', () => runExistingSave(root, () => saveRelationship(root)));
    root.querySelector('[data-character-save-user-profile]')?.addEventListener('click', () => runExistingSave(root, () => saveUserProfile(root)));
    root.querySelector('[data-character-save-me]')?.addEventListener('click', () => runExistingSave(root, () => saveMe(root)));
    root.querySelectorAll('[data-character-resolve-conflict]').forEach((button) => {
      button.addEventListener('click', () => runExistingSave(root, () => resolveConflict(button)));
    });
    root.querySelector('[data-character-open-anniversaries]')?.addEventListener('click', () => {
      cancelImport();
      window.SHEXCloseCharacterProfile?.({ target: 'anniversaries', dreamId: editorState.dreamId });
    });
    refreshDialogueRows(root);
  }

  function open(dreamId = '', options = {}) {
    cancelImport();
    const dream = currentDream(dreamId);
    if (String(dream?.id || dreamId || '') !== editorState.dreamId) editorState.taModes = Object.create(null);
    editorState.dreamId = String(dream?.id || dreamId || '');
    editorState.tab = ['ta', 'relationship', 'me'].includes(options.tab) ? options.tab : 'ta';
    editorState.backTarget = ['world', 'dating'].includes(options.backTarget) ? options.backTarget : 'world';
    render();
  }

  window.SHEXCharacterProfileEditor = Object.freeze({ open, render });
  // The app can close this page through navigation as well as its own back button.
  new MutationObserver(records => {
    if (importSession && (!importIsCurrent(importSession)
      || records.some(record => String(record.oldValue || '') !== importSession.page))) cancelImport();
  }).observe(document.body, { attributes: true, attributeOldValue: true, attributeFilter: ['data-x-page'] });
})();
