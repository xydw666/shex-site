(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SHEXSystemQuestionCards = api;
  if (root && root.document) root.document.addEventListener('shex:auth-change', function () { api.clear(); });
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  function createStore(options) {
    options = options || {};
    var now = options.now || Date.now, entries = new Map(), epoch = 0, sequence = 0, owner = '';
    function clear() { entries.clear(); epoch++; owner = ''; }
    function key(userId, conversationKey) { return JSON.stringify([userId, conversationKey]); }
    function capture(userId, conversationKey, requestId) {
      if (!userId || !conversationKey || !requestId) return null;
      if (owner !== userId) { clear(); owner = userId; }
      var token = { owner: userId, conversationKey: conversationKey, requestId: requestId, epoch: epoch, sequence: ++sequence };
      var id = key(userId, conversationKey);
      entries.delete(id);
      entries.set(id, { token: token, at: now(), cards: [] });
      while (entries.size > 32) entries.delete(entries.keys().next().value);
      return token;
    }
    function remember(token, response, currentOwner) {
      if (!token || token.epoch !== epoch || token.owner !== owner || token.owner !== currentOwner) return false;
      var entry = entries.get(key(token.owner, token.conversationKey));
      if (!entry || entry.token.sequence !== token.sequence || !response || !response.ok) return false;
      if (response.requestId !== token.requestId || response.conversationKey !== token.conversationKey) return false;
      var data = response.systemQuestionCards;
      if (!data || data.v !== 1 || !Array.isArray(data.cards) || data.cards.length > 64) return false;
      var seen = new Set(), characters = 0, cards = [];
      for (var i = 0; i < data.cards.length; i++) {
        var line = data.cards[i];
        if (typeof line !== 'string' || !line.trim() || line.length > 1200) return false;
        characters += line.length;
        if (characters > 4096) return false;
        if (!seen.has(line)) { seen.add(line); cards.push(line); }
      }
      entry.cards = cards;
      entry.at = now();
      return true;
    }
    function read(userId, conversationKey) {
      if (!userId || userId !== owner) return [];
      var id = key(userId, conversationKey), entry = entries.get(id);
      if (!entry) return [];
      if (now() - entry.at > 10 * 60 * 1000) { entries.delete(id); return []; }
      return entry.cards.slice();
    }
    return { capture: capture, remember: remember, read: read, clear: clear };
  }
  var api = createStore();
  api.createStore = createStore;
  return api;
});
