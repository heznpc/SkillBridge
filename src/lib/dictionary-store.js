/** Language-owned dictionary snapshots; only in-flight loads are retained. */
/* global module */
(function () {
  'use strict';

  const EMPTY_ENTRIES = Object.freeze({});

  function emptySnapshot(language = null) {
    return Object.freeze({
      language,
      entries: EMPTY_ENTRIES,
      lowerEntries: EMPTY_ENTRIES,
      protectedTerms: EMPTY_ENTRIES,
    });
  }

  function createSnapshot(language, data) {
    const entries = {};
    const lowerEntries = {};
    const protectedTerms = {};
    for (const [section, values] of Object.entries(data)) {
      if (section === '_meta' || !values || typeof values !== 'object') continue;
      if (section === '_protected') {
        for (const [term, variants] of Object.entries(values)) {
          if (Array.isArray(variants)) protectedTerms[term] = Object.freeze([...variants]);
        }
        continue;
      }
      for (const [source, target] of Object.entries(values)) {
        if (typeof target === 'string') entries[source] = target;
      }
    }
    for (const [source, target] of Object.entries(entries)) lowerEntries[source.toLowerCase()] = target;
    return Object.freeze({
      language,
      entries: Object.freeze(entries),
      lowerEntries: Object.freeze(lowerEntries),
      protectedTerms: Object.freeze(protectedTerms),
    });
  }

  class DictionaryStore {
    constructor({ load }) {
      this._load = load;
      this._pending = new Map();
    }

    load(language) {
      if (this._pending.has(language)) return this._pending.get(language);
      // Defer the loader so synchronous errors also release the pending entry.
      const pending = Promise.resolve()
        .then(() => this._load(language))
        .then((data) => (data ? createSnapshot(language, data) : emptySnapshot(language)))
        .finally(() => {
          if (this._pending.get(language) === pending) this._pending.delete(language);
        });
      this._pending.set(language, pending);
      return pending;
    }
  }

  const api = { DictionaryStore, emptySnapshot };
  globalThis.SB_DICTIONARY_STORE = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
