// 按日归档：IndexedDB 保存历史和待上传队列；localStorage 只留小元数据与未提交日志。
(function (root, factory) {
  'use strict';
  const createStore = factory();
  const api = createStore(root);
  if (typeof module === 'object' && module.exports) module.exports = Object.assign(api, {createStore});
  else root.SHEXPetJournalStore = api;
}(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const PAGE = 20, MAX_BYTES = 195 * 1024, PREFIX = 'shex_pet_journal_daily_v2:', KINDS = ['visits', 'returns', 'moments'];
  const copy = x => x == null ? x : JSON.parse(JSON.stringify(x));
  const empty = () => ({v: 1, visits: [], returns: [], moments: [], days: {}, unlocked: []});
  const validDay = day => /^\d{4}-\d{2}-\d{2}$/.test(day || '');
  const dayOf = at => Number.isFinite(Number(at)) && Number(at) > 0 ? new Date(Number(at) + 8 * 3600000).toISOString().slice(0, 10) : null;
  const identityKey = id => id?.userId && id?.dreamId ? JSON.stringify([String(id.userId), String(id.dreamId)]) : '';
  const scopeKey = (id, sp) => identityKey(id) && sp ? JSON.stringify([String(id.userId), String(id.dreamId), String(sp)]) : '';
  const stable = value => { if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']'; if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + stable(value[k])).join(',') + '}'; return JSON.stringify(value); };
  function hash(value) { let a = 2166136261, b = 3339675911; for (const c of value) { a = Math.imul(a ^ c.charCodeAt(0), 16777619); b = Math.imul(b ^ c.charCodeAt(0), 2246822519); } return (a >>> 0).toString(16) + (b >>> 0).toString(16); }
  function rowId(kind, row) { return row.id || 'legacy_' + hash(JSON.stringify([kind, row.at ?? null, row.from ?? null, row.actor ?? null, row.type ?? null, row.species ?? null, row.place ?? null, row.variant ?? null])); }
  function mergeDay(a, b, sp, day) {
    const out = empty();
    for (const kind of KINDS) {
      const rows = new Map();
      for (const row of [...(a?.[kind] || []), ...(b?.[kind] || [])]) {
        if (!row || row.species !== sp || dayOf(row.at) !== day) continue;
        const id = rowId(kind, row), old = rows.get(id);
        rows.set(id, {...old, ...copy(row), ...(old?.at > row.at ? {at:old.at} : {}), id, ...(old?.count || row.count ? {count: Math.max(Number(old?.count) || 1, Number(row.count) || 1)} : {})});
      }
      out[kind] = [...rows.values()].sort((x, y) => x.at - y.at || x.id.localeCompare(y.id));
    }
    const stats = {};
    for (const source of [a?.days?.[day], b?.days?.[day]]) for (const [actor, types] of Object.entries(source || {})) {
      if (!types || typeof types !== 'object') continue;
      const bucket = stats[actor] ||= {};
      for (const [type, count] of Object.entries(types)) if (Number.isFinite(Number(count))) bucket[type] = Math.max(bucket[type] || 0, Number(count));
    }
    if (Object.keys(stats).length) out.days[day] = stats;
    if ([...(a?.unlocked || []), ...(b?.unlocked || [])].includes(day)) out.unlocked = [day];
    return out;
  }
  function split(journal, sp) {
    const days = new Map();
    const get = day => { if (!days.has(day)) days.set(day, empty()); return days.get(day); };
    for (const kind of KINDS) for (const row of journal?.[kind] || []) { const day = dayOf(row?.at); if (day && row.species === sp) get(day)[kind].push(row); }
    for (const [day, stats] of Object.entries(journal?.days || {})) if (validDay(day)) get(day).days[day] = stats;
    for (const day of journal?.unlocked || []) if (validDay(day)) get(day).unlocked.push(day);
    return [...days].sort((a, b) => b[0].localeCompare(a[0])).map(([day, j]) => ({day, journal: mergeDay(null, j, sp, day)}));
  }
  function metadata(j, sp) {
    const meta = {};
    if (Number.isFinite(j?.updatedAt)) meta.updatedAt = j.updatedAt;
    if (typeof j?.homeName === 'string') meta.homeName = j.homeName.slice(0, 80);
    if (Number.isFinite(j?.since?.[sp])) meta.since = {[sp]: j.since[sp]};
    if (Array.isArray(j?.celebrated)) meta.celebrated = [...new Set(j.celebrated.filter(x => typeof x === 'string' && x.length <= 160 && x.startsWith(sp + ':')))].slice(-100);
    return meta;
  }
  function mergeMeta(a = {}, b = {}, sp) {
    const out = {...a, ...b};
    if(Number.isFinite(a.updatedAt)||Number.isFinite(b.updatedAt))out.updatedAt=Math.max(Number(a.updatedAt)||0,Number(b.updatedAt)||0);
    if ((a.updatedAt || 0) > (b.updatedAt || 0) && Object.hasOwn(a, 'homeName')) out.homeName = a.homeName;
    const since = [a.since?.[sp], b.since?.[sp]].filter(Number.isFinite); if (since.length) out.since = {[sp]: Math.min(...since)};
    out.celebrated = [...new Set([...(a.celebrated || []), ...(b.celebrated || [])])].slice(-100);
    return out;
  }
  function fallbackArchive(storage) {
    const DAY = PREFIX + 'cache:', META = PREFIX + 'archive-meta:';
    const keys = () => { const out = []; for (let i = 0; i < (storage?.length || 0); i++) { const k = storage.key(i); if (k?.startsWith(DAY)) out.push(k); } return out; };
    const read = k => { try { return JSON.parse(storage.getItem(k) || 'null'); } catch (_) { return null; } };
    const key = (s, d) => DAY + encodeURIComponent(s) + ':' + d;
    return {
      get: async (s, d) => read(key(s, d)),
      put: async r => { if (!storage) throw Error('日记离线存储不可用'); storage.setItem(key(r.scope, r.day), JSON.stringify(r)); const clean = keys().map(k => [k, read(k)]).filter(([, v]) => v?.scope === r.scope && !v.dirty).sort((a, b) => b[1].day.localeCompare(a[1].day)); for (const [k] of clean.slice(PAGE)) storage.removeItem(k); },
      page: async (s, before, n) => keys().map(read).filter(r => r?.scope === s && (!before || r.day < before)).sort((a, b) => b.day.localeCompare(a.day)).slice(0, n),
      dirty: async (id, n, after) => keys().map(read).filter(r => r?.identity === id && r.dirty && (!after || r.scope+'\u0000'+r.day>after)).sort((a,b)=>(a.scope+'\u0000'+a.day).localeCompare(b.scope+'\u0000'+b.day)).slice(0, n),
      getMeta: async s => read(META + encodeURIComponent(s)),
      putMeta: async (s, m) => { if (!storage) throw Error('日记离线存储不可用'); storage.setItem(META + encodeURIComponent(s), JSON.stringify(m)); }
    };
  }
  function indexedArchive(root, storage) {
    let dbPromise; const fallback = fallbackArchive(storage);
    async function db() {
      if (!root.indexedDB) return null;
      if (!dbPromise) dbPromise = new Promise((resolve, reject) => {
        const req = root.indexedDB.open('shex_pet_journal_daily_v2', 1);
        req.onupgradeneeded = () => { const d = req.result; const records = d.createObjectStore('days', {keyPath: 'key'}); records.createIndex('scopeDay', 'key'); records.createIndex('dirtyIdentity', 'dirtyIdentity'); d.createObjectStore('meta'); };
        req.onsuccess = () => { req.result.onversionchange = () => { req.result.close(); dbPromise = null; }; resolve(req.result); };
        req.onerror = () => reject(req.error || Error('IndexedDB 打开失败'));
        req.onblocked = () => reject(Error('日记数据库正在升级，请关闭其他旧页面'));
      }).catch(() => null);
      return dbPromise;
    }
    async function transaction(store, mode, execute) {
      const d = await db(); if (!d) return null;
      return new Promise((resolve, reject) => { const tx = d.transaction(store, mode); let value; tx.oncomplete = () => resolve(value); tx.onerror = tx.onabort = () => reject(tx.error || Error('日记数据库提交失败')); execute(tx.objectStore(store), v => { value = v; }); });
    }
    const k = (s, day) => s + '\u0000' + day;
    return {
      get: async (s, day) => (await db()) ? transaction('days', 'readonly', (store, done) => { const r = store.get(k(s, day)); r.onsuccess = () => done(r.result || null); }) : fallback.get(s, day),
      put: async r => (await db()) ? transaction('days', 'readwrite', (store, done) => { const value = {...r, key: k(r.scope, r.day)}; if (r.dirty) value.dirtyIdentity = [r.identity, value.key]; else delete value.dirtyIdentity; store.put(value); done(true); }) : fallback.put(r),
      page: async (s, before, n) => (await db()) ? transaction('days', 'readonly', (store, done) => { const out = [], range = root.IDBKeyRange.bound(k(s, ''), k(s, before || '\uffff'), false, !!before); const r = store.index('scopeDay').openCursor(range, 'prev'); r.onsuccess = () => { const c = r.result; if (!c || out.length >= n) {done(out); return;} out.push(c.value); c.continue(); }; }) : fallback.page(s, before, n),
      dirty: async (id, n, after) => (await db()) ? transaction('days', 'readonly', (store, done) => { const out = [], range=root.IDBKeyRange.bound([id,after||''],[id,'\uffff'],!!after,false),r = store.index('dirtyIdentity').openCursor(range); r.onsuccess = () => { const c = r.result; if (!c || out.length >= n) {done(out); return;} out.push(c.value); c.continue(); }; }) : fallback.dirty(id, n, after),
      getMeta: async s => (await db()) ? transaction('meta', 'readonly', (store, done) => { const r = store.get(s); r.onsuccess = () => done(r.result || null); }) : fallback.getMeta(s),
      putMeta: async (s, m) => (await db()) ? transaction('meta', 'readwrite', (store, done) => { store.put(m, s); done(true); }) : fallback.putMeta(s, m)
    };
  }
  return function createStore(root = {}, options = {}) {
    let config = {...options}, archive = options.archive || indexedArchive(root, options.storage || root.localStorage), serial = Promise.resolve(), token = 0;
    const states = new Map(), enabledIds = new Set(), flights = new Map(), tasks = new Set();
    const storage = () => config.storage || root.localStorage;
    const api = () => typeof config.api === 'function' ? config.api() : config.api || root.SHEXXLettersAPI;
    const currentId = () => config.getIdentity ? config.getIdentity() : root.SHEXPetIdentity?.current?.();
    const currentSpecies = () => config.getSpecies ? config.getSpecies() : typeof root.SHEXPetApp?.speciesKey === 'function' ? root.SHEXPetApp.speciesKey() : root.SHEXPetApp?.speciesKey;
    const active = id => { const now = currentId(); return !!identityKey(id) && !now?.pending && identityKey(now) === identityKey(id); };
    const parse = key => { try { return JSON.parse(storage()?.getItem(key) || 'null'); } catch (_) { return null; } };
    const metaKey = s => PREFIX + 'meta:' + encodeURIComponent(s);
    const pendingKey = (s, day) => PREFIX + 'pending:' + encodeURIComponent(s) + ':' + day;
    const rev = () => Date.now().toString(36) + '-' + (++token) + '-' + Math.random().toString(36).slice(2);
    function state(id, sp) { const scope = scopeKey(id, sp); if (!scope) return null; if (!states.has(scope)) {const localMeta=parse(metaKey(scope))||{};states.set(scope, {scope, identity: {...id}, species: sp, page: new Map(), meta: copy(localMeta.meta||{}), localMeta, loading: false, hasMore: false, error: '', cursor: null, started: false, hydrated:false, generation: 0});} return states.get(scope); }
    function notice(s) { if (active(s.identity) && (!currentSpecies() || currentSpecies() === s.species)) { const target = root.document || root; if (target.dispatchEvent && root.CustomEvent) target.dispatchEvent(new root.CustomEvent('shex:pet-journal-updated', {detail: {identity: {...s.identity}, species: s.species}})); } }
    function track(p) { tasks.add(p); p.finally(() => tasks.delete(p)).catch(() => {}); return p; }
    function enqueue(s, fn) { const p = serial.then(fn).catch(e => { s.error = e?.message || String(e); notice(s); return false; }); serial = p.then(() => {}); return track(p); }
    function saveLocalMeta(s) { try { storage()?.setItem(metaKey(s.scope), JSON.stringify(s.localMeta)); } catch (e) { s.error = e.message; } }
    function wal(s, row) { try { if (!storage()) throw Error('日记恢复日志不可用'); storage().setItem(pendingKey(s.scope, row.day), JSON.stringify(row)); return true; } catch (e) { s.error = e.message; return false; } }
    function removeWal(s, row) { const k = pendingKey(s.scope, row.day); if (parse(k)?.rev === row.rev) storage()?.removeItem(k); }
    function record(s, day, journal, dirty = true) { return {scope: s.scope, identity: identityKey(s.identity), species: s.species, day, journal: copy(journal), rev: rev(), dirty}; }
    async function persist(s, row) { const old = await archive.get(s.scope, row.day); const next = {...row, journal: mergeDay(old?.journal, row.journal, s.species, row.day), dirty: row.dirty || !!old?.dirty}; await archive.put(next); removeWal(s, row); return next; }
    async function replay(s) { const keys = []; for (let i = 0; i < (storage()?.length || 0); i++) { const k = storage().key(i); if (k?.startsWith(PREFIX + 'pending:' + encodeURIComponent(s.scope) + ':')) keys.push(k); } let ok = true; for (const k of keys) { const row = parse(k); if (row?.scope !== s.scope) continue; try { await persist(s, row); } catch (e) { s.error = e.message; ok = false; } } return ok; }
    function updatePage(s, rows, replace) { if (replace) s.page.clear(); for (const row of rows) { const local = s.page.get(row.day); s.page.set(row.day, mergeDay(row.journal, local, s.species, row.day)); } s.page = new Map([...s.page].sort((a,b) => b[0].localeCompare(a[0])).slice(0,PAGE)); }
    async function localPage(s, before, generation) { const rows = await archive.page(s.scope, before, PAGE + 1); if (s.generation !== generation) return; updatePage(s, rows.slice(0,PAGE), true); s.hasMore = rows.length > PAGE; s.cursor = [...s.page.keys()].at(-1) || before; }
    async function cloudPage(s, before, generation) {
      if (!active(s.identity) || !api()?.petJournalList) return;
      const result = await api().petJournalList({dreamId:s.identity.dreamId, petSpecies:s.species, ...(before ? {before} : {}), limit:PAGE});
      const rows = Array.isArray(result?.days) ? result.days : [];
      for (const row of rows) if (validDay(row.day)) await enqueue(s, async () => { const old = await archive.get(s.scope,row.day); const next = {...record(s,row.day,mergeDay(old?.journal,row.journal,s.species,row.day),!!old?.dirty), ...(old?.dirty ? {rev:old.rev} : {})}; await archive.put(next); });
      s.meta = mergeMeta(s.meta, metadata(result?.meta,s.species), s.species); if(result?.legacyAvailable||result?.meta?.legacyAvailable)s.localMeta.legacyAvailable=true;s.localMeta.meta = s.meta; saveLocalMeta(s);
      if (s.generation === generation) { const local = await archive.page(s.scope,before,PAGE+1); if(local.length||before||!s.page.size)updatePage(s,local.slice(0,PAGE),true); s.hasMore = !!result?.nextCursor || local.length > PAGE || (s.hasMore&&!!s.error); s.cursor = [...s.page.keys()].at(-1) || result?.nextCursor || before; }
    }
    async function migration(s) {
      if (!active(s.identity) || !api()?.petJournalMigrate) return true;
      const result = await api().petJournalMigrate({dreamId:s.identity.dreamId,petSpecies:s.species,...(s.localMeta.migrationCursor?{cursor:s.localMeta.migrationCursor}:{})});
      s.localMeta.migrationCursor = result?.nextCursor || null; s.localMeta.cloudMigrated = result?.done === true;s.migrationRetry=false; if (result?.legacyAvailable) s.localMeta.legacyAvailable=true; saveLocalMeta(s); return result?.done === true;
    }
    function continueMigration(s){if(s.migrationTask)return;s.migrationTask=track((async()=>{let done=false;while(!done&&active(s.identity)){await new Promise(resolve=>(root.setTimeout||setTimeout)(resolve,0));try{done=await migration(s);}catch(e){s.error=e.message;s.migrationRetry=true;break;}}notice(s);})().finally(()=>{s.migrationTask=null;}));}
    async function page(s, before) { const generation=++s.generation; s.loading=true; s.error=''; notice(s); try { await serial; await localPage(s,before,generation); await cloudPage(s,before,generation); } catch(e) { s.error=e.message || String(e); } finally { if(s.generation===generation)s.loading=false; notice(s); } return read(s.identity,s.species); }
    function prepare(id,sp,legacy) {
      const s=state(id,sp); if(!s||!enabledIds.has(identityKey(id)))return Promise.resolve(empty()); if(s.started)return s.preparing;
      s.started=true; s.loading=true;
      const parts=split(legacy,sp); s.meta=mergeMeta(metadata(legacy,sp),s.localMeta.meta||{},sp);if(legacy?.legacyAvailable)s.localMeta.legacyAvailable=true;updatePage(s,parts.slice(0,PAGE),false); s.hasMore=parts.length>PAGE; s.cursor=[...s.page.keys()].at(-1)||null;
      // Write-ahead is synchronous so closing the page before IndexedDB commits is recoverable.
      let resolveHydration;s.localReady=new Promise(resolve=>{resolveHydration=resolve;});
      const importing=!s.localMeta.localMigrated&&!!legacy; const imported=importing?parts.map(r=>record(s,r.day,r.journal)):[];
      let allLogged=true; for(const row of imported)if(!wal(s,row))allLogged=false;
      s.preparing=track((async()=>{
        let durable=await enqueue(s,()=>replay(s));
        if(importing) { if(!allLogged)for(const row of imported){const saved=await enqueue(s,()=>persist(s,row));if(!saved)durable=false;} if(durable){s.localMeta.localMigrated=true;s.localMeta.meta=s.meta;saveLocalMeta(s);} }
        const archivedMeta=await archive.getMeta(s.scope).catch(e=>{s.error=e.message;return null;}); if(archivedMeta)s.meta=mergeMeta(s.meta,archivedMeta.meta,s.species);
        // Legacy metadata is also sent through the independent diary queue.
        if(importing&&Object.keys(metadata(legacy,sp)).length){s.localMeta.meta=s.meta;s.localMeta.metaDirty=true;s.localMeta.metaRev=rev();saveLocalMeta(s);}
        try { const rows=await archive.page(s.scope,null,PAGE+1); if(rows.length)updatePage(s,rows.slice(0,PAGE),false);s.hasMore=s.hasMore||rows.length>PAGE; }catch(e){s.error=e.message;}
        s.hydrated=true;resolveHydration();
        let done=true;try {done=await migration(s);}catch(e){s.error=e.message;s.migrationRetry=true;}
        try {await cloudPage(s,null,s.generation);}catch(e){s.error=e.message;}
        s.loading=false;notice(s);
        if(!done)continueMigration(s);
        return read(id,sp);
      })()); return s.preparing;
    }
    function read(id,sp) { const s=state(id,sp);if(!s)return empty();const out={...empty(),...copy(s.meta)};for(const [day,j]of [...s.page].sort((a,b)=>a[0].localeCompare(b[0]))){for(const kind of KINDS)out[kind].push(...copy(j[kind]));Object.assign(out.days,copy(j.days));out.unlocked.push(...j.unlocked);}if(!s.hydrated){for(const kind of ['returns','moments'])for(const row of s.localMeta.heads?.[kind]||[])if(row.species===sp&&!out[kind].some(r=>rowId(kind,r)===rowId(kind,row)))out[kind].push(copy(row));}if(s.localMeta.legacyAvailable)out.legacyAvailable=true;return out; }
    function write(id,sp,journal) {
      const s=state(id,sp);if(!s||!enabledIds.has(identityKey(id)))return false;
      const head=r=>Object.fromEntries(['id','at','from','awayMs','visits','actor','type','species','count','place','variant'].filter(k=>r[k]!=null).map(k=>[k,typeof r[k]==='string'?r[k].slice(0,256):r[k]]));
      s.localMeta.heads={returns:(journal.returns||[]).filter(r=>r.species===sp).slice(-4).map(head),moments:(journal.moments||[]).filter(r=>r.species===sp).slice(-8).map(head)};saveLocalMeta(s);
      for(const row of split(journal,sp)){const old=s.page.get(row.day);const next=mergeDay(old,row.journal,sp,row.day);if(stable(old)===stable(next))continue;s.page.set(row.day,next);const r=record(s,row.day,next);wal(s,r);enqueue(s,()=>persist(s,r));}
      const nextMeta=metadata(journal,sp);if(stable(metadata(s.meta,sp))!==stable(nextMeta)){s.meta=mergeMeta(s.meta,{...nextMeta,updatedAt:Date.now()},sp);s.localMeta.meta=s.meta;s.localMeta.metaDirty=true;s.localMeta.metaRev=rev();saveLocalMeta(s);enqueue(s,()=>archive.putMeta(s.scope,s.localMeta));}
      s.page=new Map([...s.page].sort((a,b)=>b[0].localeCompare(a[0])).slice(0,PAGE));s.cursor=[...s.page.keys()].at(-1)||s.cursor;notice(s);return true;
    }
    async function flush(id) {
      const key=identityKey(id);if(!enabledIds.has(key)||!active(id))return;if(flights.has(key))return flights.get(key);
      const request=(async()=>{await serial;
        for(let i=0;i<(storage()?.length||0);i++){const k=storage().key(i);if(!k?.startsWith(PREFIX+'meta:'))continue;try{const parts=JSON.parse(decodeURIComponent(k.slice((PREFIX+'meta:').length)));if(identityKey({userId:parts[0],dreamId:parts[1]})===key)state({userId:parts[0],dreamId:parts[1]},parts[2]);}catch(_){}}
        const scoped=[...states.values()].filter(s=>identityKey(s.identity)===key);for(const s of scoped){await enqueue(s,()=>replay(s));if((s.migrationRetry||!s.localMeta.cloudMigrated)&&!s.migrationTask){try{if(!await migration(s))continueMigration(s);}catch(e){s.error=e.message;s.migrationRetry=true;}}}
        // Snapshot once. New writes during a network request stay queued for the next flush.
        let after=null,moreDirty=true;
        while(moreDirty){const dirty=await archive.dirty(key,PAGE,after);moreDirty=dirty.length===PAGE;if(dirty.length)after=dirty.at(-1).scope+'\u0000'+dirty.at(-1).day;const groups=new Map();for(const row of dirty){if(!groups.has(row.scope))groups.set(row.scope,[]);groups.get(row.scope).push(row);}
        for(const s of scoped)if(s.localMeta.metaDirty&&!groups.has(s.scope))groups.set(s.scope,[]);
        for(const [scope,rows]of groups){const decoded=JSON.parse(scope),s=state({userId:decoded[0],dreamId:decoded[1]},decoded[2]);let offset=0,first=true,oversized=false;do{if(!active(id)||!api()?.petJournalWrite)return;const batch=[];let bytes=0;while(offset<rows.length&&batch.length<PAGE){const row=rows[offset],size=stable({day:row.day,journal:row.journal}).length*3;if(batch.length&&bytes+size>MAX_BYTES)break;if(size>MAX_BYTES){s.error='单日日记超过上传上限，记录已保留待处理';oversized=true;notice(s);offset++;continue;}batch.push(row);bytes+=size;offset++;}
          if(!batch.length&&!(first&&s.localMeta.metaDirty)){first=false;continue;}
          const metaRevision=s.localMeta.metaRev,payload={dreamId:id.dreamId,petSpecies:s.species,days:batch.map(r=>({day:r.day,journal:r.journal})),...(first&&s.localMeta.metaDirty?{meta:copy(s.meta)}:{})};
          try{const response=await api().petJournalWrite(payload);let acked=true;for(const row of batch){const committed=await enqueue(s,async()=>{const latest=await archive.get(scope,row.day);if(!latest)return false;const server=response?.days?.find(r=>r.day===row.day)?.journal;const next={...latest,journal:mergeDay(server,latest.journal,s.species,row.day),dirty:latest.rev!==row.rev};await archive.put(next);if(s.page.has(row.day))s.page.set(row.day,mergeDay(next.journal,s.page.get(row.day),s.species,row.day));return true;});if(!committed)acked=false;}if(payload.meta&&metaRevision===s.localMeta.metaRev){s.localMeta.metaDirty=false;s.meta=mergeMeta(s.meta,response?.meta||{},s.species);s.localMeta.meta=s.meta;saveLocalMeta(s);await archive.putMeta(scope,s.localMeta);}if(acked&&!oversized&&!s.migrationRetry)s.error='';notice(s);}catch(e){s.error=e.message||String(e);notice(s);return;}first=false;
        }while(offset<rows.length);}}
      })().catch(e=>{for(const s of states.values())if(identityKey(s.identity)===key){s.error=e.message;notice(s);}}).finally(()=>flights.delete(key));flights.set(key,request);return track(request);
    }
    function pendingArrival(id,sp){return copy(state(id,sp)?.localMeta.pendingArrival||null);}
    function rememberArrival(id,sp,before){const s=state(id,sp);if(!s||!Number.isFinite(before?.lastSavedAt))return;const old=s.localMeta.pendingArrival;if(!old||before.lastSavedAt<old.lastSavedAt){s.localMeta.pendingArrival=copy(before);saveLocalMeta(s);}}
    function clearArrival(id,sp,from){const s=state(id,sp);if(s?.localMeta.pendingArrival?.lastSavedAt===from){delete s.localMeta.pendingArrival;saveLocalMeta(s);}}
    return {configure(next={}){config={...config,...next};if(next.archive)archive=next.archive;return this;},enable(id){if(identityKey(id))enabledIds.add(identityKey(id));},enabled:id=>enabledIds.has(identityKey(id)),ready:(id,sp)=>!!states.get(scopeKey(id,sp))?.started,hasScope:(id,sp)=>!!states.get(scopeKey(id,sp))?.started,needsLegacy:(id,sp)=>!state(id,sp)?.localMeta.localMigrated,hydrated:(id,sp)=>!!states.get(scopeKey(id,sp))?.hydrated,whenHydrated:(id,sp)=>states.get(scopeKey(id,sp))?.localReady||Promise.resolve(),pendingArrival,rememberArrival,clearArrival,prepare,read,write,more:(id,sp)=>{const s=state(id,sp);return s&&!s.loading?page(s,s.cursor):Promise.resolve(read(id,sp));},first:(id,sp)=>{const s=state(id,sp);return s?page(s,null):Promise.resolve(empty());},view:(id,sp)=>{const s=state(id,sp);return s?{loading:s.loading,hasMore:s.hasMore,error:s.error}:{loading:false,hasMore:false,error:''};},flush,async idle(){while(tasks.size)await Promise.all([...tasks]);await serial;}};
  };
}));
