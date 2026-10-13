/** Engine-independent matching. Descriptors and observations contain no prompts. */
/* global module */
(function () {
  'use strict';

  const settingsTrackers = new WeakMap();

  /** One lightweight listener per content context; no stored credentials or text. */
  function settingsRevision(event) {
    if (!event?.addListener) return 0;
    if (!settingsTrackers.has(event)) {
      const tracker = { revision: 0 };
      event.addListener((changes, area) => {
        if (area !== 'local') return;
        if (
          Object.keys(changes).some((key) => key === 'targetLanguage' || /^sb_(ai_|local_|refine_|engine_)/.test(key))
        ) {
          tracker.revision++;
        }
      });
      settingsTrackers.set(event, tracker);
    }
    return settingsTrackers.get(event).revision;
  }

  function freezeCopy(value) {
    if (Array.isArray(value)) return Object.freeze(value.map(freezeCopy));
    if (value && typeof value === 'object') {
      return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, freezeCopy(item)])));
    }
    return value;
  }

  function languageMatches(language, range) {
    const tag = String(language || '').replace(/_/g, '-').toLowerCase();
    const pattern = String(range || '').replace(/_/g, '-').toLowerCase();
    if (!tag || !pattern) return false;
    if (pattern === '*') return true;
    // Region/script fallback is explicit. Knowing zh-CN never implies zh-TW.
    if (pattern.endsWith('-*')) return tag === pattern.slice(0, -2) || tag.startsWith(pattern.slice(0, -1));
    return tag === pattern;
  }

  function matchEngine(profile, request, environment = {}) {
    const blocked = [];
    const required = [];
    const unknown = [];
    const operation = Object.hasOwn(profile.operations, request.task) ? profile.operations[request.task] : null;
    const observation = environment.engines?.[profile.id] || {};
    if (!operation) blocked.push('task-unsupported');
    if (!request.sourceLang || !request.targetLang) blocked.push('language-missing');
    if (operation) {
      const languages = observation.operations?.[request.task] || operation;
      for (const [field, key] of [
        ['sourceLang', 'source'],
        ['targetLang', 'target'],
      ]) {
        const ranges = languages[key];
        if (!Array.isArray(ranges) && !Array.isArray(languages.pairs)) unknown.push(`${key}-language-unverified`);
        else if (!Array.isArray(ranges)) continue;
        else if (!ranges.some((range) => languageMatches(request[field], range))) blocked.push(`${key}-unsupported`);
      }
      if (Array.isArray(languages.pairs)) {
        const supported = languages.pairs.some(
          (pair) =>
            languageMatches(request.sourceLang, pair.source) && languageMatches(request.targetLang, pair.target),
        );
        if (!supported) blocked.push('language-pair-unsupported');
      }
    }
    if (profile.location === 'remote' && environment.online === false) blocked.push('offline');
    if (observation.allowed === false) blocked.push('policy-blocked');
    if (observation.available === false) blocked.push('device-unavailable');
    else if (observation.available !== true) unknown.push('availability-unverified');
    if (profile.permission) {
      if (observation.permission === 'denied') blocked.push('permission-denied');
      else if (observation.permission === 'required') required.push('permission-required');
      else if (observation.permission !== 'granted') required.push('permission-unverified');
    }
    if (observation.setup === 'required') required.push('setup-required');
    if (observation.model === 'downloadable' || observation.model === 'downloading') required.push('model-not-ready');
    if (observation.model === 'unavailable') blocked.push('model-unavailable');
    for (const feature of profile.features || []) {
      const supported = observation.features?.[feature] ?? environment.features?.[feature];
      if (supported === false) blocked.push(`feature-unavailable:${feature}`);
      else if (supported !== true) unknown.push(`feature-unverified:${feature}`);
    }
    if (profile.minMemoryGB) {
      if (!Number.isFinite(environment.memoryGB)) unknown.push('memory-unverified');
      else if (environment.memoryGB < profile.minMemoryGB) blocked.push('insufficient-memory');
    }
    const status =
      blocked.length ? 'blocked' : required.length ? 'needs-setup' : unknown.length ? 'unverified' : 'ready';
    return freezeCopy({
      id: profile.id,
      location: profile.location,
      status,
      // An unverified existing engine can still be tried by explicit selection.
      // This is never an automatic fallback or a quality guarantee.
      canAttempt: blocked.length === 0 && required.length === 0,
      reasons: [...blocked, ...required, ...unknown],
    });
  }

  /**
   * Register each installed adapter with operations keyed by task. An operation
   * declares source/target language ranges, exact pairs, or leaves support
   * unknown. Optional inspect(request) returns fresh readiness and per-task
   * language evidence for the configured model. It must not start inference.
   * Provider settings use sb_engine_* keys so changes invalidate pending work.
   * Existing sb_ai_*, sb_local_* and sb_refine_* keys remain supported.
   */
  class EngineRegistry {
    constructor() {
      this._entries = new Map();
      this.revision = 0;
    }

    register(profile, adapter) {
      if (!profile?.id || profile.id === 'off' || !profile.operations || !adapter) {
        throw new Error('An engine requires an id, operations and adapter');
      }
      if (this._entries.has(profile.id)) throw new Error(`Engine already registered: ${profile.id}`);
      this._entries.set(profile.id, { profile: freezeCopy(profile), adapter });
      this.revision++;
    }

    get(id) {
      return this._entries.get(id)?.adapter || null;
    }

    async inspect(request) {
      const snapshot = freezeCopy(request);
      const observations = await Promise.all(
        [...this._entries.entries()].map(async ([id, { adapter }]) => {
          if (typeof adapter.inspect !== 'function') return [id, {}];
          let timer;
          try {
            // inspect must only check availability; never create/download a
            // model, request permission, authenticate or transmit course text.
            const observation = await Promise.race([
              Promise.resolve().then(() => adapter.inspect(snapshot)),
              new Promise((resolve) => {
                timer = setTimeout(() => resolve({}), 1500);
              }),
            ]);
            return [id, freezeCopy(observation || {})];
          } catch {
            return [id, {}];
          } finally {
            clearTimeout(timer);
          }
        }),
      );
      return Object.fromEntries(observations);
    }

    match(request, environment = {}) {
      const candidates = [...this._entries.values()].map(({ profile }) => matchEngine(profile, request, environment));
      const selected = candidates.find((candidate) => candidate.id === request.selectedEngine) || null;
      const selectionReason =
        request.selectedEngine === 'off' ? 'disabled' : request.selectedEngine && !selected ? 'not-registered' : null;
      return freezeCopy({ request, candidates, selected, selectionReason });
    }
  }

  const api = { EngineRegistry, languageMatches, matchEngine, settingsRevision };
  globalThis.SB_ENGINE_MATCHER = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
