(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./pet-state.js'));
  else root.SHEXPetOwnedStorage = factory(root.SHEXPetState);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (defaultStateApi) {
  'use strict';

  const PREFIX = 'shex_pet_local_v2:';
  const ROSTER_PREFIX = 'shex_pet_roster_v1:';
  const SPECIES = Object.freeze(['dog', 'cat', 'rabbit', 'capybara', 'hamster', 'crow']);
  const LEGACY_KEY = 'shex_x_pet_v1';
  const RECOVERED = '小宠物的本地记录无法读取，请保留现场并联系支持';
  const NAME_ERROR = '名字需要是 1 到 12 个字符，且不能包含控制字符';
  const IDENTITY_ERROR = '无法识别当前用户或世界';
  const PLAIN_OBJECT = value => !!value && typeof value === 'object' && !Array.isArray(value);

  function identityParts(identity) {
    if (!PLAIN_OBJECT(identity)) return null;
    const {userId, dreamId} = identity;
    if (typeof userId !== 'string' || !userId.trim() || typeof dreamId !== 'string' || !dreamId.trim()) return null;
    return {userId, dreamId};
  }

  function keyFor(identity, species = 'dog') {
    const parts = identityParts(identity);
    return parts && SPECIES.includes(species) ? `${PREFIX}${encodeURIComponent(parts.userId)}:${encodeURIComponent(parts.dreamId)}${species === 'dog' ? '' : ':' + species}` : null;
  }

  function rosterKeyFor(identity) {
    const parts = identityParts(identity);
    return parts ? `${ROSTER_PREFIX}${encodeURIComponent(parts.userId)}:${encodeURIComponent(parts.dreamId)}` : null;
  }

  function validateName(value) {
    if (typeof value !== 'string') return {ok: false, name: '', error: NAME_ERROR};
    if (/\p{Cc}/u.test(value)) return {ok: false, name: value.trim(), error: NAME_ERROR};
    const name = value.trim();
    const length = Array.from(name).length;
    if (length < 1 || length > 12) return {ok: false, name, error: NAME_ERROR};
    return {ok: true, name, error: ''};
  }

  function createStorage(storageOrNull, stateApi) {
    const states = stateApi || defaultStateApi;
    const memory = new Map();
    const careMemory = new Map();
    const blockedWrites = new Set();
    const pendingRoster = new Set();

    function unavailableResult(state, message = '暂时无法保存') {
      return {ok: false, state: state ? {...state} : null, message};
    }

    function read(identity, species = 'dog') {
      const parts = identityParts(identity), key = keyFor(identity, species);
      if (!parts || !key) return {kind: 'invalid', key: null, parts: null};
      if (memory.has(key)) return {kind: 'memory', key, parts, state: memory.get(key), care: careMemory.get(key)};
      if (!storageOrNull) {
        blockedWrites.add(key);
        return {kind: 'unavailable', key, parts};
      }
      let text;
      try { text = storageOrNull.getItem(key); }
      catch (_) { blockedWrites.add(key); return {kind: 'unavailable', key, parts}; }
      if (text === null) return {kind: 'missing', key, parts};
      let envelope;
      try { envelope = JSON.parse(text); }
      catch (_) { return {kind: 'corrupt', key, parts}; }
      if (!PLAIN_OBJECT(envelope) || envelope.schemaVersion !== 2 || envelope.userId !== parts.userId || envelope.dreamId !== parts.dreamId || !PLAIN_OBJECT(envelope.pet) || envelope.pet.schemaVersion !== 1) {
        return {kind: 'corrupt', key, parts};
      }
      if ((envelope.species !== undefined && envelope.species !== species) || (species !== 'dog' && envelope.pet.species !== undefined && envelope.pet.species !== species)) {
        return {kind: 'corrupt', key, parts};
      }
      const normalized = states.sanitize(envelope.pet, envelope.pet.lastSavedAt);
      const changed = Object.keys(normalized).some(field => normalized[field] !== envelope.pet[field]);
      return {kind: 'record', key, parts, state: normalized, changed, care: envelope.care};
    }

    function write(record, candidate, now, care = record.care) {
      care = care ? JSON.parse(JSON.stringify(care)) : undefined;
      if (record.key && care) careMemory.set(record.key, care);
      const normalized = states.sanitize(candidate, now);
      let saved = normalized;
      if (!record.key || record.kind === 'invalid' || record.kind === 'corrupt' || record.kind === 'missing') {
        return unavailableResult(normalized, record.kind === 'corrupt' ? RECOVERED : IDENTITY_ERROR);
      }
      if (record.kind === 'unavailable' || blockedWrites.has(record.key) || !storageOrNull) {
        memory.set(record.key, normalized);
        return unavailableResult(normalized);
      }
      const stamp = typeof now === 'number' && Number.isFinite(now) && now >= 0 ? Math.min(Number.MAX_SAFE_INTEGER, Math.floor(now)) : normalized.lastSavedAt;
      saved = {...normalized, lastSavedAt: Math.max(normalized.lastSavedAt, stamp)};
      const envelope = {schemaVersion: 2, userId: record.parts.userId, dreamId: record.parts.dreamId, pet: saved, ...(care ? {care} : {})};
      try {
        storageOrNull.setItem(record.key, JSON.stringify(envelope));
        memory.set(record.key, saved);
        return {ok: true, state: {...saved}, message: '已保存'};
      } catch (_) {
        memory.set(record.key, normalized);
        blockedWrites.add(record.key);
        return unavailableResult(normalized);
      }
    }

    function save(identity, state, now, care, species = 'dog') {
      const record = read(identity, species);
      if (record.kind === 'invalid') return unavailableResult(null, IDENTITY_ERROR);
      if (record.kind === 'corrupt') return unavailableResult(null, RECOVERED);
      if (record.kind === 'missing') return unavailableResult(null, '还没有领养小宠物');
      if (record.kind === 'unavailable') {
        const normalized = states.sanitize(state, now);
        memory.set(record.key, normalized);
        return unavailableResult(normalized);
      }
      return write(record, state, now, care === undefined ? record.care : care);
    }

    function loadPet(identity, species, now) {
      const record = read(identity, species);
      if (record.kind === 'invalid') return {state: null, status: 'invalid', notice: IDENTITY_ERROR};
      if (record.kind === 'corrupt') return {state: null, status: 'corrupt', notice: RECOVERED};
      if (record.kind === 'missing') return {state: null, status: 'empty', notice: ''};
      if (record.kind === 'unavailable') return {state: null, status: 'unavailable', notice: '暂时无法保存'};
      const advanced = states.advance(record.state, now);
      const result = write(record, advanced, now);
      const notice = record.changed ? RECOVERED : (result.ok ? '' : result.message);
      return {state: result.state, status: result.ok ? 'saved' : 'unavailable', notice, care: record.care, before: {...record.state}};
    }

    function readRoster(identity) {
      const parts = identityParts(identity), key = rosterKeyFor(identity);
      if (!key) return {kind: 'invalid', parts, key};
      if (!storageOrNull) return {kind: 'unavailable', parts, key};
      let raw;
      try { raw = storageOrNull.getItem(key); }
      catch (_) { return {kind: 'unavailable', parts, key}; }
      if (raw === null) return {kind: 'missing', parts, key};
      let roster;
      try { roster = JSON.parse(raw); }
      catch (_) { return {kind: 'corrupt', parts, key}; }
      if (!PLAIN_OBJECT(roster) || roster.schemaVersion !== 1 || roster.userId !== parts.userId || roster.dreamId !== parts.dreamId || !SPECIES.includes(roster.active) || !Array.isArray(roster.adopted) || roster.adopted.some(species => !SPECIES.includes(species)) || new Set(roster.adopted).size !== roster.adopted.length || (roster.adopted.length ? !roster.adopted.includes(roster.active) : roster.active !== 'dog')) {
        return {kind: 'corrupt', parts, key};
      }
      return {kind: 'record', parts, key, roster: {schemaVersion: 1, active: roster.active, adopted: [...roster.adopted]}};
    }

    function fallbackRoster(identity) {
      const dog = read(identity);
      return {schemaVersion: 1, active: 'dog', adopted: ['record', 'memory'].includes(dog.kind) ? ['dog'] : []};
    }

    function getRoster(identity) {
      const record = readRoster(identity);
      return record.kind === 'record' ? record.roster : fallbackRoster(identity);
    }

    function writeRoster(record, roster) {
      if (!['record', 'missing'].includes(record.kind)) return {ok: false, error: record.kind === 'corrupt' ? RECOVERED : record.kind === 'invalid' ? IDENTITY_ERROR : '暂时无法保存'};
      try {
        // updatedAt 供云端同步判断哪份名单更新（整份取新，不逐项拼）。
        storageOrNull.setItem(record.key, JSON.stringify({schemaVersion: 1, userId: record.parts.userId, dreamId: record.parts.dreamId, active: roster.active, adopted: [...roster.adopted], updatedAt: Date.now()}));
        return {ok: true, error: ''};
      } catch (_) { return {ok: false, error: '小宠物记录已保留，但暂时无法保存领养名单，请重试'}; }
    }

    function adoptPet(identity, species, name, now) {
      const validName = validateName(name);
      if (!validName.ok) return {ok: false, state: null, error: validName.error};
      const record = read(identity, species);
      if (record.kind === 'invalid') return {ok: false, state: null, error: IDENTITY_ERROR};
      if (record.kind === 'corrupt') return {ok: false, state: null, error: RECOVERED};
      const rosterRecord = readRoster(identity);
      if (rosterRecord.kind === 'corrupt') return {ok: false, state: null, error: RECOVERED};
      const roster = rosterRecord.kind === 'record' ? rosterRecord.roster : fallbackRoster(identity);
      if (roster.adopted.includes(species) && !pendingRoster.has(record.key)) return {ok: false, state: record.state ? {...record.state} : null, error: '已经领养过这只小宠物了'};
      const nextRoster = {schemaVersion: 1, active: species, adopted: [...new Set([...roster.adopted, species])]};
      // A previous quota failure can leave a safely stored pet without its roster entry.
      // Retry only repairs the roster; it never resets that pet's name or progress.
      if (record.kind === 'record' || record.kind === 'memory') {
        if (blockedWrites.has(record.key)) return {ok: false, state: {...record.state}, error: '暂时无法保存'};
        const repaired = writeRoster(rosterRecord, nextRoster);
        if (repaired.ok) pendingRoster.delete(record.key);
        else pendingRoster.add(record.key);
        return {ok: repaired.ok, state: {...record.state}, care: record.care ? JSON.parse(JSON.stringify(record.care)) : undefined, error: repaired.error, recovered: repaired.ok};
      }
      const pet = {...states.createDefault(now), petName: validName.name};
      const adopted = write(record.kind === 'missing' ? {...record, kind: 'new'} : record, pet, now);
      if (!adopted.ok) return {ok: false, state: adopted.state, error: adopted.message};
      const rosterSaved = writeRoster(rosterRecord, nextRoster);
      if (rosterSaved.ok) pendingRoster.delete(record.key);
      else pendingRoster.add(record.key);
      return {ok: rosterSaved.ok, state: adopted.state, error: rosterSaved.error};
    }

    function rename(identity, state, name, now, species = 'dog') {
      const validName = validateName(name);
      if (!validName.ok) return {ok: false, state: null, error: validName.error};
      const record = read(identity, species);
      if (record.kind === 'invalid') return {ok: false, state: null, error: IDENTITY_ERROR};
      if (record.kind === 'corrupt') return {ok: false, state: null, error: RECOVERED};
      if (record.kind === 'missing') return {ok: false, state: null, error: '还没有领养小宠物'};
      if (record.kind === 'unavailable') {
        const changed = {...states.sanitize(state, now), petName: validName.name};
        memory.set(record.key, changed);
        return {ok: false, state: {...changed}, error: '暂时无法保存'};
      }
      const changed = {...states.sanitize(state || record.state, now), petName: validName.name};
      const result = write(record, changed, now);
      return {ok: result.ok, state: result.state, error: result.ok ? '' : result.message};
    }

    function listPets(identity) {
      return getRoster(identity).adopted.flatMap(species => {
        const record = read(identity, species);
        return ['record', 'memory'].includes(record.kind) ? [{species, state: {...record.state}, care: record.care ? JSON.parse(JSON.stringify(record.care)) : undefined}] : [];
      });
    }

    function setActive(identity, species) {
      const record = readRoster(identity);
      if (!SPECIES.includes(species)) return {ok: false, error: '无法识别这只小宠物'};
      const roster = record.kind === 'record' ? record.roster : fallbackRoster(identity);
      if (!roster.adopted.includes(species)) return {ok: false, error: '还没有领养这只小宠物'};
      const pet = read(identity, species);
      if (!['record', 'memory'].includes(pet.kind)) return {ok: false, error: pet.kind === 'corrupt' ? RECOVERED : '暂时无法读取小宠物'};
      return writeRoster(record, {...roster, active: species});
    }

    function maxLevel(identity) {
      return listPets(identity).reduce((highest, pet) => Math.max(highest, pet.state.level), 0);
    }

    function hasCommand(identity, id) {
      if (typeof id !== 'string' || !id) return false;
      const rosterRecord = readRoster(identity);
      if (['invalid', 'corrupt', 'unavailable'].includes(rosterRecord.kind)) throw new Error(rosterRecord.kind === 'corrupt' ? RECOVERED : '暂时无法核对照顾记录');
      const roster = rosterRecord.kind === 'record' ? rosterRecord.roster : fallbackRoster(identity);
      let found = false;
      for (const species of roster.adopted) {
        const record = read(identity, species);
        if (!['record', 'memory'].includes(record.kind)) throw new Error('暂时无法核对照顾记录');
        if (Array.isArray(record.care?.commandIds) && record.care.commandIds.includes(id)) found = true;
      }
      return found;
    }

    function load(identity, now) { return loadPet(identity, 'dog', now); }
    function adopt(identity, name, now) { return adoptPet(identity, 'dog', name, now); }

    function legacyAvailable() {
      if (!storageOrNull) return false;
      try { return storageOrNull.getItem(LEGACY_KEY) !== null; }
      catch (_) { return false; }
    }

    // 云端存档合并进本机后：丢掉这个梦角的内存缓存（写入受阻的除外），下次读取直接读合并后的存档。
    function forget(identity) {
      for (const species of SPECIES) {
        const key = keyFor(identity, species);
        if (key && !blockedWrites.has(key)) { memory.delete(key); careMemory.delete(key); }
      }
    }
    // 只看存档里的保存时间，不经过内存缓存，用来判断云端是否带来了更新的进度。
    function savedAt(identity, species = 'dog') {
      const key = keyFor(identity, species);
      if (!key || !storageOrNull) return 0;
      try { const envelope = JSON.parse(storageOrNull.getItem(key) || 'null'); return Number(envelope?.pet?.lastSavedAt) || 0; }
      catch (_) { return 0; }
    }

    return {load, loadPet, save, adopt, adoptPet, rename, getRoster, listPets, setActive, maxLevel, hasCommand, legacyAvailable, forget, savedAt};
  }

  return {keyFor, rosterKeyFor, validateName, createStorage};
}));
