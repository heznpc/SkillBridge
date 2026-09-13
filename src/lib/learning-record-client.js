// @ts-check
/** A small record interface shared by panels, independent of the page object. */
/* global module */
(function () {
  'use strict';
  /** @typedef {import('../types/learning-records').Collection} Collection */
  /** @typedef {import('../types/learning-records').Snapshot} Snapshot */
  /** @typedef {import('../types/learning-records').Operation} Operation */
  /**
   * @param {{send: (request: import('../types/learning-records').Request) => Promise<import('../types/learning-records').Response>, makeId?: () => string}} options
   */
  function createClient({ send, makeId = () => crypto.randomUUID() }) {
    /** @type {Map<Collection, Snapshot>} */
    const snapshots = new Map();
    /** @type {Map<Collection, Set<(snapshot: Snapshot) => void>>} */
    const listeners = new Map();
    /** @param {(snapshot: Snapshot) => void} listener @param {Snapshot} snapshot */
    function notify(listener, snapshot) {
      try {
        listener(snapshot);
      } catch (error) {
        // The mutation is already durable. A view error must not ask the
        // caller to retry that mutation or prevent other views from updating.
        console.warn('[SkillBridge] Learning record view failed:', error);
      }
    }
    /** @param {Collection} collection @param {Operation} operation */
    async function request(collection, operation) {
      const requestId = makeId();
      const response = await send({ type: 'LEARNING_RECORDS', collection, requestId, ...operation });
      if (!response || response.requestId !== requestId)
        throw new Error('Learning record acknowledgement was lost. Reload before retrying');
      if (!response.ok) throw Object.assign(new Error(response.error), { code: response.code });
      if (!Array.isArray(response.records) || !Number.isSafeInteger(response.version))
        throw new Error('Invalid learning record response');
      if (response.version >= (snapshots.get(collection)?.version ?? -1)) {
        snapshots.set(collection, response);
        for (const listener of listeners.get(collection) || []) notify(listener, response);
      }
      return response;
    }
    /** @param {Collection} collection @param {(snapshot: Snapshot) => void} listener */
    function subscribe(collection, listener) {
      let set = listeners.get(collection);
      if (!set) {
        set = new Set();
        listeners.set(collection, set);
      }
      set.add(listener);
      const current = snapshots.get(collection);
      if (current) notify(listener, current);
      return () => {
        set.delete(listener);
      };
    }
    return {
      request,
      subscribe,
      /** @param {Collection} collection */
      refresh: (collection) => request(collection, { operation: 'list' }),
    };
  }
  const api = { createClient };
  Object.assign(globalThis, { SB_LEARNING_RECORD_CLIENT: api });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
