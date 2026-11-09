// X小宠云端存档（单独集合，不进账号整体快照）：
// 进入某个梦角时从 shexXLetters 读回这个梦角的小宠存档并合并到本机；本机改动攒着，最多 10 分钟上传一次，
// 切后台 / 关页面时补传一次。只上传有变化的键。
(function (root) {
  'use strict';
  const doc = root.document; if (!doc) return;
  const LAZY_MS = 10 * 60 * 1000, SPECIES = ['dog', 'cat', 'rabbit', 'capybara', 'hamster', 'crow'];
  const ready = new Set(), daily = new Set(), uploaded = new Map(), visits = new Map(), flights = new Map(), writes = new Map(); let timer = 0;
  const enc = encodeURIComponent, scope = id => id?.userId && id?.dreamId ? `${id.userId}:${id.dreamId}` : '';
  function keysFor(id) {
    const base = `${enc(id.userId)}:${enc(id.dreamId)}`;
    const progress = [...SPECIES.map(s => `shex_pet_local_v2:${base}${s === 'dog' ? '' : ':' + s}`), `shex_pet_roster_v1:${base}`];
    return daily.has(scope(id)) ? progress : [...progress, `shex_pet_journal_v1:${base}`, ...SPECIES.map(s => `shex_pet_journal_v1:${base}:${s}`)];
  }
  const parse = v => { try { return JSON.parse(v); } catch (_) { return null; } };
  // 合并：宠物进度按保存时间取新；领养名单按更新时间取新；家的记录两边取并集。
  function merge(key, local, cloud) {
    if (local == null) return cloud; if (cloud == null || local === cloud) return local;
    const a = parse(local), b = parse(cloud); if (!a) return cloud; if (!b) return local;
    if (key.startsWith('shex_pet_local_v2:')) return (Number(a.pet?.lastSavedAt) || 0) >= (Number(b.pet?.lastSavedAt) || 0) ? local : cloud;
    if (key.startsWith('shex_pet_roster_v1:')) return (Number(a.updatedAt) || 0) >= (Number(b.updatedAt) || 0) ? local : cloud;
    const union = (x = [], y = [], id = e => `${e.at}:${e.type || ''}:${e.actor || ''}`) => { const m = new Map(); for (const e of [...y, ...x]) if (e) m.set(id(e), e); return [...m.values()].sort((p, q) => p.at - q.at); };
    return JSON.stringify({ ...b, ...a, v: 1, visits: union(a.visits, b.visits, e => `${e.species || 'legacy'}:${e.id || e.at}:${e.type || ''}:${e.actor || ''}`), returns: union(a.returns, b.returns, e => `${e.species || 'legacy'}:${e.from || e.at}`), moments: union(a.moments, b.moments, e => `${e.species || 'legacy'}:${e.at}:${e.type || ''}:${e.actor || ''}`),
      unlocked: [...new Set([...(b.unlocked || []), ...(a.unlocked || [])])], celebrated: [...new Set([...(b.celebrated || []), ...(a.celebrated || [])])],
      legacyImported: [...new Set([...(b.legacyImported || []), ...(a.legacyImported || [])])],
      since: Object.fromEntries([...new Set([...Object.keys(b.since || {}), ...Object.keys(a.since || {})])].map(s => [s, Math.min(...[a.since?.[s], b.since?.[s]].filter(Number.isFinite))])),
      days: { ...(b.days || {}), ...(a.days || {}) } });
  }
  const metaKey = id => `shex_pet_sync_v1:${enc(id.userId)}:${enc(id.dreamId)}`;
  const current = id => { const next = root.SHEXPetIdentity?.current?.(); return !next?.pending && scope(next) === scope(id); };
  function visit(id) {
    const key = scope(id);
    if (!visits.has(key)) {
      const versions = parse(root.localStorage.getItem(metaKey(id))) || {};
      // Capture before pet-app settles offline time or updates lastSavedAt.
      visits.set(key, {baseline: Object.fromEntries(keysFor(id).map(k => [k, root.localStorage.getItem(k)])), versions, supported: false});
    }
    return visits.get(key);
  }
  function notify(id, replacedKeys, conflict = false, unsupported = false) {
    if (current(id)) doc.dispatchEvent(new root.CustomEvent('shex:pet-cloud-loaded', {detail: {...id, replacedKeys, conflict, unsupported}}));
  }
  function install(key, value) {
    const local = root.localStorage.getItem(key);
    if (local === value) return false;
    // One bounded recovery slot per record; never silently discard a divergent
    // local record. If recovery cannot be saved, leave the original untouched.
    if (local !== null) root.localStorage.setItem('shex_pet_recovery_v1:' + enc(key), local);
    if (value === null) root.localStorage.removeItem(key); else root.localStorage.setItem(key, value);
    return true;
  }
  function load(id) {
    const key = scope(id), api = root.SHEXXLettersAPI;
    if (!key || ready.has(key) || !api?.petSaveLoad) return Promise.resolve();
    if (flights.has(key)) return flights.get(key);
    let v;
    try { v = visit(id); } catch (_) { return Promise.resolve(); }
    const request = (async () => {
      try {
        const result = await api.petSaveLoad({dreamId: id.dreamId, ...(root.SHEXPetJournalStore ? {journalMode:'daily'} : {})}), entries = result.entries || {};
        if (!current(id)) return;
        if (result.journalStorage === 'daily-v2' && root.SHEXPetJournalStore) {
          daily.add(key); root.SHEXPetJournalStore.enable({...id});
        }
        const replaced = [];
        for (const k of keysFor(id)) {
          const local = root.localStorage.getItem(k), cloud = entries[k] ?? null;
          let next;
          if (k.startsWith('shex_pet_journal_v1:')) next = merge(k, local, cloud);
          else if (cloud === null) next = local;
          else if (local === null) next = cloud;
          else if (Object.prototype.hasOwnProperty.call(v.versions, k)) next = result.revisions?.[k] === v.versions[k] ? local : cloud;
          else next = merge(k, v.baseline[k], cloud) === cloud && cloud !== v.baseline[k] ? cloud : local;
          if (install(k, next)) replaced.push(k);
          uploaded.set(k, cloud);
        }
        v.supported = !!result.revisions && typeof result.revisions === 'object';
        v.versions = Object.fromEntries(keysFor(id).map(k => [k, result.revisions?.[k] ?? null]));
        root.localStorage.setItem(metaKey(id), JSON.stringify(v.versions));
        ready.add(key); notify(id, replaced, false, !v.supported); schedule();
      } catch (_) { /* Retry with the original baseline; local care remains available offline. */ }
      finally { flights.delete(key); }
    })();
    flights.set(key, request); return request;
  }
  async function flush() {
    root.clearTimeout(timer); timer = 0;
    const id = root.SHEXPetIdentity?.current?.(), api = root.SHEXXLettersAPI;
    const key = scope(id);
    // Journal failure must never cancel or reject the independent progress CAS.
    const journalWrite = daily.has(key) && current(id)
      ? Promise.resolve().then(() => root.SHEXPetJournalStore?.flush({...id})).catch(() => { schedule(); }) : Promise.resolve();
    if (writes.has(key)) return Promise.all([writes.get(key), journalWrite]);
    if (!ready.has(key) || !api?.petSaveWrite || !visits.get(key)?.supported || !current(id)) return journalWrite;
    const entries = {};
    try { for (const k of keysFor(id)) { const value = root.localStorage.getItem(k); if (value != null && value !== uploaded.get(k)) entries[k] = value; } }
    catch (_) { schedule(); return journalWrite; }
    if (!Object.keys(entries).length) return journalWrite;
    const v = visits.get(key), expectedRevisions = Object.fromEntries(Object.keys(entries).map(k => [k, v.versions[k] ?? null]));
    const request = (async () => {
      try {
        const result = await api.petSaveWrite({dreamId: id.dreamId, entries, expectedRevisions});
        if (!current(id)) { ready.delete(key); visits.delete(key); return; }
        if (!result?.revisions) { v.supported = false; notify(id, [], false, true); return; }
        const replaced = [];
        if (result.conflict) {
          for (const k of Object.keys(entries)) {
            const remote = result.entries?.[k] ?? null;
            if (install(k, remote)) replaced.push(k);
            uploaded.set(k, remote);
          }
        } else for (const [k, value] of Object.entries(entries)) uploaded.set(k, value);
        Object.assign(v.versions, result.revisions);
        root.localStorage.setItem(metaKey(id), JSON.stringify(v.versions));
        if (result.conflict) notify(id, replaced, true);
      } catch (error) {
        if(!current(id)||['ACCOUNT_CHANGED','DREAM_CHANGED'].includes(error?.code)){ready.delete(key);visits.delete(key);}
        schedule();
      } finally { writes.delete(key); }
    })();
    writes.set(key, request); return Promise.all([request, journalWrite]);
  }
  function schedule() { if (!timer) timer = root.setTimeout(flush, LAZY_MS); }
  function tick() { const id = root.SHEXPetIdentity?.current?.(); if (scope(id) && !id.pending) { load(id); schedule(); } }
  root.setInterval(tick, 3000); root.setTimeout(tick, 500);
  doc.addEventListener('visibilitychange', () => { if (doc.visibilityState === 'hidden') flush(); });
  root.addEventListener('pagehide', flush);
  root.SHEXPetCloud = Object.freeze({ ready: id => ready.has(scope(id)), prepare: id => { if (scope(id)) return load({...id}); }, flush, merge });
}(typeof window !== 'undefined' ? window : globalThis));
