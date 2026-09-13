// @ts-check
/** One service-worker queue owns every read/modify/write of study records. */
/* global module */
(function () {
  'use strict';
  /** @typedef {import('../types/learning-records').RecordData} RecordData */
  /** @typedef {import('../types/learning-records').Request} Request */
  /** @typedef {import('../types/learning-records').Collection} Collection */
  const KEYS = { reports: 'sb_term_reports', bookmarks: 'sb_bookmarks', notes: 'sb_notes' };
  const META_KEY = 'sb_learning_record_meta';
  const BACKUP_KEY = 'sb_learning_record_legacy_backup';

  /** @param {unknown} value @returns {value is RecordData} */
  function isRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }
  /** @param {string} code @param {string} message */
  function failure(code, message) {
    return Object.assign(new Error(message), { code });
  }
  /** @param {unknown} raw @returns {Request} */
  function parseRequest(raw) {
    if (!isRecord(raw) || raw.type !== 'LEARNING_RECORDS' || !Object.hasOwn(KEYS, String(raw.collection))) {
      throw failure('INVALID', 'Invalid learning record request');
    }
    if (typeof raw.requestId !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(raw.requestId)) {
      throw failure('INVALID', 'A stable request identifier is required');
    }
    if (raw.operation === 'create' && isRecord(raw.record)) {
      validateData(/** @type {Collection} */ (raw.collection), raw.record);
    } else if (raw.operation === 'update' || raw.operation === 'delete') {
      if (
        typeof raw.recordId !== 'string' ||
        !Number.isSafeInteger(raw.expectedRevision) ||
        Number(raw.expectedRevision) < 1
      ) {
        throw failure('INVALID', 'A record identifier and revision are required');
      }
      if (raw.operation === 'update' && !isRecord(raw.patch)) throw failure('INVALID', 'Invalid record patch');
    } else if (raw.operation !== 'list') throw failure('INVALID', 'Unknown record operation');
    return /** @type {Request} */ (raw);
  }
  /** @param {Collection} collection @param {RecordData} record */
  function validateData(collection, record) {
    for (const key of [
      'url',
      'title',
      'text',
      'correction',
      'originalText',
      'translatedText',
      'selectedText',
      'lang',
    ]) {
      if (record[key] != null && typeof record[key] !== 'string') throw failure('INVALID', `Invalid ${key}`);
      if (typeof record[key] === 'string' && record[key].length > 50000) throw failure('INVALID', `${key} is too long`);
    }
    if (typeof record.url !== 'string' || !/^https?:\/\//i.test(record.url))
      throw failure('INVALID', 'A lesson URL is required');
    if (collection === 'notes' && !record.text?.trim()) throw failure('INVALID', 'A note cannot be empty');
    if (collection === 'bookmarks' && (!Number.isFinite(record.scrollY) || Number(record.scrollY) < 0)) {
      throw failure('INVALID', 'Invalid reading position');
    }
    if (
      collection === 'reports' &&
      (!record.translatedText?.trim() ||
        !['selection', 'manual'].includes(record.capture || '') ||
        !['positive', 'negative'].includes(record.signal || ''))
    ) {
      throw failure('INVALID', 'Invalid translation feedback');
    }
    if (record.correctionStatus != null && !['applied', 'reverted'].includes(record.correctionStatus))
      throw failure('INVALID', 'Invalid correction status');
    if (
      record.correctionStatus === 'applied' &&
      (record.capture !== 'selection' ||
        !record.originalText?.trim() ||
        !record.correction?.trim() ||
        !record.lang ||
        record.lang === 'en')
    ) {
      throw failure('INVALID', 'Only a reviewed source and language pair can be applied');
    }
  }

  /**
   * @param {import('../types/learning-records').StorageAdapter} storage
   * @param {import('../types/learning-records').RecordStoreOptions} [options]
   */
  function createStore(
    storage,
    { makeId = () => crypto.randomUUID(), normalize = (_collection, rows) => rows, limit = 200 } = {},
  ) {
    let tail = Promise.resolve();
    /** @param {Request} request @returns {Promise<import('../types/learning-records').Snapshot>} */
    async function execute(request) {
      const key = KEYS[request.collection];
      const state = await storage.get([key, META_KEY, BACKUP_KEY]);
      const raw = state[key];
      if (
        raw != null &&
        !Array.isArray(raw) &&
        !(request.collection === 'reports' && isRecord(raw) && Array.isArray(raw.reports))
      ) {
        throw failure('INVALID_STORAGE', 'Stored records need recovery; they were not overwritten');
      }
      const rows = Array.isArray(raw) ? raw : isRecord(raw) && Array.isArray(raw.reports) ? raw.reports : [];
      const understood = rows.filter(isRecord);
      let records = normalize(request.collection, understood).map((record) => {
        // A newer feedback schema remains opaque to this version.
        if (request.collection === 'reports' && record.reportSchemaVersion != null && record.reportSchemaVersion !== 1)
          return record;
        return { ...record, recordId: record.recordId || makeId(), revision: record.revision || 1 };
      });
      const previousMeta = isRecord(state[META_KEY]) ? state[META_KEY] : {};
      const meta = /** @type {import('../types/learning-records').StoreMeta} */ ({
        versions: isRecord(previousMeta.versions) ? { ...previousMeta.versions } : {},
        receipts: Array.isArray(previousMeta.receipts) ? previousMeta.receipts.slice(-64) : [],
      });
      const migration = JSON.stringify(raw ?? []) !== JSON.stringify(records);
      const signature = JSON.stringify(request);
      const receipt = meta.receipts.find((item) => item.requestId === request.requestId);
      if (receipt && receipt.signature !== signature) throw failure('INVALID', 'Request identifier already used');
      let record = receipt ? records.find((row) => row.recordId === receipt.recordId) || null : null;
      let changed = false;
      if (!receipt && request.operation === 'create') {
        if (records.length >= limit)
          throw failure('LIMIT', 'Record limit reached; export or remove a record before adding another');
        // Concurrent creation of a note/bookmark for one lesson must never
        // replace text/position the caller has not read.
        if (
          request.collection !== 'reports' &&
          records.some((row) =>
            request.record.id ? row.id === request.record.id : !row.id && row.url === request.record.url,
          )
        ) {
          throw failure('CONFLICT', 'This lesson was saved in another tab. Reload it before editing');
        }
        record = { ...request.record, recordId: makeId(), revision: 1 };
        records.unshift(record);
        changed = true;
      } else if (!receipt && (request.operation === 'update' || request.operation === 'delete')) {
        const index = records.findIndex((row) => row.recordId === request.recordId);
        const previous = records[index];
        if (!previous || previous.revision !== request.expectedRevision)
          throw failure('CONFLICT', 'This record changed in another tab. Your edit has not overwritten it');
        if (request.collection === 'reports' && previous.reportSchemaVersion !== 1)
          throw failure('FUTURE_SCHEMA', 'This record belongs to a newer version');
        if (request.operation === 'delete') records.splice(index, 1);
        else {
          record = { ...previous, ...request.patch, recordId: previous.recordId, revision: previous.revision + 1 };
          validateData(request.collection, record);
          if (request.collection === 'reports') {
            if (
              request.patch.correction !== undefined &&
              request.patch.correction !== previous.correction &&
              previous.correctionStatus === 'applied'
            ) {
              record.correctionStatus = 'reverted';
            }
            if (record.correctionStatus && record.correctionStatus !== previous.correctionStatus) {
              const now = Date.now();
              record.correctionAppliedAt = now;
              record.correctionHistory = [
                ...(Array.isArray(previous.correctionHistory) ? previous.correctionHistory : []),
                { action: record.correctionStatus, text: record.correction, at: now },
              ];
              if (record.correctionStatus === 'applied') {
                records = records.map((other, otherIndex) => {
                  if (
                    otherIndex === index ||
                    other.correctionStatus !== 'applied' ||
                    other.originalText?.trim() !== record?.originalText?.trim() ||
                    other.lang !== record?.lang
                  )
                    return other;
                  return {
                    ...other,
                    correctionStatus: 'reverted',
                    revision: Number(other.revision) + 1,
                    correctionHistory: [
                      ...(Array.isArray(other.correctionHistory) ? other.correctionHistory : []),
                      { action: 'replaced', at: now },
                    ],
                  };
                });
              }
            }
          }

          records.splice(index, 1);
          records.unshift(record);
        }
        changed = true;
      }
      if (migration || changed) {
        meta.versions[request.collection] = (Number(meta.versions[request.collection]) || 0) + 1;
        if (changed)
          meta.receipts.push({ requestId: request.requestId, signature, recordId: record?.recordId || null });
        meta.receipts = meta.receipts.slice(-64);
        /** @type {Record<string, unknown>} */
        const write = { [key]: records, [META_KEY]: meta };
        const backup = isRecord(state[BACKUP_KEY]) ? state[BACKUP_KEY] : {};
        if (migration && raw != null && !Object.hasOwn(backup, request.collection)) {
          write[BACKUP_KEY] = { ...backup, [request.collection]: { savedAt: Date.now(), records: raw } };
        }
        // The response is sent only once this durable write has completed.
        await storage.set(write);
      }
      return { records, record, version: Number(meta.versions[request.collection]) || 0 };
    }
    /** @param {unknown} raw @returns {Promise<import('../types/learning-records').Response>} */
    function dispatch(raw) {
      const job = tail.then(async () => {
        try {
          const request = parseRequest(raw);
          return { ok: /** @type {const} */ (true), requestId: request.requestId, ...(await execute(request)) };
        } catch (error) {
          const err = /** @type {Error & {code?: string}} */ (error);
          return {
            ok: /** @type {const} */ (false),
            requestId: isRecord(raw) && typeof raw.requestId === 'string' ? raw.requestId : '',
            code: err.code || 'STORAGE',
            error: err.message || 'Could not save learning records',
          };
        }
      });
      tail = job.then(
        () => undefined,
        () => undefined,
      );
      return job;
    }
    return { dispatch };
  }
  const api = { createStore, parseRequest, KEYS, META_KEY };
  Object.assign(globalThis, { SB_LEARNING_RECORDS: api });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
