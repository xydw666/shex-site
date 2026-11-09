(function initCharacterCardImport(global, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.SHEXCharacterCardImport = api;
})(typeof window !== 'undefined' ? window : globalThis, function createCharacterCardImportModule() {
  'use strict';

  const IMPORT_VERSION = 'character-card-import-v1-x98';
  const MAX_JSON_FILE_BYTES = 2 * 1024 * 1024;
  const MAX_PNG_FILE_BYTES = 16 * 1024 * 1024;
  const MAX_METADATA_BYTES = 2 * 1024 * 1024;
  const MAX_SAFE_DEPTH = 24;
  const MAX_SAFE_NODES = 30000;
  const MAX_REPORT_ITEMS = 100;
  const BLOCKED_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
  const PNG_SIGNATURE = Object.freeze([137, 80, 78, 71, 13, 10, 26, 10]);

  // An explicit import boundary, not a recursive merge of external extensions.
  // IDs, assets, signed voice bindings, hidden language controls and server state are excluded.
  const IMPORT_FIELDS = Object.freeze({
    'characterProfile.basic.displayName': ['string', 80],
    'characterProfile.basic.gender': ['string', 30],
    'characterProfile.basic.selfReference': ['string', 30],
    'characterProfile.basic.age': ['string', 40],
    'characterProfile.basic.mbti': ['string', 20],
    'characterProfile.basic.zodiac': ['string', 20],
    'characterProfile.world.worldType': ['string', 40],
    'characterProfile.world.customWorld': ['string', 80],
    'characterProfile.identity.tags': ['string_array', 8, 30],
    'characterProfile.identity.customIdentity': ['string', 80],
    'characterProfile.appearance.summary': ['string', 500],
    'characterProfile.appearance.details': ['string', 400],
    'characterProfile.background.summary': ['string', 800],
    'characterProfile.personality.tags': ['string_array', 8, 20],
    'characterProfile.personality.core': ['string', 400],
    'characterProfile.dailyLife.tags': ['string_array', 12, 30],
    'characterProfile.dailyLife.goalsAndRoutine': ['string', 400],
    'characterProfile.speech.amount': ['string', 20],
    'characterProfile.speech.tones': ['string_array', 3, 20],
    'characterProfile.speech.habits': ['string_array', 12, 30],
    'characterProfile.speech.freeform': ['string', 400],
    'characterProfile.preferences.tags': ['string_array', 12, 30],
    'characterProfile.preferences.freeform': ['string', 400],
    'characterProfile.principles.freeform': ['string', 400],
    'characterProfile.exampleDialogues': ['dialogue_array', 5, 800],
    'characterProfile.other.freeform': ['string', 2000],
    'templateDefaults.relationship.identity': ['string', 30],
    'templateDefaults.relationship.dynamics': ['string_array', 3, 30],
    'templateDefaults.relationship.developmentMode': ['string', 30],
    'templateDefaults.relationship.speed': ['string', 30],
    'templateDefaults.relationship.freeform': ['string', 600],
    'templateDefaults.specialTreatment.tags': ['string_array', 8, 30],
    'templateDefaults.specialTreatment.freeform': ['string', 400],
    'templateMetadata.openingText': ['string', 400],
    'templateMetadata.creatorNotes': ['string', 1000],
    'templateMetadata.publicSummary': ['string', 300],
    'templateMetadata.creatorDisplayName': ['string', 40]
  });

  function importError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
  }

  function cleanText(value) {
    return typeof value === 'string' ? value.replace(/\u0000/g, '').trim() : '';
  }

  function safeClone(value, state = { nodes: 0 }, depth = 0) {
    state.nodes += 1;
    if (state.nodes > MAX_SAFE_NODES || depth > MAX_SAFE_DEPTH) {
      throw importError('CHARACTER_CARD_STRUCTURE_TOO_COMPLEX', '角色卡结构过于复杂，无法安全导入');
    }
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (Array.isArray(value)) return value.map(item => safeClone(item, state, depth + 1));
    if (!value || typeof value !== 'object') return null;
    const output = {};
    Object.keys(value).forEach((key) => {
      if (BLOCKED_KEYS.has(key)) throw importError('CHARACTER_CARD_UNSAFE_STRUCTURE', '角色卡包含不安全的结构字段');
      output[key] = safeClone(value[key], state, depth + 1);
    });
    return output;
  }

  function extensionOf(name = '') {
    const match = String(name).toLowerCase().match(/\.([a-z0-9]+)$/);
    return match?.[1] || '';
  }

  function detectFileKind(file = {}) {
    const extension = extensionOf(file.name);
    const type = String(file.type || '').toLowerCase();
    if (extension === 'json' || type === 'application/json') return 'json';
    if (extension === 'png' || type === 'image/png') return 'png';
    throw importError('CHARACTER_CARD_FILE_TYPE_UNSUPPORTED', '只支持 Character Card JSON 或 PNG 文件');
  }

  function assertFileSize(file, kind) {
    const size = Number(file?.size || 0);
    const limit = kind === 'png' ? MAX_PNG_FILE_BYTES : MAX_JSON_FILE_BYTES;
    if (!Number.isFinite(size) || size <= 0) throw importError('CHARACTER_CARD_FILE_EMPTY', '角色卡文件为空');
    if (size > limit) {
      const megabytes = Math.floor(limit / 1024 / 1024);
      throw importError('CHARACTER_CARD_FILE_TOO_LARGE', `角色卡文件过大，${kind.toUpperCase()} 文件不能超过 ${megabytes}MB`);
    }
  }

  function validateCardObject(input) {
    const card = safeClone(input);
    const spec = cleanText(card?.spec);
    const version = cleanText(card?.spec_version);
    const major = spec === 'chara_card_v2' ? 2 : spec === 'chara_card_v3' ? 3 : 0;
    if (!major || !card.data || typeof card.data !== 'object' || Array.isArray(card.data)) {
      throw importError('CHARACTER_CARD_UNSUPPORTED', '这不是受支持的 Character Card V2/V3 文件');
    }
    return { card, major, specVersion: version || `${major}.0` };
  }

  function parseJsonText(text) {
    let value;
    try {
      value = JSON.parse(String(text || '').replace(/^\uFEFF/, ''));
    } catch (_error) {
      throw importError('CHARACTER_CARD_JSON_INVALID', '角色卡 JSON 无法解析');
    }
    return validateCardObject(value);
  }

  function readUint32(bytes, offset) {
    return ((bytes[offset] * 0x1000000) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3]) >>> 0;
  }

  function ascii(bytes) {
    let result = '';
    for (let index = 0; index < bytes.length; index += 1) result += String.fromCharCode(bytes[index]);
    return result;
  }

  function decodeBase64Utf8(value) {
    const normalized = String(value || '').replace(/\s+/g, '');
    if (!normalized || !/^[A-Za-z0-9+/]*={0,2}$/.test(normalized) || normalized.length % 4 === 1) {
      throw importError('CHARACTER_CARD_METADATA_INVALID', 'PNG 中的角色卡元数据不是有效的 Base64');
    }
    try {
      if (typeof Buffer !== 'undefined') return Buffer.from(normalized, 'base64').toString('utf8');
      const binary = globalThis.atob(normalized);
      const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch (_error) {
      throw importError('CHARACTER_CARD_METADATA_INVALID', 'PNG 中的角色卡元数据无法解码');
    }
  }

  function parsePngMetadata(input) {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    if (bytes.length < PNG_SIGNATURE.length || PNG_SIGNATURE.some((value, index) => bytes[index] !== value)) {
      throw importError('CHARACTER_CARD_PNG_INVALID', '文件不是有效的 PNG');
    }
    const candidates = Object.create(null);
    let offset = PNG_SIGNATURE.length;
    let reachedEnd = false;
    while (offset < bytes.length) {
      if (offset + 12 > bytes.length) throw importError('CHARACTER_CARD_PNG_INVALID', 'PNG 文件结构不完整');
      const length = readUint32(bytes, offset);
      const dataStart = offset + 8;
      const dataEnd = dataStart + length;
      const chunkEnd = dataEnd + 4;
      if (length > MAX_PNG_FILE_BYTES || chunkEnd > bytes.length) {
        throw importError('CHARACTER_CARD_PNG_INVALID', 'PNG 文件包含异常数据块');
      }
      const type = ascii(bytes.subarray(offset + 4, offset + 8));
      if (type === 'tEXt') {
        const chunk = bytes.subarray(dataStart, dataEnd);
        const separator = chunk.indexOf(0);
        if (separator > 0) {
          const keyword = ascii(chunk.subarray(0, separator));
          if (keyword === 'chara' || keyword === 'ccv3') {
            const payload = chunk.subarray(separator + 1);
            if (payload.length > MAX_METADATA_BYTES) {
              throw importError('CHARACTER_CARD_METADATA_TOO_LARGE', 'PNG 中的角色卡元数据过大');
            }
            candidates[keyword] = ascii(payload);
          }
        }
      }
      offset = chunkEnd;
      if (type === 'IEND') {
        reachedEnd = true;
        break;
      }
    }
    if (!reachedEnd) throw importError('CHARACTER_CARD_PNG_INVALID', 'PNG 文件缺少结束标记');
    const keyword = candidates.ccv3 ? 'ccv3' : candidates.chara ? 'chara' : '';
    if (!keyword) throw importError('CHARACTER_CARD_METADATA_MISSING', '这张 PNG 没有 Character Card V2/V3 元数据');
    const parsed = parseJsonText(decodeBase64Utf8(candidates[keyword]));
    if (keyword === 'ccv3' && parsed.major !== 3) {
      throw importError('CHARACTER_CARD_METADATA_INVALID', 'ccv3 元数据不是 Character Card V3');
    }
    return { ...parsed, keyword };
  }

  async function parseCharacterCardFile(file = {}) {
    const kind = detectFileKind(file);
    assertFileSize(file, kind);
    if (kind === 'json') {
      if (typeof file.text !== 'function') throw importError('CHARACTER_CARD_FILE_UNREADABLE', '无法读取角色卡 JSON');
      const parsed = parseJsonText(await file.text());
      return {
        format: `character_card_json_v${parsed.major}`,
        specVersion: parsed.specVersion,
        card: parsed.card,
        pngMetadataKeyword: ''
      };
    }
    if (typeof file.arrayBuffer !== 'function') throw importError('CHARACTER_CARD_FILE_UNREADABLE', '无法读取角色卡 PNG');
    const parsed = parsePngMetadata(await file.arrayBuffer());
    return {
      format: `character_card_png_v${parsed.major}`,
      specVersion: parsed.specVersion,
      card: parsed.card,
      pngMetadataKeyword: parsed.keyword
    };
  }

  function parseDialogueExamples(value) {
    const source = cleanText(value);
    if (!source) return [];
    const blocks = source.split(/<START>/i).map(item => item.trim()).filter(Boolean);
    const examples = [];
    blocks.forEach((block) => {
      const lines = block.split(/\r?\n/).map(item => item.trim()).filter(Boolean);
      const sceneLines = [];
      let foundCharacterLine = false;
      lines.forEach((line) => {
        const match = line.match(/^(?:\{\{char\}\}|<char>|<bot>)\s*:\s*(.*)$/i);
        if (match) {
          foundCharacterLine = true;
          if (cleanText(match[1])) examples.push({ scene: sceneLines.join('\n'), content: cleanText(match[1]) });
        } else {
          sceneLines.push(line);
        }
      });
      if (!foundCharacterLine && block) examples.push({ scene: '', content: block });
    });
    return examples;
  }

  function setAt(target, path, value) {
    const parts = path.split('.');
    let current = target;
    parts.slice(0, -1).forEach(key => { current = current[key] ||= {}; });
    current[parts[parts.length - 1]] = value;
  }

  function reportIssue(report, path, code) {
    const message = code === 'truncated' ? '内容超过上限，已安全截短'
      : code === 'invalid' ? '格式不正确，已跳过'
        : code === 'empty' ? '没有有效内容，已跳过'
          : '不支持或需要站内设置，已跳过';
    const issue = { path, code, message };
    if (report.warnings.length < MAX_REPORT_ITEMS) report.warnings.push(issue);
    else report.suppressedWarningCount += 1;
    if (code !== 'truncated') {
      if (report.skipped.length < MAX_REPORT_ITEMS) report.skipped.push(issue);
      else report.suppressedSkippedCount += 1;
    }
  }

  function normalizeImportValue(value, definition, path, report) {
    const clip = (raw, limit, itemPath) => {
      const cleaned = cleanText(raw);
      const chars = Array.from(cleaned);
      if (chars.length > limit) reportIssue(report, itemPath, 'truncated');
      return chars.slice(0, limit).join('');
    };
    if (definition[0] === 'string') {
      if (typeof value !== 'string') { reportIssue(report, path, 'invalid'); return undefined; }
      const result = clip(value, definition[1], path);
      if (!result) { reportIssue(report, path, 'empty'); return undefined; }
      return result;
    }
    if (!Array.isArray(value)) { reportIssue(report, path, 'invalid'); return undefined; }
    const result = [];
    let remaining = definition[2];
    value.forEach((item, index) => {
      const itemPath = `${path}.${index}`;
      if (result.length >= definition[1] || remaining <= 0) { reportIssue(report, itemPath, 'unsupported'); return; }
      if (definition[0] === 'string_array') {
        if (typeof item !== 'string') { reportIssue(report, itemPath, 'invalid'); return; }
        const text = clip(item, definition[2], itemPath);
        if (!text || result.includes(text)) { reportIssue(report, itemPath, 'empty'); return; }
        result.push(text);
        return;
      }
      if (!item || typeof item !== 'object' || Array.isArray(item)) { reportIssue(report, itemPath, 'invalid'); return; }
      Object.keys(item).filter(key => !['scene', 'content', 'text'].includes(key))
        .forEach(key => reportIssue(report, `${itemPath}.${key}`, 'unsupported'));
      const rawContent = item.content ?? item.text ?? '';
      const rawScene = item.scene ?? '';
      if (typeof rawContent !== 'string' || typeof rawScene !== 'string') { reportIssue(report, itemPath, 'invalid'); return; }
      const scene = clip(rawScene, Math.min(80, remaining), `${itemPath}.scene`);
      const content = clip(rawContent, remaining - Array.from(scene).length, `${itemPath}.content`);
      if (!scene && !content) { reportIssue(report, itemPath, 'empty'); return; }
      result.push({ scene, content });
      remaining -= Array.from(scene).length + Array.from(content).length;
    });
    return result.length ? result : undefined;
  }

  function mapCardPayload(data) {
    const payload = {};
    const report = { recognized: [], imported: [], skipped: [], warnings: [], suppressedWarningCount: 0, suppressedSkippedCount: 0 };
    const standard = {
      name: ['characterProfile.basic.displayName'],
      description: ['characterProfile.background.summary', 'templateMetadata.publicSummary'],
      personality: ['characterProfile.personality.core'],
      scenario: ['templateDefaults.relationship.freeform'],
      first_mes: ['templateMetadata.openingText'],
      mes_example: ['characterProfile.exampleDialogues'],
      creator_notes: ['templateMetadata.creatorNotes']
    };
    const accept = (path, value) => {
      if (!report.recognized.includes(path)) report.recognized.push(path);
      const normalized = normalizeImportValue(value, IMPORT_FIELDS[path], path, report);
      if (normalized === undefined) return;
      setAt(payload, path, normalized);
      if (!report.imported.includes(path)) report.imported.push(path);
    };
    Object.keys(data).forEach(key => {
      if (key === 'extensions') return;
      if (!Object.hasOwn(standard, key)) { reportIssue(report, `data.${key}`, 'unsupported'); return; }
      if (key === 'mes_example' && typeof data[key] !== 'string') {
        report.recognized.push('characterProfile.exampleDialogues');
        reportIssue(report, `data.${key}`, 'invalid');
        return;
      }
      standard[key].forEach(path => accept(path, key === 'mes_example' ? parseDialogueExamples(data[key]) : data[key]));
    });
    const walk = (value, path = '') => {
      if (Object.hasOwn(IMPORT_FIELDS, path)) {
        accept(path, value);
        return;
      }
      const allowedParent = !path || Object.keys(IMPORT_FIELDS).some(leaf => leaf.startsWith(`${path}.`));
      if (!allowedParent || !value || typeof value !== 'object' || Array.isArray(value)) {
        reportIssue(report, `data.extensions.shex${path ? `.${path}` : ''}`, allowedParent ? 'invalid' : 'unsupported');
        return;
      }
      Object.entries(value).forEach(([key, child]) => walk(child, path ? `${path}.${key}` : key));
    };
    if (data.extensions !== undefined) {
      if (!data.extensions || typeof data.extensions !== 'object' || Array.isArray(data.extensions)) reportIssue(report, 'data.extensions', 'invalid');
      else Object.entries(data.extensions).forEach(([key, value]) => {
        if (key === 'shex') walk(value);
        else reportIssue(report, `data.extensions.${key}`, 'unsupported');
      });
    }
    if (!report.imported.length) throw importError('CHARACTER_CARD_CONTENT_EMPTY', '角色卡没有可导入的有效内容');
    return { payload, report };
  }

  function toImportDraft(parsed = {}) {
    const validated = validateCardObject(parsed.card);
    const data = validated.card.data;
    const { payload, report } = mapCardPayload(data);
    const name = payload.characterProfile?.basic?.displayName || '';
    return {
      source: {
        format: String(parsed.format || `character_card_json_v${validated.major}`),
        specVersion: String(parsed.specVersion || validated.specVersion)
      },
      draftPayload: payload,
      report,
      dream: { name, avatar: null },
      characterProfile: safeClone(payload.characterProfile || {}),
      relationshipProfile: { foundation: { freeform: payload.templateDefaults?.relationship?.freeform || '' } },
      userRelationProfile: {},
      opening: { primary: payload.templateMetadata?.openingText || '' },
      creator: { publicSummary: payload.templateMetadata?.publicSummary || '', creatorNotes: payload.templateMetadata?.creatorNotes || '' },
      avatarCandidate: {
        available: String(parsed.format || '').includes('_png_'),
        source: String(parsed.format || '').includes('_png_') ? 'uploaded_png' : ''
      },
      unmapped: {}
    };
  }

  function mergeDefined(target, source) {
    const output = safeClone(target && typeof target === 'object' ? target : {});
    Object.entries(source && typeof source === 'object' ? source : {}).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      if (Array.isArray(value)) {
        if (value.length) output[key] = safeClone(value);
        return;
      }
      if (typeof value === 'object') {
        const merged = mergeDefined(output[key], value);
        if (Object.keys(merged).length) output[key] = merged;
        return;
      }
      output[key] = value;
    });
    return output;
  }

  function toCreatorPayload(importDraft = {}, basePayload = {}) {
    const output = safeClone(basePayload && typeof basePayload === 'object' ? basePayload : {});
    if (importDraft.draftPayload) return mergeDefined(output, importDraft.draftPayload);
    output.characterProfile = mergeDefined(output.characterProfile, importDraft.characterProfile);
    const scenario = cleanText(importDraft.relationshipProfile?.foundation?.freeform);
    if (scenario) {
      output.templateDefaults = output.templateDefaults || {};
      output.templateDefaults.relationship = mergeDefined(output.templateDefaults.relationship, { freeform: scenario });
    }
    const opening = cleanText(importDraft.opening?.primary);
    const publicSummary = cleanText(importDraft.creator?.publicSummary);
    const creatorNotes = cleanText(importDraft.creator?.creatorNotes);
    if (opening || publicSummary || creatorNotes) {
      output.templateMetadata = output.templateMetadata || {};
      if (opening) output.templateMetadata.openingText = opening;
      if (publicSummary) output.templateMetadata.publicSummary = publicSummary;
      if (creatorNotes) output.templateMetadata.creatorNotes = creatorNotes;
    }
    return output;
  }

  // Reuse the normalized card and existing defined-value merge. This boundary
  // deliberately excludes publication metadata before any profile save.
  function toDreamProfileUpdate(importDraft = {}, currentProfiles = {}) {
    const payload = importDraft.draftPayload || {};
    const defaults = payload.templateDefaults || {};
    const currentRelationship = currentProfiles.relationshipProfile || {};
    const hasCharacter = Object.keys(payload.characterProfile || {}).length > 0;
    const hasRelationship = Object.keys(defaults.relationship || {}).length > 0
      || Object.keys(defaults.specialTreatment || {}).length > 0;
    const result = {
      groups: [],
      ignoredMetadataFields: Object.keys(payload.templateMetadata || {})
        .filter(key => Object.hasOwn(IMPORT_FIELDS, `templateMetadata.${key}`))
    };
    const merged = toCreatorPayload({ draftPayload: {
      ...(hasCharacter ? { characterProfile: payload.characterProfile } : {}),
      ...(hasRelationship ? { templateDefaults: defaults } : {})
    } }, {
      characterProfile: currentProfiles.characterProfile || {},
      templateDefaults: {
        relationship: currentRelationship.foundation || {},
        specialTreatment: currentRelationship.specialTreatment || {}
      }
    });
    if (hasCharacter) {
      result.characterProfile = merged.characterProfile;
      result.groups.push('personaProfile');
    }
    if (hasRelationship) {
      result.relationshipProfile = {
        ...safeClone(currentRelationship),
        foundation: merged.templateDefaults.relationship,
        specialTreatment: merged.templateDefaults.specialTreatment
      };
      result.groups.push('relationshipProfile');
    }
    return result;
  }

  function valueAt(source, path) {
    return String(path || '').split('.').reduce((value, key) => value?.[key], source);
  }

  function validateCreatorPayload(payload = {}, definitions = []) {
    const issues = [];
    definitions.forEach((definition) => {
      const value = valueAt(payload, definition.path);
      if (value === undefined || value === null || value === '') return;
      if (definition.valueType === 'string_array' && Array.isArray(value)) {
        if (definition.maxItems && value.length > definition.maxItems) {
          issues.push({ path: definition.path, code: 'max_items', actual: value.length, limit: definition.maxItems });
        }
        value.forEach((item, index) => {
          const length = Array.from(String(item || '')).length;
          if (definition.maxItemCharacters && length > definition.maxItemCharacters) {
            issues.push({ path: `${definition.path}.${index}`, code: 'max_item_characters', actual: length, limit: definition.maxItemCharacters });
          }
        });
        return;
      }
      if (definition.valueType === 'dialogue_array' && Array.isArray(value)) {
        if (definition.maxItems && value.length > definition.maxItems) {
          issues.push({ path: definition.path, code: 'max_items', actual: value.length, limit: definition.maxItems });
        }
        const total = value.reduce((sum, item) => sum + Array.from(String(item?.scene || '')).length + Array.from(String(item?.content || item?.text || '')).length, 0);
        if (definition.maxTotalCharacters && total > definition.maxTotalCharacters) {
          issues.push({ path: definition.path, code: 'max_total_characters', actual: total, limit: definition.maxTotalCharacters });
        }
        return;
      }
      const length = Array.from(String(value)).length;
      if (definition.maxCharacters && length > definition.maxCharacters) {
        issues.push({ path: definition.path, code: 'max_characters', actual: length, limit: definition.maxCharacters });
      }
    });
    return issues;
  }

  return Object.freeze({
    IMPORT_VERSION,
    MAX_JSON_FILE_BYTES,
    MAX_PNG_FILE_BYTES,
    MAX_METADATA_BYTES,
    parseCharacterCardFile,
    parsePngMetadata,
    parseDialogueExamples,
    toImportDraft,
    toCreatorPayload,
    toDreamProfileUpdate,
    validateCreatorPayload
  });
});
