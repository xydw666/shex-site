((root, factory) => {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SHEXXLettersCore = api;
})(typeof window !== 'undefined' ? window : globalThis, () => {
  'use strict';
  const LIMITS = Object.freeze({ summaries: 240, fullPapers: 20, fullPaperBytes: 2 * 1024 * 1024,
    mediaRefs: 64, imageUrls: 24, voiceRefs: 32, pendingJobs: 50 });
  const encoder = typeof TextEncoder === 'function' ? new TextEncoder() : null;
  const byteSize = value => encoder ? encoder.encode(JSON.stringify(value)).length : JSON.stringify(value).length * 3;
  const keyOf = (userId, dreamId) => JSON.stringify([String(userId || ''), String(dreamId || '')]);
  const paperKey = item => String(item?.paperId || '');
  function assertMetadata(value, seen = new WeakSet()) {
    if (typeof value === 'string' && /^(?:data:|blob:)/i.test(value)) throw new Error('binary URL cannot enter X-letter metadata cache');
    if (!value || typeof value !== 'object') return;
    if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer || (typeof Blob !== 'undefined' && value instanceof Blob)) {
      throw new Error('binary cannot enter X-letter metadata cache');
    }
    if (seen.has(value)) throw new Error('cyclic metadata cannot enter X-letter cache');
    seen.add(value);
    for (const child of Object.values(value)) assertMetadata(child, seen);
    seen.delete(value);
  }
  const comparePapers = (a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0)
    || paperKey(b).localeCompare(paperKey(a));

  function mergePage(previous = [], incoming = []) {
    const byId = new Map();
    for (const item of [...previous, ...incoming]) if (paperKey(item)) byId.set(paperKey(item), item);
    return [...byId.values()].sort(comparePapers);
  }

  function relationNode(item = {}) {
    if (!item.hiddenAt && !item.hidden) return { ...item };
    const { paperId, rootPaperId, parentPaperId, replyToPaperId, relationType, createdAt, quarterKey, bookId } = item;
    return { paperId, rootPaperId, parentPaperId, replyToPaperId, relationType, createdAt, quarterKey, bookId, hidden: true };
  }

  function quarterView(books = [], quarterKey) {
    return books.filter(book => !quarterKey || book.quarterKey === quarterKey)
      .map(({ bookId, dreamId, quarterKey: quarter, coverTemplateId, paperCount, lastPaperAt, lastReadPaperId }) =>
        ({ bookId, dreamId, quarterKey: quarter, coverTemplateId, paperCount, lastPaperAt, lastReadPaperId }));
  }

  function bookmarkView(bookmarks = [], paperId) {
    return bookmarks.filter(item => !paperId || item.paperId === paperId)
      .sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0));
  }

  function createCache({ revokeObjectURL = url => globalThis.URL?.revokeObjectURL?.(url), releaseAudio = audio => {
    if (audio && typeof audio.pause === 'function') audio.pause();
    if (audio && 'src' in audio) audio.src = '';
  } } = {}) {
    const partitions = new Map();
    function partition(userId, dreamId, create = false) {
      const key = keyOf(userId, dreamId);
      if (!partitions.has(key) && create) partitions.set(key, Object.fromEntries(
        ['summaries', 'fullPapers', 'mediaRefs', 'imageUrls', 'voiceRefs', 'pendingJobs'].map(name => [name, new Map()])));
      return partitions.get(key);
    }
    function release(bucket, value) {
      if (bucket === 'imageUrls') {
        const url = typeof value === 'string' ? value : value?.url;
        if (typeof url === 'string' && url.startsWith('blob:')) revokeObjectURL(url);
      }
      if (bucket === 'voiceRefs' && value?.audio) releaseAudio(value.audio);
    }
    function remove(map, bucket, key) {
      if (!map.has(key)) return;
      release(bucket, map.get(key));
      map.delete(key);
    }
    function put(userId, dreamId, bucket, id, value) {
      if (!userId || !dreamId || !id || !Object.hasOwn(LIMITS, bucket) || bucket === 'fullPaperBytes') throw new Error('Invalid X-letter cache key');
      if (bucket !== 'imageUrls' && bucket !== 'voiceRefs') assertMetadata(value);
      if (bucket === 'fullPapers' && byteSize(value) > LIMITS.fullPaperBytes) return false;
      const group = partition(userId, dreamId, true);
      const map = group[bucket];
      remove(map, bucket, id);
      map.set(id, value);
      while (map.size > LIMITS[bucket] || (bucket === 'fullPapers' && [...map.values()].reduce((sum, paper) => sum + byteSize(paper), 0) > LIMITS.fullPaperBytes)) {
        remove(map, bucket, map.keys().next().value);
      }
      return true;
    }
    function get(userId, dreamId, bucket, id) {
      const map = partition(userId, dreamId)?.[bucket];
      if (!map?.has(id)) return undefined;
      const value = map.get(id);
      map.delete(id); map.set(id, value);
      return value;
    }
    function counts(userId, dreamId) {
      const group = partition(userId, dreamId);
      return { summaries: group?.summaries.size || 0, fullPapers: group?.fullPapers.size || 0,
        fullPaperBytes: [...(group?.fullPapers.values() || [])].reduce((sum, item) => sum + byteSize(item), 0),
        mediaRefs: group?.mediaRefs.size || 0, imageUrls: group?.imageUrls.size || 0,
        voiceRefs: group?.voiceRefs.size || 0, pendingJobs: group?.pendingJobs.size || 0 };
    }
    function clearAccount(userId) {
      for (const [key, group] of partitions) {
        if (JSON.parse(key)[0] !== String(userId)) continue;
        for (const bucket of Object.keys(group)) for (const id of [...group[bucket].keys()]) remove(group[bucket], bucket, id);
        partitions.delete(key);
      }
    }
    return Object.freeze({ put, get, counts, clearAccount });
  }
  return Object.freeze({ LIMITS, mergePage, relationNode, quarterView, bookmarkView, createCache });
});
